import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { interrupt } from '@langchain/langgraph';
import { imageAnalysisInputSchema } from '@taucad/chat';
import type { ImageAnalysisOutput } from '@taucad/chat';

const imageAnalysisJsonSchema = z.toJSONSchema(imageAnalysisInputSchema);

export const imageAnalysisToolDefinition = {
  name: 'analyzeImage',
  description: 'Visually validate a CAD model against specific requirements.',
  schema: imageAnalysisJsonSchema,
} as const;

export const imageAnalysisTool = tool(async (args) => {
  const { screenshot } = interrupt<unknown, ImageAnalysisOutput>(args);
  const result: ImageAnalysisOutput = { screenshot, analysis: '' };
  return result;
}, imageAnalysisToolDefinition);
