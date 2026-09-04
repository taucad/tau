import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { build123dOptionsSchema } from '@taucad/build123d';
import { z } from 'zod';

const sha256 = z.string().regex(/^[\da-f]{64}$/u);
const relativeResourcePath = z
  .string()
  .min(1)
  .refine((path) => !isAbsolute(path) && !path.split(/[\\/]/u).includes('..'));
const runtimeManifestSchema = z.object({
  schemaVersion: z.literal(1),
  target: z.string(),
  pythonRelativePath: relativeResourcePath,
  pythonSha256: sha256,
  workerPath: relativeResourcePath,
  workerSha256: sha256,
  supportFiles: z.array(z.object({ path: relativeResourcePath, sha256 })).length(2),
});

const inside = (root: string, path: string): string => {
  const absolute = resolve(root, path);
  const child = relative(root, absolute);
  if (child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Build123d resource escapes its target root: ${path}`);
  }
  return absolute;
};

/** Resolve the prepared native payload owned by the desktop app. */
export const build123dKernelOptions = (): z.infer<typeof build123dOptionsSchema> => {
  const resourceRoot = process.env['TAU_BUILD123D_RESOURCE_ROOT'];
  const trustFile = process.env['TAU_NATIVE_CODE_TRUST_FILE'];
  if (!resourceRoot || !trustFile) {
    throw new Error('The desktop shell did not supply Build123d resources and project trust.');
  }
  const targetRoot = resolve(resourceRoot, `${process.platform}-${process.arch}`);
  const manifest = runtimeManifestSchema.parse(
    JSON.parse(readFileSync(resolve(targetRoot, 'tau-runtime-manifest.json'), 'utf8')),
  );
  if (manifest.target !== `${process.platform}-${process.arch}`) {
    throw new Error(`Build123d resource target mismatch: ${manifest.target}`);
  }
  return build123dOptionsSchema.parse({
    pythonExecutable: inside(targetRoot, manifest.pythonRelativePath),
    workerPath: inside(targetRoot, manifest.workerPath),
    trustFile,
    pythonSha256: manifest.pythonSha256,
    workerSha256: manifest.workerSha256,
    supportFiles: manifest.supportFiles.map(({ path, sha256: digest }) => ({
      path: inside(targetRoot, path),
      sha256: digest,
    })),
  });
};
