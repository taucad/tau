/**
 * Runtime observation instruments (package design §1.2): recorded by the API at ingest from `runtime.operation`,
 * `runtime.late`, `runtime.viewer` and `telemetry.delivery` entries, never from spans. Every attribute is a closed
 * vocabulary; every product instrument carries `tau.runtime.population`. Named cardinality views for the instruments
 * whose live set exceeds the SDK default of 2,000 are `cardinalityViews` in `apps/api/app/telemetry`.
 */
import { z } from 'zod';
import { defineCounter, defineGauge, defineHistogram } from '#define-metric.js';
import { runtimeVocabulary as v } from '#runtime-ingest.js';

const failed = z.boolean();
const releaseLabel = z.string();
const errorTypeLabel = z.string();

/** @public */
export const runtimeMetrics = {
  /* ---- operational ---- */
  runtimeOperationDuration: defineHistogram({
    name: 'tau.runtime.operation.duration',
    unit: 's',
    description: 'Client-observed attempt duration, submission to settlement',
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 900],
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.runtime.outcome': v.outcome,
      'tau.runtime.route': v.route,
      'tau.runtime.cold': z.boolean(),
    }),
  }),
  runtimeCohortDuration: defineHistogram({
    name: 'tau.runtime.operation.cohort_duration',
    unit: 's',
    description:
      'Duration of succeeded attempts by kernel and admitted client release (newest 32, else _OTHER), for regression comparison',
    buckets: [0.1, 0.5, 1, 5, 30, 120, 900],
    attributes: z.object({ 'tau.runtime.operation': v.operation, 'kernel.id': v.kernel, 'tau.release': releaseLabel }),
  }),
  runtimeOperationQueue: defineHistogram({
    name: 'tau.runtime.operation.queue',
    unit: 's',
    description: 'Worker-reported wait behind earlier operations, for attempts that got a reply',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30],
    attributes: z.object({ 'tau.runtime.operation': v.operation, 'tau.runtime.route': v.route }),
  }),
  runtimeOperations: defineCounter({
    name: 'tau.runtime.operations',
    unit: '{operation}',
    description:
      'Settled attempts by operation, outcome, cause, kernel and population; the denominator for every runtime rate',
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.runtime.outcome': v.outcome,
      'tau.runtime.cause': z.string(),
      'kernel.id': v.kernel,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeOperationErrors: defineCounter({
    name: 'tau.runtime.operation_errors',
    unit: '{operation}',
    description: 'Non-success attempts by error type, operation and kernel (hot spots)',
    attributes: z.object({ 'tau.runtime.operation': v.operation, 'error.type': errorTypeLabel, 'kernel.id': v.kernel }),
  }),
  runtimeOperationsByRelease: defineCounter({
    name: 'tau.runtime.operations_by_release',
    unit: '{operation}',
    description: 'Completed attempts by admitted client release (newest 32, else _OTHER) and success/failure class',
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.release': releaseLabel,
      'tau.runtime.failed': failed,
    }),
  }),
  runtimeJobAttention: defineCounter({
    name: 'tau.runtime.job_attention',
    unit: '{job}',
    description:
      'Jobs that entered attention_required, once per job, by provider; excluded from the operations denominator',
    attributes: z.object({ 'tau.runtime.plugin': v.plugin, 'tau.runtime.population': v.population }),
  }),
  runtimePluginOperations: defineCounter({
    name: 'tau.runtime.plugin_operations',
    unit: '{operation}',
    description:
      'Uses of each non-kernel plugin capability (transcoder, job provider, middleware, bundler, machine provider) by plugin id, operation, outcome and population',
    attributes: z.object({
      'tau.runtime.capability': v.capability,
      'tau.runtime.plugin': v.pluginUsage,
      'tau.runtime.operation': v.operation,
      'tau.runtime.outcome': v.outcome,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeMachineOperations: defineCounter({
    name: 'tau.runtime.machine_operations',
    unit: '{operation}',
    description:
      'New machine operations run by the Node machine host, by provider, kind, standard action family (actions only), outcome, caller and population',
    attributes: z.object({
      'tau.runtime.plugin': v.plugin,
      'tau.runtime.machine_kind': v.machineKind,
      'tau.runtime.machine_action': v.machineAction,
      'tau.runtime.outcome': v.outcome,
      'tau.runtime.caller': v.caller,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeKernelUsage: defineCounter({
    name: 'tau.runtime.kernel_usage',
    unit: '{operation}',
    description: 'Completed attempts by kernel, route (host) and caller; entries without a kernel are not counted',
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.route': v.route,
      'tau.runtime.caller': v.caller,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeTranscodeFormats: defineCounter({
    name: 'tau.runtime.transcode_formats',
    unit: '{conversion}',
    description:
      'Completed conversions by source format, target format and success/failure class; a pair that is not a registry edge records _OTHER',
    attributes: z.object({
      'tau.runtime.source_format': v.fileFormat,
      'tau.runtime.format': v.format,
      'tau.runtime.failed': failed,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeEntryFormats: defineCounter({
    name: 'tau.runtime.entry_formats',
    unit: '{evaluation}',
    description: 'Completed evaluates by kernel and entry file format (source language or imported file type)',
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.entry_format': v.fileFormat,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeOperationsByHost: defineCounter({
    name: 'tau.runtime.operations_by_host',
    unit: '{operation}',
    description:
      'Completed attempts by route (host), platform engine family, OS class and population (_OTHER where the entry carries no platform or OS)',
    attributes: z.object({
      'tau.runtime.route': v.route,
      'tau.runtime.platform': v.platform,
      'tau.runtime.os': v.os,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeParameterFeatures: defineCounter({
    name: 'tau.runtime.parameter_features',
    unit: '{evaluation}',
    description: 'Succeeded evaluates whose manifest uses a parameter feature, by kernel and feature',
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.parameter_feature': v.parameterFeature,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeOperationsByCaller: defineCounter({
    name: 'tau.runtime.operations_by_caller',
    unit: '{operation}',
    description: 'Completed attempts by caller and success/failure class',
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.runtime.caller': v.caller,
      'tau.runtime.failed': failed,
    }),
  }),
  runtimeOperationsByTransport: defineCounter({
    name: 'tau.runtime.operations_by_transport',
    unit: '{operation}',
    description:
      'Client attempts by transport (in-process, web-worker, node-worker, utility, websocket), operation and outcome',
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.runtime.transport': v.transport,
      'tau.runtime.outcome': v.outcome,
    }),
  }),
  runtimeAdaptations: defineCounter({
    name: 'tau.runtime.adaptations',
    unit: '{adaptation}',
    description: 'Warning-severity issue codes attempts adapted through, by kernel, code and operation',
    attributes: z.object({ 'kernel.id': v.kernel, 'error.type': errorTypeLabel, 'tau.runtime.operation': v.operation }),
  }),
  runtimePhaseDuration: defineHistogram({
    name: 'tau.runtime.phase.duration',
    unit: 's',
    description:
      'Worker-measured time per closed phase name (prepare, resolve, compute, mesh, export, reuse, other) of succeeded attempts, by kernel',
    buckets: [0.005, 0.025, 0.1, 0.5, 1, 5, 30, 120, 900],
    attributes: z.object({ 'tau.runtime.phase': v.phase, 'kernel.id': v.kernel, 'tau.runtime.operation': v.operation }),
  }),
  runtimeMiddlewareDuration: defineHistogram({
    name: 'tau.runtime.middleware.duration',
    unit: 's',
    description: 'Total middleware self-time per attempt, by the slowest first-party middleware name',
    buckets: [0.001, 0.005, 0.025, 0.1, 0.5, 1, 5, 30],
    attributes: z.object({ 'tau.runtime.middleware': v.middleware, 'tau.runtime.operation': v.operation }),
  }),
  runtimeVerifyTests: defineHistogram({
    name: 'tau.runtime.verify.tests',
    unit: '{test}',
    description: 'GeoSpec tests per run by set (selected, passed, failed)',
    buckets: [1, 2, 5, 10, 20, 50, 100, 500],
    attributes: z.object({ 'tau.runtime.set': z.enum(['selected', 'passed', 'failed']), 'kernel.id': v.kernel }),
  }),
  runtimeViewerEvents: defineCounter({
    name: 'tau.runtime.viewer.events',
    unit: '{event}',
    description: 'Viewer events by backend, route, device class and, for downloads, format',
    attributes: z.object({
      'tau.runtime.viewer_event': v.viewerEvent,
      'tau.runtime.backend': v.viewerBackend,
      'tau.runtime.route': v.route,
      'tau.runtime.device': v.device.optional(),
      'tau.runtime.format': v.format.optional(),
    }),
  }),
  runtimeViewerFirstFrame: defineHistogram({
    name: 'tau.runtime.viewer.first_frame',
    unit: 's',
    description: 'Geometry receipt to first presented frame, by backend and size class',
    buckets: [0.016, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    attributes: z.object({ 'tau.runtime.backend': v.viewerBackend, 'tau.runtime.size_class': v.sizeClass }),
  }),
  runtimeReuse: defineCounter({
    name: 'tau.runtime.reuse',
    unit: '{operation}',
    description: 'Compute reuse result per kernel (cache effectiveness)',
    attributes: z.object({ 'kernel.id': v.kernel, 'tau.runtime.reuse': v.reuse }),
  }),
  runtimeFactsMissing: defineCounter({
    name: 'tau.runtime.facts_missing',
    unit: '{attempt}',
    description:
      'Attempts that settled on a worker reply whose trailing worker facts never arrived; the observation itself was still recorded',
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.runtime.reason': v.factsMissing,
      'tau.runtime.route': v.route,
    }),
  }),
  runtimeLateTerminals: defineCounter({
    name: 'tau.runtime.late_terminals',
    unit: '{reply}',
    description: 'Worker replies that arrived after their attempt had settled as timed-out, cancelled or abandoned',
    attributes: z.object({
      'tau.runtime.operation': v.operation,
      'tau.runtime.settled_as': v.settledAs,
      'tau.runtime.route': v.route,
    }),
  }),
  runtimeCapacityRefusals: defineCounter({
    name: 'tau.runtime.capacity.refusals',
    unit: '{refusal}',
    description: 'RESOURCE_LIMIT issues and supervisor limit kills, by allowlisted limit and demand kind',
    attributes: z.object({
      'tau.runtime.limit': v.limitId,
      'tau.runtime.demand_kind': v.demandKind,
      'kernel.id': v.kernel,
      'tau.runtime.route': v.route,
    }),
  }),
  runtimeCapacityDemandRatio: defineHistogram({
    name: 'tau.runtime.capacity.demand_ratio',
    unit: '1',
    description:
      'Known demand divided by the effective limit, for allowlisted refusals with a measured or estimated demand',
    buckets: [0.5, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 2, 4, 10],
    attributes: z.object({ 'tau.runtime.limit': v.limitId }),
  }),
  /* ---- product ---- */
  runtimeKernelHeap: defineHistogram({
    name: 'tau.runtime.kernel.heap',
    unit: 'By',
    description:
      'Memory at settle (succeeded or failed), by kernel, source, failure class, route, device class and population',
    buckets: [
      64 * 2 ** 20,
      128 * 2 ** 20,
      256 * 2 ** 20,
      512 * 2 ** 20,
      2 ** 30,
      1.5 * 2 ** 30,
      2 * 2 ** 30,
      3 * 2 ** 30,
      4 * 2 ** 30,
    ],
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.heap_source': v.heapSource,
      'tau.runtime.failed': failed,
      'tau.runtime.route': v.route,
      'tau.runtime.device': v.device.optional(),
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeParametersDeclared: defineHistogram({
    name: 'tau.runtime.parameters.declared',
    unit: '{parameter}',
    description: 'Parameter leaves a model declares, per succeeded evaluate, by kernel',
    buckets: [0, 1, 2, 5, 10, 20, 50, 100],
    attributes: z.object({ 'kernel.id': v.kernel, 'tau.runtime.population': v.population }),
  }),
  runtimeParameterEvaluations: defineCounter({
    name: 'tau.runtime.parameter_evaluations',
    unit: '{evaluation}',
    description: 'Succeeded evaluates by how much of the declared parameter set differs from its defaults',
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.parameter_class': v.parameterClass,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeRenderBySize: defineHistogram({
    name: 'tau.runtime.render.duration_by_size',
    unit: 's',
    description: 'Succeeded render duration by kernel and delivered-triangle size class',
    buckets: [0.1, 0.5, 1, 5, 30, 120, 900],
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.size_class': v.sizeClass,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeExports: defineCounter({
    name: 'tau.runtime.exports',
    unit: '{export}',
    description: 'Export and transcode attempts by kernel, format and outcome',
    attributes: z.object({
      'kernel.id': v.kernel,
      'tau.runtime.format': v.format,
      'tau.runtime.outcome': v.outcome,
      'tau.runtime.population': v.population,
    }),
  }),
  runtimeActivePrincipals: defineGauge({
    name: 'tau.runtime.active_principals',
    unit: '{principal}',
    description:
      'Estimated distinct signed-in principals with at least one attempt today (HyperLogLog), by kernel (or _ALL) and set; read with max, not sum',
    attributes: z.object({ 'kernel.id': z.string(), 'tau.runtime.set': z.enum(['any', 'failed']) }),
  }),
  runtimeActivePluginPrincipals: defineGauge({
    name: 'tau.runtime.active_plugin_principals',
    unit: '{principal}',
    description:
      'Estimated distinct signed-in principals who used a non-kernel plugin today (HyperLogLog), by plugin id and set; read with max, not sum',
    attributes: z.object({ 'tau.runtime.plugin': v.pluginUsage, 'tau.runtime.set': z.enum(['any', 'failed']) }),
  }),
  /* ---- telemetry health ---- */
  telemetryRuntimeEnabled: defineGauge({
    name: 'tau.telemetry.runtime.enabled',
    unit: '1',
    description:
      '1 where this API records runtime telemetry (TAU_RUNTIME_TELEMETRY resolved on), else 0; absent-telemetry alerts are conditioned on it',
    attributes: z.object({}),
  }),
  telemetryPolicyProbes: defineCounter({
    name: 'tau.telemetry.policy.probes',
    unit: '{request}',
    description: 'Entry-free policy probes this deployment answered, by the answer',
    attributes: z.object({ answer: z.enum(['on', 'off']) }),
  }),
  telemetryClientDropped: defineCounter({
    name: 'tau.telemetry.client.dropped',
    unit: '{entry}',
    description: 'Entries a reporter dropped before delivery, reported by its next delivered batch',
    attributes: z.object({ 'tau.runtime.route': v.route, reason: v.dropReason }),
  }),
  telemetryIngestUnavailable: defineCounter({
    name: 'tau.telemetry.ingest.unavailable',
    unit: '{batch}',
    description:
      'Batches admitted while Redis was unavailable for the rate budget or the dedupe key (fail-open, counted)',
    attributes: z.object({ check: z.enum(['budget', 'dedupe']) }),
  }),
  telemetryIngestPartial: defineCounter({
    name: 'tau.telemetry.ingest.partial',
    unit: '{batch}',
    description:
      'Batches whose recording failed after the first instrument write; marked recorded so a retry cannot double-count',
    attributes: z.object({}),
  }),
  telemetrySpansDropped: defineCounter({
    name: 'tau.telemetry.spans.dropped',
    unit: '{span}',
    description: 'Spans worker collectors refused at their 10,000-entry bound, as hosts reported them',
    attributes: z.object({ 'tau.runtime.route': v.route }),
  }),
  telemetryDeliveryDelay: defineHistogram({
    name: 'tau.telemetry.client.delivery_delay',
    unit: 's',
    description: 'Age of the oldest entry in each delivered batch: settle-to-send freshness',
    buckets: [1, 5, 10, 30, 60, 120, 300, 900],
    attributes: z.object({ 'tau.runtime.route': v.route }),
  }),
  telemetryIngestEntries: defineCounter({
    name: 'tau.telemetry.ingest.entries',
    unit: '{entry}',
    description: 'Runtime entries the ingest route received, by what it did with them and whose they were',
    attributes: z.object({
      disposition: z.enum([
        'recorded',
        'rejected-invalid',
        'rejected-rate-limit',
        'rejected-unknown-entry',
        'duplicate',
        'disabled',
        'overflow',
      ]),
      'tau.runtime.population': v.population,
    }),
  }),
} as const;
