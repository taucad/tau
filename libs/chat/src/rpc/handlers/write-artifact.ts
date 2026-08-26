import type { RpcFileSystem } from '#rpc/rpc-dependencies.js';
import type { ExportFile } from '@taucad/types';
import { isSafeRelativePath } from '@taucad/utils/path';

const artifactsDirectory = '.tau/artifacts';

/**
 * Slugify a source-file path so it can be embedded into an artifact filename
 * without colliding with directory separators or filesystem-reserved chars.
 * Path separators become `_`; any character outside `[a-zA-Z0-9._-]` becomes `_`.
 */
export function slugifyTargetFile(targetFile: string): string {
  return targetFile.replaceAll(/[/\\]/g, '_').replaceAll(/[^\w.-]/g, '_');
}

export type WrittenArtifactFile = {
  readonly name: string;
  readonly artifactPath: string;
  readonly mimeType: string;
  readonly byteLength: number;
};

export async function writeArtifactSet(
  options: {
    readonly toolCallId: string;
    readonly targetFile: string;
    readonly format: string;
    readonly files: readonly ExportFile[];
  },
  fileSystem: RpcFileSystem,
): Promise<WrittenArtifactFile[] | undefined> {
  if (options.files.length === 0) {
    return undefined;
  }

  const names = new Set<string>();
  for (const file of options.files) {
    if (!isSafeRelativePath(file.name) || names.has(file.name)) {
      return undefined;
    }
    names.add(file.name);
  }

  const directory = `${artifactsDirectory}/${options.toolCallId}__${slugifyTargetFile(options.targetFile)}-${options.format}`;
  const written = options.files.map((file) => ({
    name: file.name,
    artifactPath: `${directory}/${file.name}`,
    mimeType: file.mimeType,
    byteLength: file.bytes.byteLength,
  }));

  try {
    for (const [index, file] of options.files.entries()) {
      // oxlint-disable-next-line no-await-in-loop -- Artifact order and fail-fast behavior are part of the tool contract.
      await fileSystem.writeBinaryFile(written[index]!.artifactPath, file.bytes);
    }
    return written;
  } catch {
    return undefined;
  }
}
