import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_MATH_BINDINGS,
  blockMathShortcutKeys,
  blockMathShortcutLabel,
  inlineMathShortcutKeys,
  inlineMathShortcutLabel,
  mathShortcutAction,
  mathShortcutActionForSet,
  type KeyboardEventLike,
} from "../src/lib/mathShortcuts";

function event(
  overrides: Partial<KeyboardEventLike> = {},
): KeyboardEventLike {
  return {
    metaKey: false,
    ctrlKey: true,
    altKey: false,
    shiftKey: false,
    key: "m",
    code: "KeyM",
    ...overrides,
  };
}

test("primary bindings match only the exact modifier chords", () => {
  assert.equal(ACTIVE_MATH_BINDINGS, "primary");

  const cases: Array<[Partial<KeyboardEventLike>, string | null]> = [
    [{}, "inline-or-toggle"],
    [{ altKey: true }, "block"],
    [{ shiftKey: true }, null],
    [{ altKey: true, shiftKey: true }, null],
    [{ ctrlKey: false }, null],
    [{ ctrlKey: false, altKey: true }, null],
  ];

  for (const [overrides, expected] of cases) {
    assert.equal(mathShortcutAction(event(overrides)), expected);
  }
});

test("fallback bindings match only alt and alt-shift chords", () => {
  const cases: Array<[Partial<KeyboardEventLike>, string | null]> = [
    [{}, null],
    [{ altKey: true }, "inline-or-toggle"],
    [{ altKey: true, shiftKey: true }, "block"],
    [{ shiftKey: true }, null],
  ];

  for (const [overrides, expected] of cases) {
    assert.equal(
      mathShortcutActionForSet(event(overrides), "fallback"),
      expected,
    );
  }
});

test("physical KeyM matches non-Latin and option-key event shapes", () => {
  assert.equal(
    mathShortcutAction(event({ key: "צ", code: "KeyM" })),
    "inline-or-toggle",
  );
  assert.equal(
    mathShortcutAction(
      event({ key: "µ", code: "KeyM", metaKey: true, ctrlKey: false, altKey: true }),
    ),
    "block",
  );
});

test("labels and registry key parts derive from the active binding set", () => {
  assert.equal(inlineMathShortcutLabel(), "Ctrl+M");
  assert.equal(blockMathShortcutLabel(), "Ctrl+Alt+M");
  assert.deepEqual(inlineMathShortcutKeys(), ["Ctrl", "M"]);
  assert.deepEqual(blockMathShortcutKeys(), ["Ctrl", "Alt", "M"]);
});
