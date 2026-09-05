import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Nest injection token for the one provisioner an environment ships. */
export const cloudHostProvisionerToken = 'CLOUD_HOST_PROVISIONER';

/**
 * Everything a container needs to come up as a paired device.
 *
 * The credential appears here and nowhere else: it is minted inside
 * `HostsService.provisionCloudHost`, handed to the provisioner once, and never
 * returned to a browser or stored in plaintext.
 */
export type CloudHostSpec = {
  readonly deviceId: string;
  readonly credential: string;
  readonly ownerId: string;
  readonly projectId: string;
  /** Relay *and* model-gateway origin — a cloud host reaches Tau at one address. */
  readonly apiUrl: string;
};

/**
 * How this deployment starts and stops a cloud agent host.
 *
 * One port, one shipped implementation (local Docker). A Fly Machines
 * implementation is an operator item, specified in
 * `docs/research/agent-host-cloud-placement.md`; nothing else in the API knows
 * which one is installed.
 *
 * @public
 */
export type CloudHostProvisioner = {
  /**
   * Bring one host up. Must be safe to call again for a device that is already
   * running — provisioning is idempotent per `(ownerId, projectId)` and a retry
   * after a crashed API is the normal path.
   *
   * @param spec - Identity, credential and API origin for the new host.
   * @returns An opaque reference for logs and diagnostics.
   */
  start(spec: CloudHostSpec): Promise<{ readonly reference: string }>;
  /**
   * Stop and remove one host. Must succeed when nothing is running.
   *
   * @param deviceId - The device whose host is being retired.
   */
  stop(deviceId: string): Promise<void>;
};

/** Container name for one device: recoverable across API restarts without a second store. */
const containerName = (deviceId: string): string => `tau-host-${deviceId}`;

const isMissingContainer = (error: unknown): boolean => {
  const { stderr } = error as { stderr?: unknown };
  return typeof stderr === 'string' && /No such container|is not running/iu.test(stderr);
};

/**
 * The one line to show an owner when a provisioner refuses.
 *
 * A refusal is never a Tau bug and always something the owner or the operator
 * can act on — the image was never built, the Docker daemon is not running,
 * Docker is not installed — so the reason has to survive the trip to the
 * browser. `execFile` rejects with `Command failed: docker run …` on `message`
 * and the daemon's own words on `stderr`, whose *first* line is the actionable
 * one (`Unable to find image …`, `Cannot connect to the Docker daemon …`);
 * what follows is `See 'docker run --help'`. A provisioner with no `stderr` —
 * a `spawn docker ENOENT`, or a Fly implementation throwing a plain `Error` —
 * falls back to its message.
 *
 * @param error - Whatever {@link CloudHostProvisioner.start} threw.
 * @returns One line, capped so a wall of text cannot land in a combobox row.
 * @public
 */
export const cloudHostRefusalReason = (error: unknown): string => {
  const { stderr, message } = (error ?? {}) as { stderr?: unknown; message?: unknown };
  const text = typeof stderr === 'string' && stderr.trim() !== '' ? stderr : typeof message === 'string' ? message : '';
  const line = text
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== '');
  return (line ?? 'the provisioner refused').slice(0, 200);
};

/** Options for {@link createDockerCloudHostProvisioner}. */
export type DockerCloudHostProvisionerOptions = {
  /** Image reference to run. */
  readonly image: string;
  /** Docker network the container joins; the API must be reachable on it. */
  readonly network?: string | undefined;
  /**
   * What the container should call the API, when that is not what a browser
   * calls it.
   *
   * On a hosted deployment they are the same address and this stays unset. On a
   * developer's machine they are not: the browser reaches the API at
   * `http://localhost:4000` and a container reaches the same process at
   * `http://host.docker.internal:4000`, so a host handed the browser's URL
   * would never find the relay.
   */
  readonly apiUrl?: string | undefined;
  /** For tests: the command runner. */
  readonly exec?: ((file: string, arguments_: readonly string[]) => Promise<unknown>) | undefined;
};

/**
 * Start cloud hosts as local Docker containers.
 *
 * The credential travels in an `--env-file` rather than repeated `-e` flags:
 * `execFile` arguments are world-readable in `ps` on every platform the API
 * runs on, which is the same reason `tau serve` refuses to take its agent token
 * on `argv`. The file is mode-0600 in a private temp directory and is removed as
 * soon as `docker run` returns.
 *
 * ponytail: `docker inspect` still shows the container's environment, so this is
 * host-operator-visible by construction. The upgrade path is the deployment's
 * own secret plane (Fly secrets, Docker swarm secrets), not more shell.
 *
 * @param options - Image, network and an exec override for tests.
 * @returns A provisioner backed by the local Docker daemon.
 * @public
 */
export const createDockerCloudHostProvisioner = (options: DockerCloudHostProvisionerOptions): CloudHostProvisioner => {
  const exec = options.exec ?? (async (file: string, arguments_: readonly string[]) => run(file, [...arguments_]));
  return {
    async start(spec) {
      const directory = await mkdtemp(join(tmpdir(), 'tau-cloud-host-'));
      const environmentFile = join(directory, 'host.env');
      try {
        await writeFile(
          environmentFile,
          [
            `TAU_HOST_DEVICE_ID=${spec.deviceId}`,
            `TAU_HOST_CREDENTIAL=${spec.credential}`,
            `TAU_API_URL=${options.apiUrl ?? spec.apiUrl}`,
            '',
          ].join('\n'),
          { encoding: 'utf8', mode: 0o600 },
        );
        await exec('docker', [
          'run',
          '--detach',
          '--name',
          containerName(spec.deviceId),
          '--restart',
          'unless-stopped',
          /* So `host.docker.internal` resolves on a Linux daemon too, which is
           * what an `apiUrl` override usually names. */
          '--add-host',
          'host.docker.internal:host-gateway',
          '--env-file',
          environmentFile,
          '--label',
          `tau.owner=${spec.ownerId}`,
          '--label',
          `tau.project=${spec.projectId}`,
          ...(options.network ? ['--network', options.network] : []),
          options.image,
        ]);
        return { reference: containerName(spec.deviceId) };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
    async stop(deviceId) {
      try {
        await exec('docker', ['rm', '--force', containerName(deviceId)]);
      } catch (error) {
        /* Stopping what is already gone is the success case, not an error: a
         * revoke must never fail because the container died first. */
        if (!isMissingContainer(error)) {
          throw error;
        }
      }
    },
  };
};

/**
 * The provisioner this deployment ships.
 *
 * ponytail: the three settings are read straight from `process.env` rather than
 * the typed environment schema, because `environment.config.ts` is outside this
 * lane's budget. Promote `TAU_CLOUD_HOST_IMAGE`, `TAU_CLOUD_HOST_NETWORK` and
 * `TAU_CLOUD_HOST_API_URL` into that schema when the cloud placement leaves the
 * working copy.
 *
 * @returns The configured provisioner.
 */
export const createConfiguredCloudHostProvisioner = (): CloudHostProvisioner =>
  createDockerCloudHostProvisioner({
    image: process.env['TAU_CLOUD_HOST_IMAGE'] ?? 'tau-host:latest',
    ...(process.env['TAU_CLOUD_HOST_NETWORK'] ? { network: process.env['TAU_CLOUD_HOST_NETWORK'] } : {}),
    ...(process.env['TAU_CLOUD_HOST_API_URL'] ? { apiUrl: process.env['TAU_CLOUD_HOST_API_URL'] } : {}),
  });
