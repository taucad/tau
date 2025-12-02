import type { UIMessage } from 'ai';
import type { MyDataPart } from '#types/message-data.types.js';
import type { MyTools } from '#types/tool.types.js';
import type { MyMetadata } from '#types/message-metadata.types.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- AI SDK naming convention
export type MyUIMessage = UIMessage<MyMetadata, MyDataPart, MyTools>;
