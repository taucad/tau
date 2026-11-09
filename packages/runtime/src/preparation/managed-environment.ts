import type {
  ClosureDescription,
  EffectiveProfile,
  ManagedPreparation,
  PreparationHost,
} from '#preparation/preparation-host.types.js';
import type { HostIndicators } from '#preparation/preparation.types.js';

type Environment = Readonly<Record<string, string | undefined>>;

const mirrorProtocols = new Set(['https:', 'http:', 'file:']);
const proxyVariables = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const;

// The managed family (D25) and the proxy and CA names Node reads at start-up, which the plugin manifests forward.
const profileVariables = [
  'TAU_ACQUISITION',
  'TAU_DEPENDENCY_MIRROR',
  'TAU_DEPENDENCY_MIRROR_NO_FALLBACK',
  'TAU_DEPENDENCY_DIR',
  'TAU_CONFIG_DIR',
  'TAU_DEPENDENCY_TARGET',
  'TAU_DEPENDENCY_EMULATION',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'NODE_USE_SYSTEM_CA',
  'NODE_USE_ENV_PROXY',
] as const;

// The managed variables' names before the dependency rename (blueprint D2a): set, they fail naming the successor
// rather than being ignored.
const renamedVariables = ['MIRROR', 'MIRROR_NO_FALLBACK', 'DIR', 'TARGET', 'EMULATION'].map(
  (suffix) => [`TAU_PAYLOAD_${suffix}`, `TAU_DEPENDENCY_${suffix}`] as const,
);

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === '' ? undefined : value.trim();

/**
 * Read the managed profile every Node host entry honours: `TAU_ACQUISITION=open|locked`, `TAU_DEPENDENCY_MIRROR`
 * (a digest-addressed `https://`, `http://` or `file://` base), `TAU_DEPENDENCY_MIRROR_NO_FALLBACK=1`,
 * `TAU_DEPENDENCY_DIR` (a seed directory), `TAU_DEPENDENCY_TARGET` and `TAU_DEPENDENCY_EMULATION=0`. `locked`
 * implies the no-fallback switch, and without a mirror it means the store and the seed only. `TAU_CONFIG_DIR` is read by
 * `defaultDependencyStore()`, not here.
 * @param environment - Usually `process.env`.
 * @returns The interpreted profile.
 * @throws {TypeError} When a variable holds a value no host can honour, naming the variable and what it accepts, or
 * when a `TAU_PAYLOAD_*` variable is set, naming its `TAU_DEPENDENCY_*` successor.
 * @public
 */
export const readManagedPreparation = (environment: Environment): ManagedPreparation => {
  for (const [retired, successor] of renamedVariables) {
    if (nonEmpty(environment[retired]) !== undefined) {
      throw new TypeError(`${retired} was renamed to ${successor}; set ${successor} instead and unset ${retired}.`);
    }
  }
  const acquisition = nonEmpty(environment['TAU_ACQUISITION']) ?? 'open';
  if (acquisition !== 'open' && acquisition !== 'locked') {
    throw new TypeError(`TAU_ACQUISITION is "${acquisition}"; set it to "open" or "locked", or unset it.`);
  }
  const mirrorUrl = nonEmpty(environment['TAU_DEPENDENCY_MIRROR']);
  if (mirrorUrl !== undefined && (!URL.canParse(mirrorUrl) || !mirrorProtocols.has(new URL(mirrorUrl).protocol))) {
    throw new TypeError(
      `TAU_DEPENDENCY_MIRROR is "${mirrorUrl}"; set it to an https://, http:// or file:// base URL whose blobs/sha256/<hex> serves each dependency file.`,
    );
  }
  const emulation = nonEmpty(environment['TAU_DEPENDENCY_EMULATION']);
  if (emulation !== undefined && emulation !== '0' && emulation !== '1') {
    throw new TypeError(`TAU_DEPENDENCY_EMULATION is "${emulation}"; set it to "0" to disable the emulation fallback.`);
  }
  const locked = acquisition === 'locked';
  const noFallback = locked || nonEmpty(environment['TAU_DEPENDENCY_MIRROR_NO_FALLBACK']) === '1';
  const seed = nonEmpty(environment['TAU_DEPENDENCY_DIR']);
  const target = nonEmpty(environment['TAU_DEPENDENCY_TARGET']);
  return {
    profile: acquisition,
    ...(mirrorUrl === undefined ? {} : { mirror: { baseUrl: mirrorUrl, noFallback } }),
    ...(seed === undefined ? {} : { seed }),
    selection: { ...(target === undefined ? {} : { target }), ...(emulation === '0' ? { emulation: false } : {}) },
    offline: locked && mirrorUrl === undefined,
  };
};

const nodeFlag = (environment: Environment, execArgv: readonly string[], flag: string): boolean =>
  execArgv.includes(flag) || (environment['NODE_OPTIONS'] ?? '').split(/\s+/u).includes(flag);

/**
 * Assemble `tau prepare --inspect --json`: the managed profile, the store, the host indicators, how Node reaches the
 * network (proxy and certificate authorities are Node start-up facts), which managed, proxy and CA variables are set
 * (by name: a proxy URL can carry a credential) and what the store holds for every declared dependency.
 * @param input - The host, its store and indicators, the interpreted profile, the environment and Node's flags.
 * @returns The effective profile.
 * @public
 */
export const describeEffectiveProfile = async (input: {
  readonly host: PreparationHost;
  readonly store: string;
  readonly indicators: HostIndicators | undefined;
  readonly managed: ManagedPreparation;
  readonly environment: Environment;
  readonly execArgv: readonly string[];
}): Promise<EffectiveProfile> => {
  const { environment, execArgv, managed } = input;
  const envProxy =
    (environment['NODE_USE_ENV_PROXY'] === '1' || nodeFlag(environment, execArgv, '--use-env-proxy')) &&
    proxyVariables.some((name) => nonEmpty(environment[name]) !== undefined);
  const systemCa = environment['NODE_USE_SYSTEM_CA'] === '1' || nodeFlag(environment, execArgv, '--use-system-ca');
  const closures: readonly ClosureDescription[] = await input.host.describe();
  return {
    profile: managed.profile,
    store: input.store,
    ...(input.indicators === undefined ? {} : { host: input.indicators }),
    ...(managed.mirror === undefined ? {} : { mirror: managed.mirror.baseUrl }),
    noFallback: managed.mirror?.noFallback ?? managed.profile === 'locked',
    ...(managed.seed === undefined ? {} : { seed: managed.seed }),
    ...(managed.selection.target === undefined ? {} : { target: managed.selection.target }),
    emulation: managed.selection.emulation !== false,
    proxy: envProxy ? 'env-proxy' : 'none',
    ca: systemCa ? 'system' : nonEmpty(environment['NODE_EXTRA_CA_CERTS']) === undefined ? 'bundled' : 'extra',
    variables: profileVariables.filter((name) => nonEmpty(environment[name]) !== undefined),
    closures,
  };
};
