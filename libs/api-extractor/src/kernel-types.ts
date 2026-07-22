import opencascadeRaw from '#generated/opencascade/opencascade.bundled.json?raw';
import replicadRaw from '#generated/replicad/replicad.bundled.json?raw';
import jscadRaw from '#generated/jscad/jscad-modeling.bundled.json?raw';
import manifoldRaw from '#generated/manifold/manifold.bundled.json?raw';
import type { BundledTypesPackageMap } from '#bundled-types.types.js';

/** Map of module specifier to raw `.d.ts` content. @public */
export type KernelTypesMap = Readonly<Record<string, string>>;

const parseTypesMap = (raw: string): KernelTypesMap => JSON.parse(raw) as KernelTypesMap;

const projectPackageTypes = (packageName: string, types: KernelTypesMap): BundledTypesPackageMap => {
  const content = types[packageName];
  if (content === undefined) {
    throw new TypeError(`Bundled kernel types are missing package root ${JSON.stringify(packageName)}`);
  }

  const files: Record<string, string> = {};
  const packagePrefix = `${packageName}/`;
  for (const [moduleSpecifier, declaration] of Object.entries(types)) {
    if (moduleSpecifier === packageName) {
      continue;
    }
    if (!moduleSpecifier.startsWith(packagePrefix) || moduleSpecifier.length === packagePrefix.length) {
      throw new TypeError(
        `Bundled kernel module ${JSON.stringify(moduleSpecifier)} is outside package ${JSON.stringify(packageName)}`,
      );
    }
    files[`${moduleSpecifier.slice(packagePrefix.length)}/index.d.ts`] = declaration;
  }

  return { [packageName]: { content, files } };
};

/** @public */
export const opencascadeTypes: KernelTypesMap = parseTypesMap(opencascadeRaw);
/** @public */
export const replicadTypes: KernelTypesMap = parseTypesMap(replicadRaw);
/** @public */
export const jscadModelingTypes: KernelTypesMap = parseTypesMap(jscadRaw);
/** @public */
export const manifoldTypes: KernelTypesMap = parseTypesMap(manifoldRaw);

/** All kernel declarations projected as root packages with relative declaration files. @public */
export const kernelTypePackageMaps: readonly BundledTypesPackageMap[] = [
  projectPackageTypes('opencascade.js', opencascadeTypes),
  projectPackageTypes('replicad', replicadTypes),
  projectPackageTypes('@jscad/modeling', jscadModelingTypes),
  projectPackageTypes('manifold-3d', manifoldTypes),
];
