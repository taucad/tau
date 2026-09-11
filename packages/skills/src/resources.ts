/**
 * Browser-and-Node resource descriptors for every package-owned Tau skill.
 *
 * Import this subpath when a host needs to expose the shipped skill files.
 * The root package entry remains the Node-only installer.
 *
 * @module
 */

import build123d from '@taucad/build123d/agent/resources.js';
import jscad from '@taucad/jscad/agent/resources.js';
import manifold from '@taucad/manifold/agent/resources.js';
import opencascade from '@taucad/opencascade/agent/resources.js';
import openrscad from '@taucad/openrscad/agent/resources.js';
import picogk from '@taucad/picogk/agent/resources.js';
import replicad from '@taucad/replicad/agent/resources.js';
import zoo from '@taucad/zoo/agent/resources.js';
import geospec from 'geospec/agent/resources.js';

/** One immutable file in a generated skill bundle. @public */
export type SkillResourceDescriptor = {
  readonly path: string;
  readonly url: string;
  readonly byteLength: number;
  readonly lineCount: number;
  readonly contentKind: 'text';
  readonly mediaType: 'text/markdown';
  readonly sha256: string;
};

/** One package-owned system skill and all of its lazy resources. @public */
export type SystemSkillBundle = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly whenToUse: string;
  readonly body: string;
  readonly fingerprint: string;
  readonly files: readonly SkillResourceDescriptor[];
};

/** The environment-specific byte reader injected by a native host. @public */
export type ReadSkillResource = (
  resource: SkillResourceDescriptor,
  options: { readonly signal?: AbortSignal },
) => Promise<Uint8Array<ArrayBuffer>>;

/** Every package-owned Tau system skill, in stable owner order. @public */
export const systemSkillBundles: readonly SystemSkillBundle[] = Object.freeze([
  ...replicad,
  ...jscad,
  ...manifold,
  ...opencascade,
  ...build123d,
  ...openrscad,
  ...picogk,
  ...zoo,
  ...geospec,
]);
