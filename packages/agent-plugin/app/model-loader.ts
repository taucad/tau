import { tauViewerToolName } from '@taucad/mcp/viewer-protocol';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import { readTauViewerBytes } from '@taucad/mcp/viewer-read';
import type { Artifact } from '@taucad/runtime';

/** Calls one Tau tool and returns its structured result. */
export type CallTool = (name: string, args: Readonly<Record<string, unknown>>) => Promise<unknown>;

/**
 * Read a shown model through `app_read`, one reply-sized range at a time (blueprint D4, W9).
 *
 * @param callTool - The bridge's tool call.
 * @param model - The model `show_model` returned.
 * @param onProgress - Receives the bytes read so far.
 * @returns The model as the artifact the viewer draws.
 * @throws Error when a reply does not continue where the last one stopped, the size changes, or the assembled bytes
 *   are not the digest `show_model` gave.
 */
export const loadModel = async (
  callTool: CallTool,
  model: TauViewerModel,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Artifact> => {
  const bytes = await readTauViewerBytes({
    read: async (range) => callTool(tauViewerToolName.appRead, { modelId: model.id, ...range }),
    byteLength: model.byteLength,
    sha256: model.sha256,
    label: model.path,
    onProgress,
  });
  return model.mimeType === 'image/svg+xml'
    ? { mimeType: model.mimeType, content: new TextDecoder().decode(bytes) }
    : { mimeType: model.mimeType, content: bytes };
};
