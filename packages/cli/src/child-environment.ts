/**
 * The environment `tau mcp` hands the threads and processes it starts (ruling X9).
 *
 * An agent app does not scrub what it passes `tau mcp`: Claude Code passes its whole environment, its own API key
 * included, and Codex adds its CA family and a baseline to the names a manifest lists. So `tau mcp` does not pass its
 * environment through: each runtime thread gets the names below and nothing else. A native kernel's process gets less
 * still (`@taucad/native-process-core` builds it from scratch).
 *
 * @module
 */

/** Names a runtime thread may read: the platform baseline, proxy and CA, and Tau's managed profile (D9, D25). */
export const childEnvironmentNames: readonly string[] = [
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'TERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TMPDIR',
  'TEMP',
  'TMP',
  'NO_COLOR',
  'CI',
  /* Windows resolves its system folders, profile and executables through these. */
  'SystemRoot',
  'windir',
  'ComSpec',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'HOMEDRIVE',
  'HOMEPATH',
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
  'TAU_ACQUISITION',
  'TAU_PAYLOAD_MIRROR',
  'TAU_PAYLOAD_MIRROR_NO_FALLBACK',
  'TAU_PAYLOAD_DIR',
  'TAU_CONFIG_DIR',
  'TAU_PAYLOAD_TARGET',
  'TAU_PAYLOAD_EMULATION',
  'TAU_TELEMETRY',
  'TAU_TELEMETRY_DIR',
  'TAU_TELEMETRY_FORMAT',
];

/** Name prefixes a runtime thread may read: the XDG base directories. */
const childEnvironmentPrefixes: readonly string[] = ['XDG_'];

const allowed = new Set(childEnvironmentNames);

/**
 * The environment one child of `tau mcp` starts with.
 * @param base - The environment to filter, normally `process.env`.
 * @returns A fresh environment holding only the allowed names that are set.
 */
export const childEnvironment = (base: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    Object.entries(base).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        (allowed.has(entry[0]) || childEnvironmentPrefixes.some((prefix) => entry[0].startsWith(prefix))),
    ),
  );
