import { findBuiltinExample } from '@taucad/tau-examples/builtin';
import { shareArtifactLimits } from '@taucad/share/artifact';
import type { ShareOpenedFile } from '@taucad/share/artifact';
import type {
  ShareProvider,
  ShareProviderContext,
  ShareProviderDescriptor,
  ShareResolveInput,
} from '@taucad/share/provider';
import { ShareError } from '@taucad/share/provider';
import type { ShareSnapshotFileRole } from '@taucad/share/snapshot';

export const builtinShareProviderDescriptor = {
  id: 'builtin',
  label: 'Builtin example',
  capabilities: ['project.resolve'],
} as const satisfies ShareProviderDescriptor;

const roleFor = (path: string, entryPath: string): ShareSnapshotFileRole => {
  if (path === entryPath) {
    return 'entry';
  }
  return path === 'tau.json' || path === 'package.json' || path.startsWith('.tau/parameters/')
    ? 'project-metadata'
    : 'kernel-dependency';
};

const sha256 = async (content: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const fetchBuiltinFiles = async (input: ShareResolveInput): Promise<readonly ShareOpenedFile[]> => {
  const { reference } = input.locator;
  if (input.locator.providerId !== builtinShareProviderDescriptor.id || !reference) {
    throw new ShareError('SHARE_LOCATOR_INVALID', 'The builtin example locator is malformed.');
  }
  const example = findBuiltinExample(reference);
  if (!example) {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'This builtin example does not exist.');
  }
  let totalBytes = 0;
  return Promise.all(
    example.assets.map(async (asset) => {
      input.signal?.throwIfAborted();
      let content: Uint8Array<ArrayBuffer>;
      try {
        content = await asset.load();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw error;
        }
        throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'The builtin example could not be loaded.');
      }
      input.signal?.throwIfAborted();
      if (content.byteLength > shareArtifactLimits.maxEntryBytes) {
        throw new ShareError('SHARE_ARTIFACT_LIMIT', 'A builtin example file exceeds the portable-share limit.');
      }
      totalBytes += content.byteLength;
      if (totalBytes > shareArtifactLimits.maxTotalBytes) {
        throw new ShareError('SHARE_ARTIFACT_LIMIT', 'The builtin example exceeds the portable-share limit.');
      }
      return { path: asset.path, content };
    }),
  );
};

const resolveBuiltin = async (input: ShareResolveInput, context: ShareProviderContext) => {
  const { reference } = input.locator;
  const example = reference ? findBuiltinExample(reference) : undefined;
  if (!example) {
    throw new ShareError('SHARE_PROVIDER_UNAVAILABLE', 'This builtin example does not exist.');
  }
  const files = await fetchBuiltinFiles(input);
  const snapshotFiles = await Promise.all(
    files.map(async (file) => ({
      ...file,
      sha256: await sha256(file.content),
      role: roleFor(file.path, example.manifest.assets.main.entryPath),
    })),
  );
  const packed = await context.artifactCodec.pack(
    { entryPath: example.manifest.assets.main.entryPath, files: snapshotFiles, warnings: [] },
    input.signal,
  );
  return context.artifactCodec.openArchive(packed.archive, input.signal);
};

export const builtinShareProvider: ShareProvider = {
  descriptor: builtinShareProviderDescriptor,
  resolve: resolveBuiltin,
};
