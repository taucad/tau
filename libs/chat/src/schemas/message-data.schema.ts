import z from 'zod';

/**
 * Schema for custom data parts in UI messages.
 *
 * IMPORTANT: The explicit type annotation is required to ensure proper type resolution
 * during `tsc --build` with project references. Without it, `z.infer` in declaration
 * files may not fully resolve, causing `DataUIPart<MyDataPart>` to widen from
 * `{ type: 'data-test'; ... }` to `{ type: 'data-${string}'; ... }`, breaking
 * exhaustive switch statements in components like `chat-message.tsx`.
 */
export const dataPartSchema: z.ZodType<{ test: { exampleData: string } }> = z.object({
  test: z.object({
    exampleData: z.string(),
  }),
  // Add data parts here
});
