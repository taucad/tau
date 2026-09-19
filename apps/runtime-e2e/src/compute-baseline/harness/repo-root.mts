/**
 * Workspace roots for the promoted compute-baseline harness.
 *
 * The lane-b spike hard-coded `/Users/rifont/git/tau` and
 * `/Users/rifont/Documents/tau-workspace`. Promotion into `apps/runtime-e2e`
 * removes both: the repository root is derived from this module's own location
 * and the operator's private model workspace is an opt-in environment variable
 * (models sourced from it are a host-local leg, never a distributed fixture).
 */
import { resolve } from 'node:path';

/** Absolute repository root (`apps/runtime-e2e/src/compute-baseline/harness` -> five levels up). */
export const repoRoot = resolve(import.meta.dirname, '../../../../..');

/**
 * Optional host-local model workspace holding rights-uncleared models (drone,
 * quadcopter). Absent on CI and on any checkout but the operator's.
 */
export const hostLocalWorkspace = process.env['TAU_COMPUTE_BASELINE_WORKSPACE'] ?? '';
