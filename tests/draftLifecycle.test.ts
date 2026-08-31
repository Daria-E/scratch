import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveDraftEmptiness,
  saveDraftDocumentAs,
  type SaveDraftAsOperations,
} from "../src/lib/draftLifecycle";

function saveAsOperations(
  events: string[],
  overrides: Partial<SaveDraftAsOperations> = {},
): SaveDraftAsOperations {
  return {
    pickTarget: async () => "/x/target.md",
    flushDocument: async () => {
      events.push("flush");
    },
    persistDraft: async () => {
      events.push("persist");
      return [];
    },
    markDraftRetired: () => {
      events.push("retire");
    },
    adoptTarget: () => {
      events.push("adopt");
    },
    ...overrides,
  };
}

test("save-as persists the live buffer before retiring the draft", async () => {
  const events: string[] = [];

  const result = await saveDraftDocumentAs(saveAsOperations(events));

  assert.deepEqual(result, {
    outcome: "saved",
    target: "/x/target.md",
    failedAssets: [],
  });
  assert.deepEqual(events, ["flush", "persist", "retire", "adopt"]);
});

test("a cancelled dialog is a full no-op", async () => {
  const events: string[] = [];

  const result = await saveDraftDocumentAs(
    saveAsOperations(events, { pickTarget: async () => null }),
  );

  assert.deepEqual(result, { outcome: "cancelled" });
  assert.deepEqual(events, []);
});

test("a flush failure aborts before the draft is touched", async () => {
  const events: string[] = [];

  await assert.rejects(
    saveDraftDocumentAs(
      saveAsOperations(events, {
        flushDocument: async () => {
          events.push("flush-failed");
          throw new Error("write failed");
        },
      }),
    ),
    /write failed/,
  );
  assert.deepEqual(events, ["flush-failed"]);
});

test("a persist failure leaves the draft path unretired", async () => {
  const events: string[] = [];

  await assert.rejects(
    saveDraftDocumentAs(
      saveAsOperations(events, {
        persistDraft: async () => {
          events.push("persist-failed");
          throw new Error("save failed");
        },
      }),
    ),
    /save failed/,
  );
  assert.deepEqual(events, ["flush", "persist-failed"]);
});

test("no loaded editor skips the flush but keeps the persist ordering", async () => {
  const events: string[] = [];

  const result = await saveDraftDocumentAs(
    saveAsOperations(events, { flushDocument: null }),
  );

  assert.equal(result.outcome, "saved");
  assert.deepEqual(events, ["persist", "retire", "adopt"]);
});

test("failed asset names propagate to the result", async () => {
  const events: string[] = [];

  const result = await saveDraftDocumentAs(
    saveAsOperations(events, {
      persistDraft: async () => {
        events.push("persist");
        return ["a.png"];
      },
    }),
  );

  assert.deepEqual(result, {
    outcome: "saved",
    target: "/x/target.md",
    failedAssets: ["a.png"],
  });
});

test("the emptiness decision never trusts an unloaded controller", async () => {
  const result = await resolveDraftEmptiness(
    { contentLoaded: () => false, isEmpty: () => true },
    async () => false,
  );

  assert.equal(result, false);
});

test("a loaded controller wins over disk", async () => {
  let diskReads = 0;

  const result = await resolveDraftEmptiness(
    { contentLoaded: () => true, isEmpty: () => false },
    async () => {
      diskReads += 1;
      return true;
    },
  );

  assert.equal(result, false);
  assert.equal(diskReads, 0);
});

test("a null controller falls back to the disk answer", async () => {
  assert.equal(await resolveDraftEmptiness(null, async () => true), true);
  assert.equal(await resolveDraftEmptiness(null, async () => false), false);
});
