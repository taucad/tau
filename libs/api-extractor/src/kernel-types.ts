import opencascadeRaw from '#generated/opencascade/opencascade.bundled.json?raw';
import replicadRaw from '#generated/replicad/replicad.bundled.json?raw';
import jscadRaw from '#generated/jscad/jscad-modeling.bundled.json?raw';
import manifoldRaw from '#generated/manifold/manifold.bundled.json?raw';

/** Map of module path to raw `.d.ts` content for Monaco's `addExtraLib`. @public */
export type KernelTypesMap = Readonly<Record<string, string>>;

function parseTypesMap(raw: string): KernelTypesMap {
  return JSON.parse(raw) as KernelTypesMap;
}

/** @public */
export const opencascadeTypes: KernelTypesMap = parseTypesMap(opencascadeRaw);
/** @public */
export const replicadTypes: KernelTypesMap = parseTypesMap(replicadRaw);
/** @public */
export const jscadModelingTypes: KernelTypesMap = parseTypesMap(jscadRaw);
/** @public */
export const manifoldTypes: KernelTypesMap = parseTypesMap(manifoldRaw);

/** All kernel type maps, ready for iteration when registering with Monaco. @public */
export const kernelTypeMaps: readonly KernelTypesMap[] = [
  opencascadeTypes,
  replicadTypes,
  jscadModelingTypes,
  manifoldTypes,
];
