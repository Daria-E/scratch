export interface EditorDocumentState {
  sourceMode: boolean;
  sourceContent: string;
  richContent: string;
  richIsEmpty: boolean;
}

export function currentDocumentContent(state: EditorDocumentState): string {
  return state.sourceMode ? state.sourceContent : state.richContent;
}

export function currentDocumentIsEmpty(state: EditorDocumentState): boolean {
  return state.sourceMode
    ? state.sourceContent.trim() === ""
    : state.richIsEmpty;
}

export class DocumentSaveQueue {
  private tail: Promise<void> = Promise.resolve();

  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
