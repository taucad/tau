import type { ToolMessage } from '@langchain/core/messages';
import { toolName } from '@taucad/chat/constants';

export const persistedOutputOpenTag = '<persisted-output>';

export function isPersistedOutputEnvelope(content: string): boolean {
  return content.startsWith(persistedOutputOpenTag);
}

export function parseToolContent(content: string): unknown | undefined {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

export function serialiseToolMessageContent(message: ToolMessage): string {
  return typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isScreenshotResultContent(content: unknown): boolean {
  if (!isObject(content)) {
    return false;
  }

  return Array.isArray(content['images']);
}

export function hasScreenshotDataUrl(content: unknown): boolean {
  if (!isObject(content) || !Array.isArray(content['images'])) {
    return false;
  }

  return content['images'].some(
    (image) => isObject(image) && typeof image['dataUrl'] === 'string' && image['dataUrl'].startsWith('data:'),
  );
}

export function isScreenshotResultMessage(message: ToolMessage): boolean {
  if (message.name === toolName.screenshot) {
    return true;
  }

  if (typeof message.content !== 'string') {
    return false;
  }

  return isScreenshotResultContent(parseToolContent(message.content));
}

export function shouldPreserveToolResultForMedia(message: ToolMessage): boolean {
  if (message.name === toolName.screenshot) {
    return true;
  }

  if (typeof message.content !== 'string') {
    return false;
  }

  return hasScreenshotDataUrl(parseToolContent(message.content));
}
