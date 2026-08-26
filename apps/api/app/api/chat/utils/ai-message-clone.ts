import { AIMessage } from '@langchain/core/messages';
import type { MessageStructure } from '@langchain/core/messages';

type AiMessageCloneOptions<Structure extends MessageStructure = MessageStructure> = {
  readonly content?: AIMessage<Structure>['content'];
  readonly id?: string;
  readonly name?: AIMessage<Structure>['name'];
  readonly toolCalls?: AIMessage<Structure>['tool_calls'];
  readonly invalidToolCalls?: AIMessage<Structure>['invalid_tool_calls'];
  readonly additionalKwargs?: AIMessage<Structure>['additional_kwargs'];
  readonly responseMetadata?: AIMessage<Structure>['response_metadata'];
  readonly usageMetadata?: AIMessage<Structure>['usage_metadata'];
};

const hasOwn = (value: Record<PropertyKey, unknown>, key: PropertyKey): boolean => Object.hasOwn(value, key);

function responseMetadataForContent<Structure extends MessageStructure>(
  content: AIMessage<Structure>['content'],
  responseMetadata: AIMessage<Structure>['response_metadata'],
): AIMessage<Structure>['response_metadata'] {
  const responseMetadataRecord = responseMetadata as Record<string, unknown>;
  if (Array.isArray(content) || responseMetadataRecord['output_version'] !== 'v1') {
    return responseMetadata;
  }

  const next = { ...responseMetadataRecord };
  delete next['output_version'];
  return next as AIMessage<Structure>['response_metadata'];
}

/**
 * Rebuilds an AIMessage while preserving provider-native replay state by
 * default. Use explicit override properties only for fields that intentionally
 * change.
 */
export function cloneAiMessage<Structure extends MessageStructure>(
  message: AIMessage<Structure>,
  options: AiMessageCloneOptions<Structure> = {},
): AIMessage<Structure> {
  const optionRecord = options as Record<PropertyKey, unknown>;
  const content = hasOwn(optionRecord, 'content') ? options.content! : message.content;
  const rawResponseMetadata = hasOwn(optionRecord, 'responseMetadata')
    ? (options.responseMetadata ?? {})
    : message.response_metadata;
  const responseMetadata = responseMetadataForContent(content, rawResponseMetadata);

  return new AIMessage<Structure>({
    content,
    id: hasOwn(optionRecord, 'id') ? options.id : message.id,
    name: hasOwn(optionRecord, 'name') ? options.name : message.name,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
    tool_calls: hasOwn(optionRecord, 'toolCalls') ? options.toolCalls : message.tool_calls,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
    invalid_tool_calls: hasOwn(optionRecord, 'invalidToolCalls')
      ? options.invalidToolCalls
      : message.invalid_tool_calls,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
    additional_kwargs: hasOwn(optionRecord, 'additionalKwargs') ? options.additionalKwargs : message.additional_kwargs,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
    response_metadata: responseMetadata,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
    usage_metadata: hasOwn(optionRecord, 'usageMetadata') ? options.usageMetadata : message.usage_metadata,
  });
}
