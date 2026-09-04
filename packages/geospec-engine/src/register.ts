/**
 * Side-effect entry point: registering this module installs the GeoSpec
 * engine into the `geospec` substrate.
 *
 * ```typescript
 * import '@taucad/geospec-engine/register';
 * ```
 *
 * This entry is **host-neutral**: it runs unchanged in a browser worker and in
 * Node, so nothing reachable from here may import a Node builtin a browser
 * bundler cannot resolve. The Node hosts — the filesystem evidence store, the
 * `worker_threads` pool runner, the Node VM filesystem — live behind
 * `@taucad/geospec-engine/register/node`, which installs this build plus
 * theirs.
 *
 * Contract-B capability discovery lists exactly which claims this build can
 * execute. Host bootstrap functions remain a separate in-process binding and
 * are deliberately absent from `describeGeoSpecEngine()`.
 *
 * @module
 */

import { geoSpecEngineProtocolVersion, registerGeoSpecEngine } from 'geospec/engine';
import type { GeoSpecEngineHostBindings, GeoSpecEngineImplementation } from 'geospec/engine';
// oxlint-disable-next-line no-restricted-imports -- the registration descriptor must use this package's own publish version in every bundler.
import packageMetadata from '../package.json' with { type: 'json' };
import { flushEvidenceStore } from '#cache/evidence-cache.js';
import { loadMesh } from '#mesh/load-mesh.js';
import { createModelLoader, loadModel } from '#model/load-model.js';
import { loadStep } from '#step/load-step.js';
import { createGeoSpecWebPoolRunner, createGeoSpecWebRunner } from '#runner/web/web-runner.js';
import { startGeoSpecPoolWorkerHost } from '#runner/pool/worker-host.js';
import { createGeoSpecEngineProtocol } from '#engine/protocol.js';
import { exposeEngineMeshAnalysis, exposeEngineSubject } from '#engine/subject-store.js';

const registeredLoadMesh: GeoSpecEngineHostBindings['loadMesh'] = async (options) => {
  const result = await loadMesh(options);
  return result.success ? { success: true, subject: exposeEngineSubject(result.subject) } : result;
};

const registeredAnalyzeMesh: GeoSpecEngineHostBindings['analyzeMesh'] = async (options) => {
  const result = await loadMesh(options);
  if (!result.success) {
    return result;
  }
  return exposeEngineMeshAnalysis(result.subject);
};

const registeredLoadStep: GeoSpecEngineHostBindings['loadStep'] = async (options) => {
  const subject = await loadStep(options);
  return exposeEngineSubject(subject);
};

const registeredLoadModel: GeoSpecEngineHostBindings['loadModel'] = async (options) => {
  const subject = await loadModel(options);
  return exposeEngineSubject(subject);
};

const registeredCreateModelLoader: GeoSpecEngineHostBindings['createModelLoader'] = (options) =>
  createModelLoader(options);

/**
 * What this engine build can execute.
 *
 * @public
 */
export const geoSpecEngineImplementation: GeoSpecEngineImplementation = {
  protocolVersion: geoSpecEngineProtocolVersion,
  engine: '@taucad/geospec-engine',
  version: packageMetadata.version,
  protocol: createGeoSpecEngineProtocol(packageMetadata.version),
  host: {
    loadMesh: registeredLoadMesh,
    analyzeMesh: registeredAnalyzeMesh,
    loadStep: registeredLoadStep,
    loadModel: registeredLoadModel,
    createModelLoader: registeredCreateModelLoader,
    createGeoSpecWebRunner,
    createGeoSpecWebPoolRunner,
    startGeoSpecPoolWorkerHost,
    flushEvidenceStore,
  },
};

registerGeoSpecEngine(geoSpecEngineImplementation);
