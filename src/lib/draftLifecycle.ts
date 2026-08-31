export interface SaveDraftAsOperations {
  pickTarget(): Promise<string | null>;
  flushDocument: (() => Promise<void>) | null;
  persistDraft(target: string): Promise<string[]>;
  markDraftRetired(): void;
  adoptTarget(target: string): void;
}

export type SaveDraftAsResult =
  | { outcome: "cancelled" }
  | { outcome: "saved"; target: string; failedAssets: string[] };

export async function saveDraftDocumentAs(
  operations: SaveDraftAsOperations,
): Promise<SaveDraftAsResult> {
  const target = await operations.pickTarget();
  if (!target) return { outcome: "cancelled" };

  if (operations.flushDocument) await operations.flushDocument();
  const failedAssets = await operations.persistDraft(target);
  operations.markDraftRetired();
  operations.adoptTarget(target);
  return { outcome: "saved", target, failedAssets };
}

export interface DocumentEmptinessSource {
  contentLoaded(): boolean;
  isEmpty(): boolean;
}

export async function resolveDraftEmptiness(
  controller: DocumentEmptinessSource | null,
  diskIsEmpty: () => Promise<boolean>,
): Promise<boolean> {
  if (controller?.contentLoaded()) return controller.isEmpty();
  return diskIsEmpty();
}
