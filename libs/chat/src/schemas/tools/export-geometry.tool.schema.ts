import { z } from 'zod';
import { fileExtensions } from '@taucad/types/constants';

const firstGeometryExportExtension = fileExtensions[0];
if (firstGeometryExportExtension === undefined) {
  throw new Error('@taucad/types fileExtensions unexpectedly empty — cannot define export_geometry format schema.');
}

/**
 * Canonical export format enum (all extensions with a known MIME type).
 * @public
 */
export const exportGeometryFormatSchema = z.enum([firstGeometryExportExtension, ...fileExtensions.slice(1)]);

/** @public */
export const exportGeometryInputSchema = z.object({
  targetFile: z
    .string()
    .describe(
      'Project-relative path to the geometry unit source file to export (same convention as read_file and get_kernel_result).',
    ),
  format: exportGeometryFormatSchema.describe(
    'Output file extension without a leading dot (e.g. glb, stl, step, stp, 3mf). Must be a format the active kernel can export.',
  ),
});

/** @public */
export const exportGeometryOutputSchema = z.object({
  format: exportGeometryFormatSchema.describe('The extension/format that was exported.'),
  files: z
    .array(
      z.object({
        name: z.string().describe('Producer-authored relative file name.'),
        artifactPath: z.string().describe('Project-relative path to the written artifact under .tau/artifacts/.'),
        mimeType: z.string().describe('MIME type of the exported file.'),
        byteLength: z.number().int().nonnegative().describe('Exported file size in bytes.'),
      }),
    )
    .min(1)
    .describe('Complete ordered export artifact set; the first file is the primary artifact.'),
});

/** @public */
export type ExportGeometryInput = z.infer<typeof exportGeometryInputSchema>;

/** @public */
export type ExportGeometryOutput = z.infer<typeof exportGeometryOutputSchema>;
