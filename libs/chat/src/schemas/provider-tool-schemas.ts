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
 *
 * @public
 */
export const cadProviderFacingToolNames = [
  toolName.testModel,
  toolName.getKernelResult,
  toolName.exportGeometry,
  toolName.getParameters,
  toolName.applyParameterOperation,
  toolName.screenshot,
  toolName.editFile,
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
