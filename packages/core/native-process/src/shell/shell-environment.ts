/**
 * Environment names no contained shell may receive (blueprint D20, E05): startup hooks that run code before the
 * command, loader and injection variables, agent and runtime sockets, proxy settings the provider owns, and anything
 * named like a credential. The host builds the environment from an allowlist; this is the provider's floor under it.
 */

/** Exact names, compared case-insensitively because Windows environment names are. */
const refusedNames: ReadonlySet<string> = new Set(
  [
    /* Shell startup and tracing hooks. */
    'BASH_ENV',
    'ENV',
    'SHELLOPTS',
    'BASHOPTS',
    'PROMPT_COMMAND',
    'PS0',
    'PS4',
    'HISTFILE',
    'INPUTRC',
    'ZDOTDIR',
    /* Interpreter and loader hooks. */
    'NODE_OPTIONS',
    'NODE_PATH',
    'NODE_EXTRA_CA_CERTS',
    'PYTHONSTARTUP',
    'PYTHONPATH',
    'PYTHONHOME',
    'PERL5OPT',
    'PERL5LIB',
    'PERLLIB',
    'RUBYOPT',
    'RUBYLIB',
    'JAVA_TOOL_OPTIONS',
    '_JAVA_OPTIONS',
    'JDK_JAVA_OPTIONS',
    'ELECTRON_RUN_AS_NODE',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'GIT_ASKPASS',
    'SSH_ASKPASS',
    'GIT_EXEC_PATH',
    'GIT_TEMPLATE_DIR',
    /* PowerShell's own startup controls (D14: no execution-policy override, profiles stay off). */
    'PSEXECUTIONPOLICYPREFERENCE',
    '__PSLOCKDOWNPOLICY',
    'POWERSHELL_DISTRIBUTION_CHANNEL',
    /* Agent and runtime sockets (D26). */
    'SSH_AUTH_SOCK',
    'SSH_AGENT_PID',
    'GPG_AGENT_INFO',
    'DBUS_SESSION_BUS_ADDRESS',
    'DBUS_SYSTEM_BUS_ADDRESS',
    'XDG_RUNTIME_DIR',
    'DOCKER_HOST',
    'KUBECONFIG',
    'WAYLAND_DISPLAY',
    'DISPLAY',
    /* The provider sets proxy routing itself; a host value would bypass or impersonate it. */
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'NO_PROXY',
    'FTP_PROXY',
    'GRPC_PROXY',
    'RSYNC_PROXY',
  ].map((name) => name.toUpperCase()),
);

/** Name prefixes: dynamic loader controls, exported Bash functions and cloud or registry credentials. */
const refusedPrefixes: readonly string[] = [
  'LD_',
  'DYLD_',
  'BASH_FUNC_',
  'GIT_CONFIG',
  'NPM_CONFIG_',
  'AWS_',
  'AZURE_',
  'GOOGLE_',
  'GCLOUD_',
  'CLOUDSDK_',
  'GITHUB_',
  'GH_',
  'ANTHROPIC_',
  'OPENAI_',
  'TAU_',
];

/** Any name that reads as a secret. A false positive costs a renamed variable; a false negative leaks one. */
const credentialPattern = /token|secret|passw(?:or)?d|credential|api_?key|private_?key|auth|cookie|session/iu;

/** A portable environment name: no `=`, no NUL, not empty. */
const namePattern = /^[^=\0]+$/u;

/**
 * The environment entries a contained shell may not receive.
 *
 * @public
 * @param environment - The complete child environment the host built.
 * @returns The refused names, in input order; empty when the environment is acceptable.
 */
export const refusedShellEnvironment = (environment: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(environment)
    .filter(([name, value]) => {
      const upper = name.toUpperCase();
      return (
        !namePattern.test(name) ||
        value.includes('\0') ||
        refusedNames.has(upper) ||
        refusedPrefixes.some((prefix) => upper.startsWith(prefix)) ||
        credentialPattern.test(name)
      );
    })
    .map(([name]) => name);
