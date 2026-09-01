---
name: adding-tools
description: Add new tools to the AI chat system. Use when adding a chat tool, creating tool schemas, wiring backend tool handlers, or building tool UI components.
---

# Adding New Tools to the Chat System

This guide documents the complete process for adding new tools that can be used by AI agents in the chat system.

## Architecture Overview

Tools follow a client-server RPC pattern via Socket.IO:

1. **Backend (API)**: Defines tool schema and uses `chatRpcService.sendRpcRequest()` to execute operations on the client via Socket.IO RPC
2. **Frontend (UI)**: RPC handlers execute the actual logic (filesystem, kernel, graphics) and return results via Socket.IO
3. **Schemas (libs/chat)**: Shared type definitions between frontend and backend

## Step-by-Step Process

### Step 1: Define Tool Schema (libs/chat)

Create a new file at `libs/chat/src/schemas/tools/<tool-name>.tool.schema.ts`:

```typescript
import { z } from 'zod';

export const myToolInputSchema = z.object({
  param1: z.string().describe('Description for the LLM'),
  param2: z.number().optional().describe('Optional parameter'),
});

export const myToolOutputSchema = z.object({
  result: z.string().describe('The result of the operation'),
  success: z.boolean().describe('Whether the operation succeeded'),
});

export type MyToolInput = z.infer<typeof myToolInputSchema>;
export type MyToolOutput = z.infer<typeof myToolOutputSchema>;
```

### Step 2: Add Tool Name Constant

Update `libs/chat/src/constants/tool.constants.ts`:

```typescript
export const toolName = {
  // ... existing tools ...
  myTool: 'my_tool',
} as const satisfies Record<string, string>;
```

### Step 3: Export from Package

Update `libs/chat/src/index.ts`:

```typescript
export * from '#schemas/tools/my-tool.tool.schema.js';
```

### Step 4: Add to Type Definitions

Update `libs/chat/src/types/tool.types.ts`:

```typescript
import type { MyToolInput, MyToolOutput } from '#schemas/tools/my-tool.tool.schema.js';

export type MyTools = InferUITools<{
  // ... existing tools ...
  [toolName.myTool]: AiTool<MyToolInput, MyToolOutput>;
}>;
```

### Step 5: Register in Message Schema

Update `libs/chat/src/schemas/message.schema.ts`:

```typescript
import { myToolInputSchema, myToolOutputSchema } from '#schemas/tools/my-tool.tool.schema.js';

const toolPartSchemas = [
  // ... existing tools ...
  ...createToolSchemas(toolName.myTool, myToolInputSchema, myToolOutputSchema),
];
```

### Step 5b: Register Strict Tool Inputs (interrupt healing)

Interrupted streams can persist partial tool inputs that no longer satisfy the per-tool schema. The API preprocess reads **`libs/chat/src/schemas/tool-input.registry.ts`** — add:

```typescript
my_tool: myToolInputSchema,
```

(Use the exported Zod schema from Step 1; keep catalog keys aligned with `toolName` string literals.)

### Step 6: Create Backend Tool Definition

Create `apps/api/app/api/tools/tools/tool-my-tool.ts`:

```typescript
import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { myToolInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, MyToolInput, MyToolOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const myToolDefinition = {
  name: toolName.myTool,
  description: `Detailed description for the LLM explaining when and how to use this tool.`,
  schema: myToolInputSchema,
} as const;

export const myTool: ChatTool<typeof myToolInputSchema, MyToolInput, MyToolOutput, typeof toolName.myTool> = tool(
  async (args, runtime: ToolRuntime) => {
    const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
    const { toolCallId } = runtime;

    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId,
      rpcName: rpcName.myRpc,
      args,
    });

    assertRpcSuccess(result, {
      toolName: toolName.myTool,
      toolCallId,
      clientErrorMessage: 'Failed to execute my tool',
    });

    return result;
  },
  myToolDefinition,
);
```

### Step 7: Register Backend Tool

Update `apps/api/app/api/tools/tool.service.ts`:

```typescript
import { myTool } from '#api/tools/tools/tool-my-tool.js';

const toolCategoryToTool = {
  // ... existing tools ...
  [toolName.myTool]: myTool,
} as const satisfies Partial<Record<ToolName, StructuredTool>>;

const toolNameFromToolCategory = {
  // ... existing tools ...
  [toolName.myTool]: toolCategoryToTool[toolName.myTool].name,
} as const satisfies Partial<Record<ToolName, string>>;
```

### Step 8: Add Tool to Agent

Update **`apps/api/app/api/chat/chat.service.ts`** (`cadTools` array) so the CAD agent receives the LangChain tool:

```typescript
const cadTools = [
  // ... existing tools ...
  tools.my_tool,
].filter((tool) => tool !== undefined);
```

If the tool uses `targetFile` (or similar fingerprinted inputs), add it to **`agent-safeguards.middleware.ts`** `targetFileTools` so identical repeated failures get one-shot remediation guidance.

### Step 9: Implement RPC Handler (if new RPC needed)

If your tool needs a new RPC (e.g., for a new client-side operation), add the RPC handler:

1. Add RPC name to `libs/chat/src/constants/rpc.constants.ts`
2. Add RPC schema to `libs/chat/src/schemas/rpc.schema.ts` using `defineRpc()`
3. Create handler at `libs/chat/src/rpc/handlers/handle-my-rpc.ts`
4. Register in `libs/chat/src/rpc/rpc-dispatcher.ts`
5. If the RPC depends on `RpcGraphicsClient` / CAD snapshot types, extend **`libs/chat/src/rpc/rpc-dependencies.ts`** accordingly
6. Add browser implementation in **`apps/ui/app/hooks/rpc-handlers.ts`**

Most tools reuse existing RPCs (e.g., `readFile`, `createFile`, `getKernelResult`, `captureObservations`).

**Browser adapter split:** operations that need the live CAD unit, kernel export/render, or viewer-adjacent work belong on **`RpcGraphicsClient`** (see `createBrowserGraphicsClient` in `rpc-handlers.ts`). Pure kernel compile/status without graphics should stay on **`RpcRuntimeClient`**. **`ensureGeometryUnit`** in `rpc-handlers.ts` is the canonical lazy-bootstrap when the LLM names a `targetFile` that may not have an open geometry unit yet.

### Step 10: Create UI Component

Create `apps/ui/app/routes/projects_.$id/chat-message-tool-my-tool.tsx`:

```typescript
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { MyUIMessage } from '@taucad/chat';
import type { MyToolOutput } from '@taucad/chat';

type Props = {
  part: Extract<MyUIMessage['parts'][number], { type: 'tool-my_tool' }>;
};

export function ChatMessageToolMyTool({ part }: Props): React.JSX.Element {
  const { state } = part;
  const output = part.output as MyToolOutput | undefined;

  if (state === 'input-streaming' || state === 'input-available') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span>Processing...</span>
      </div>
    );
  }

  if (state === 'output-error') {
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <XCircle className="size-4" />
        <span>Error: {part.errorText}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {output?.success ? (
        <CheckCircle className="size-4 text-success" />
      ) : (
        <XCircle className="size-4 text-destructive" />
      )}
      <span>{output?.result}</span>
    </div>
  );
}
```

### Step 11: Register UI Component

Update `apps/ui/app/routes/projects_.$id/chat-message.tsx`:

```typescript
import { ChatMessageToolMyTool } from './chat-message-tool-my-tool.js';

// In renderPart switch:
case 'tool-my_tool': {
  return <ChatMessageToolMyTool key={part.toolCallId} part={part} />;
}
```

### Step 12: Update System Prompt (if needed)

Update **`apps/api/app/api/chat/prompts/cad-agent.prompt.ts`** (static/dynamic CAD agent prompt builders) when the workflow or safety copy should mention the tool. Prefer terse references aligned with `<tool_usage_policy>` / `<workflow>` — duplicating full tool prose belongs in the LangChain **`description`** in Step 6.

### Step 13: Serialize Tool Parts (UI copy / compaction)

Extend **`apps/ui/app/utils/chat.utils.ts`** `toolSerializers` with an entry keyed by **`toolName.myTool`** so `serializePart`/`serializeMessage` stay exhaustive over `MyTools` (workspace enforces `{ [K in keyof MyTools]: ToolSerializer<K> }`).

### Step 14: Activity Summaries (optional)

If the tool should affect exploration-phase grouping or counts (e.g. research runs), review **`apps/ui/app/utils/assistant-message-activity.ts`** and related activity components.

## Testing

1. Run typecheck: `pnpm nx typecheck chat`
2. Run typecheck: `pnpm nx typecheck api`
3. Run typecheck: `pnpm nx typecheck ui`
4. Test the tool in the chat interface

## Common Patterns

### Async Operations with State Machines

For tools that need to wait for state machine transitions:

```typescript
await waitFor(machineRef, (state) => state.matches('ready') || state.matches('error'));
```

### Error Handling

**API tools:** after `chatRpcService.sendRpcRequest(...)`, validate the discriminated RPC result with **`assertRpcSuccess`** from `@taucad/chat/utils` (see existing tools under `apps/api/app/api/tools/tools/`). Failures surface as AI SDK **`output-error`** tool parts automatically — do not manually push tool outputs unless you are intentionally bypassing that path.

Handle transport / unexpected **`catch`** blocks by throwing or wrapping in a **`ToolRuntime`-visible** error consistent with LangChain conventions for that tool.

### File Operations

Use the file manager for file operations:

```typescript
const fileContent = await fileManager.readFile(path);
await fileManager.writeFile(path, content, { source: 'external' });
```

`useFileManager().readFile` returns **`Uint8Array`** (binary-safe); pair with **`downloadBlob`** from `@taucad/utils/file` for user downloads.

### Chat artifacts — `.tau/artifacts` + `writeArtifact`

When an RPC persists bytes for later UI download (e.g. fetched GLB snapshots, interchange exports):

1. Prefer **`libs/chat/src/rpc/handlers/write-artifact.ts`** **`writeArtifact({ toolCallId, targetFile, extension, bytes }, fileSystem)`** — canonical path **``.tau/artifacts/${toolCallId}__${slugifyTargetFile(targetFile)}.${ext}`**.
2. Return **`artifactPath`**, **`mimeType`**, and **`byteLength`** (or analogous) in the RPC success payload so the chat card can render size + type without re-reading disk.
3. On **Download**, the UI reads **`artifactPath`** via **`fileManager.readFile`**, wraps a **`Blob`**, and calls **`downloadBlob(blob, basename)`**.
4. Passing **`toolCallId`** into RPC args alongside LLM-visible fields keeps filenames deterministic across retries (mirror **`fetch_geometry`**’s `artifactId` pattern where applicable).
