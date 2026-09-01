/**
 * Monaco loads basic language grammars asynchronously after certain models are created.
 * Await this after tests that touch `monaco.editor.createModel` so Vitest teardown
 * does not race dynamic imports in the editor bundle.
 */
export async function drainMonacoPostTestWork(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(() => {
      queueMicrotask(resolve);
    });
  });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 100);
  });
}
