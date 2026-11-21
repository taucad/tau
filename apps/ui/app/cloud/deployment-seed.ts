import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';

/**
 * The server-supplied first snapshot (adaptive app deployment mode charter W11): the mode the server rendered the
 * document with, from its own ask of the page's API origin. The root loader returns it, the document carries it in an
 * inline script, and the client entry hands it to the runtime before hydration, so the first client render matches the
 * server's. Only an explicit answer is a seed; a failure, a timeout and a `404` are none, and the client resolves as
 * before (I2, I15). Part of Core.
 */

/** The page global the document's inline script sets. @public */
export const deploymentSeedGlobal = '__tauDeploymentSeed';

/**
 * Read a value as a seed. Only the snapshots an explicit answer gives are accepted: funded or unfunded `confirmed`, and
 * `unknown` as `unsupported` or `misconfigured` (D7). Anything else is none.
 *
 * @param value - The parsed value.
 * @returns The seed, or `undefined`.
 * @public
 */
export const parseDeploymentSeed = (value: unknown): DeploymentModeSnapshot | undefined => {
  if (typeof value !== 'object' || value === null || !('state' in value)) {
    return undefined;
  }
  switch (value.state) {
    case 'funded': {
      const environment = 'environment' in value ? value.environment : undefined;
      return 'basis' in value && value.basis === 'confirmed' && typeof environment === 'string' && environment !== ''
        ? { state: 'funded', basis: 'confirmed', environment }
        : undefined;
    }
    case 'unfunded': {
      return 'basis' in value && value.basis === 'confirmed' ? { state: 'unfunded', basis: 'confirmed' } : undefined;
    }
    case 'unknown': {
      const problem = 'problem' in value ? value.problem : undefined;
      return problem === 'unsupported' || problem === 'misconfigured' ? { state: 'unknown', problem } : undefined;
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The inline script that publishes a seed to the client entry. `<` is escaped so no value can close the element.
 *
 * @param seed - The seed the server rendered with.
 * @returns The script's body.
 * @public
 */
export const buildDeploymentSeedScript = (seed: DeploymentModeSnapshot): string =>
  `window.${deploymentSeedGlobal} = ${JSON.stringify(seed).replaceAll('<', String.raw`\u003c`)}`;

/**
 * The seed the document carries, read by the client entry before hydration.
 *
 * @returns The seed, or `undefined` when the document carries none or a malformed one.
 * @public
 */
export const readDocumentDeploymentSeed = (): DeploymentModeSnapshot | undefined =>
  parseDeploymentSeed((globalThis as Record<string, unknown>)[deploymentSeedGlobal]);
