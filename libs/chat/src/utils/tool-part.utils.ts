import type { ToolUIPart } from 'ai';
import type { MyMessagePart, MyToolPart } from '#types/message.types.js';
import type { MyTools } from '#types/tool.types.js';

/** @public */
export type MyDynamicToolPart = Extract<MyMessagePart, { type: 'dynamic-tool' }>;

/** @public */
export type MyAnyToolPart = MyToolPart | MyDynamicToolPart;

/**
 * Type guard that narrows a MyMessagePart to MyToolPart (any static tool-* part).
 * @public
 */
export function isToolPart(part: MyMessagePart): part is MyToolPart {
  return part.type.startsWith('tool-');
}

/**
 * Type guard that narrows a message part to an AI SDK dynamic tool part.
 * @public
 */
export function isDynamicToolPart(part: MyMessagePart): part is MyDynamicToolPart {
  return part.type === 'dynamic-tool';
}

/**
 * Type guard that accepts both registered static Tau tool parts and AI SDK dynamic tool parts.
 * @public
 */
export function isAnyToolPart(part: MyMessagePart): part is MyAnyToolPart {
  return isToolPart(part) || isDynamicToolPart(part);
}

/**
 * Returns the provider/model-facing tool name for static and dynamic tool parts.
 * @public
 */
export function getToolPartName<Name extends keyof MyTools>(part: ToolUIPart<Pick<MyTools, Name>>): Name;
/** @public */
export function getToolPartName(part: MyAnyToolPart): string;
/** @public */
export function getToolPartName(part: { readonly type: string; readonly toolName?: string }): string {
  return part.type === 'dynamic-tool' && part.toolName !== undefined ? part.toolName : part.type.slice('tool-'.length);
}
