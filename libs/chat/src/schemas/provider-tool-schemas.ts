import { z } from 'zod';
import type { ToolName, ToolSelection } from '#types/tool.types.js';
import { toolName } from '#constants/tool.constants.js';
import type { ToolPartType } from '#schemas/tool-input.registry.js';
import { toolInputSchemas } from '#schemas/tool-input.registry.js';
import type { ModelInputModality, ModelSupport } from '#types/model.types.js';
import { modelSupportsInput, modelSupportsTools } from '#types/model.types.js';

/**
 * CAD agent tools that are exposed to model providers through LangChain.
 *
 * Internal browser RPC schemas are intentionally
 * excluded: they are not serialized into provider function declarations.
 * The machine tools are admitted unconditionally: a host lists them only when a
 * machine is negotiated and granted, and a turn is offered only what its host
 * lists.
 *
 * @public
 */
export const cadProviderFacingToolNames = [
  toolName.testModel,
  toolName.evaluateModel,
  toolName.exportModel,
  toolName.getParameters,
  toolName.applyParameterOperation,
  toolName.screenshot,
  toolName.editFile,
  toolName.arrangeWorkbench,
  toolName.useSkill,
  toolName.readFile,
  toolName.listDirectory,
  toolName.createFile,
  toolName.deleteFile,
  toolName.grep,
  toolName.globSearch,
  toolName.webSearch,
  toolName.webBrowser,
  toolName.revisions,
  toolName.updateTodos,
  toolName.askQuestions,
  toolName.listMachines,
  toolName.getMachine,
  toolName.machineAction,
  toolName.stopMachine,
  toolName.getPrintProfiles,
  toolName.requestJob,
  toolName.checkJob,
] as const satisfies readonly ToolName[];

const requiredModelInputModalities: Partial<Record<ToolName, readonly ModelInputModality[]>> = {
  [toolName.screenshot]: ['image'],
};

/** @public */
export const filterProviderFacingToolNamesByModelSupport = ({
  toolNames,
  modelSupport,
}: {
  toolNames: readonly ToolName[];
  modelSupport?: ModelSupport;
}): ToolName[] => {
  if (modelSupport === undefined) {
    return [...toolNames];
  }

  if (!modelSupportsTools(modelSupport)) {
    return [];
  }

  return toolNames.filter((name) =>
    (requiredModelInputModalities[name] ?? []).every((modality) => modelSupportsInput(modelSupport, modality)),
  );
};

const normalizeTupleItems = (value: unknown): void => {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      normalizeTupleItems(item);
    }
    return;
  }
  const object = value as Record<string, unknown>;
  const { items } = object;
  if (Array.isArray(items)) {
    const tupleItems: unknown[] = items;
    const [first] = tupleItems;
    if (
      first === undefined ||
      object['additionalItems'] !== undefined ||
      tupleItems.some((item) => JSON.stringify(item) !== JSON.stringify(first))
    ) {
      throw new Error('Provider tool schema has a tuple that cannot use one items schema');
    }
    object['items'] = first;
    object['minItems'] = tupleItems.length;
    object['maxItems'] = tupleItems.length;
  }
  for (const child of Object.values(object)) {
    normalizeTupleItems(child);
  }
};

/**
 * Serialize one tool input schema exactly as the host puts it on the wire.
 *
 * Every provider-facing tool declaration goes through here, so the schema contract test observes
 * the same bytes Vertex, Anthropic and OpenAI receive. `io: 'input'` is what makes the wire shape
 * the flat, typeless side of a schema that narrows to a strict union on the way in.
 *
 * @param schema - A provider-facing tool input schema.
 * @returns Its draft-7 JSON Schema without the `$schema` dialect key providers reject.
 * @public
 *
 * @example <caption>Serializing the active toolbelt</caption>
 * ```typescript
 * import { getProviderFacingToolInputSchemas, toProviderToolJsonSchema } from '@taucad/chat/schemas';
 * import { toolMode } from '@taucad/chat/constants';
 *
 * const declarations = getProviderFacingToolInputSchemas({
 *   toolChoice: toolMode.auto,
 *   testingEnabled: false,
 * }).map((entry) => ({ name: entry.toolName, inputSchema: toProviderToolJsonSchema(entry.schema) }));
 * ```
 */
export const toProviderToolJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
  delete jsonSchema['$schema'];
  // Draft 7 tuple arrays are invalid in Draft 2020-12; homogeneous fixed arrays work on both provider dialects.
  normalizeTupleItems(jsonSchema);
  return jsonSchema;
};

/** @public */
export type ProviderFacingToolSchemaOptions = {
  toolChoice: ToolSelection;
  testingEnabled: boolean;
  modelSupport?: ModelSupport;
};

/** @public */
export type ProviderFacingToolSchemaEntry = {
  toolName: ToolName;
  toolPartType: ToolPartType;
  schema: (typeof toolInputSchemas)[ToolPartType];
};

/**
 * Resolve the provider-visible CAD tool input schemas for a request.
 *
 * This mirrors the `ChatService` tool assembly order while keeping the shared
 * chat package focused on names and schemas, not LangChain tool instances.
 *
 * @public
 */
export const getProviderFacingToolInputSchemas = ({
  toolChoice,
  testingEnabled,
  modelSupport,
}: ProviderFacingToolSchemaOptions): ProviderFacingToolSchemaEntry[] => {
  const selectedTools = Array.isArray(toolChoice) ? new Set<ToolName>(toolChoice) : undefined;
  const allowedTools = new Set(
    filterProviderFacingToolNamesByModelSupport({
      toolNames: cadProviderFacingToolNames,
      modelSupport,
    }),
  );

  return cadProviderFacingToolNames.flatMap((name) => {
    if (name === toolName.testModel && !testingEnabled) {
      return [];
    }

    if (!allowedTools.has(name)) {
      return [];
    }

    if (selectedTools && !selectedTools.has(name)) {
      return [];
    }

    const toolPartType = `tool-${name}` as const;
    return [{ toolName: name, toolPartType, schema: toolInputSchemas[toolPartType] }];
  });
};
