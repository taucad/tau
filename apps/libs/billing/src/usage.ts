export type UsageRecord = {
  id: string;
  date: Date;
  model: string;
  modelName: string;
  provider: string;
  projectId: string;
  projectName: string;
  chatId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  inputTokensCost: number;
  outputTokensCost: number;
  cacheReadTokensCost: number;
  cacheWriteTokensCost: number;
  totalCost: number;
};

type UsageData = Omit<
  UsageRecord,
  'date' | 'modelName' | 'provider' | 'projectId' | 'projectName' | 'chatId' | 'totalTokens'
>;
type UsageChat = {
  readonly id: string;
  readonly createdAt: number;
  readonly messages: ReadonlyArray<{
    readonly metadata?: { readonly createdAt?: number };
    readonly parts: ReadonlyArray<{ readonly type: string; readonly data?: unknown }>;
  }>;
};
export type UsageSource = {
  readonly project: { readonly manifest: { readonly id: string; readonly name: string } };
  readonly chats: readonly UsageChat[];
};
export type UsageModelResolver = (id: string) => {
  readonly name: string;
  readonly provider: { readonly name: string };
};

const usageStringFields = ['id', 'model'] as const satisfies ReadonlyArray<keyof UsageData>;
const usageNumberFields = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'inputTokensCost',
  'outputTokensCost',
  'cacheReadTokensCost',
  'cacheWriteTokensCost',
  'totalCost',
] as const satisfies ReadonlyArray<keyof UsageData>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isUsageData = (value: unknown): value is UsageData => {
  if (!isRecord(value)) {
    return false;
  }
  return (
    usageStringFields.every((field) => typeof value[field] === 'string') &&
    usageNumberFields.every((field) => typeof value[field] === 'number' && Number.isFinite(value[field]))
  );
};

/** Converts persisted chat usage parts into the route's display records. */
export const summarizeUsage = (sources: readonly UsageSource[], resolveModel: UsageModelResolver): UsageRecord[] => {
  const records: UsageRecord[] = [];
  for (const { project, chats } of sources) {
    for (const chat of chats) {
      for (const message of chat.messages) {
        for (const part of message.parts) {
          if (part.type !== 'data-usage' || !isUsageData(part.data)) {
            continue;
          }
          const { data } = part;
          const resolved = resolveModel(data.model);
          records.push({
            ...data,
            date: new Date(message.metadata?.createdAt ?? chat.createdAt),
            modelName: resolved.name,
            provider: resolved.provider.name,
            projectId: project.manifest.id,
            projectName: project.manifest.name,
            chatId: chat.id,
            totalTokens: data.inputTokens + data.outputTokens + data.cacheReadTokens + data.cacheWriteTokens,
          });
        }
      }
    }
  }
  return records.sort((a, b) => b.date.getTime() - a.date.getTime());
};
