import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { interrupt } from '@langchain/langgraph';

type ImageAnalysisResult = {
  screenshot: string;
};

type ScreenshotInterruptResult = { screenshot: string };

const imageAnalysisSchema = z.object({
  requirements: z.array(z.string()),
});
const imageAnalysisJsonSchema = z.toJSONSchema(imageAnalysisSchema);

export const imageAnalysisToolDefinition = {
  name: 'analyze_image',
  description: 'Visually validate a CAD model against specific requirements.',
  schema: imageAnalysisJsonSchema,
} as const;

export const imageAnalysisTool = tool(async (args) => {
  const { screenshot } = interrupt<unknown, ScreenshotInterruptResult>(args);
  const result: ImageAnalysisResult = { screenshot };
  return result;
}, imageAnalysisToolDefinition);
