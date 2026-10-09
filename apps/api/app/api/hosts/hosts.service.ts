import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import { z } from 'zod';

import type { Environment } from '#config/environment.config.js';
import { DatabaseService } from '#database/database.service.js';
import { agentRun, hostDevice, project, user } from '#database/schema.js';
import { RedisService } from '#redis/redis.service.js';
import { relayHostFramesThroughRedis } from '#api/hosts/host-frame-relay.js';
import type { DistributedRelayHandle } from '#api/hosts/host-frame-relay.js';
import { ShutdownService } from '#lifecycle/shutdown.service.js';
import {
  cloudHostProvisionerToken,
  cloudHostRefusalReason,
  createConfiguredCloudHostProvisioner,
} from '#api/hosts/cloud-host.provisioner.js';
import type { CloudHostProvisioner } from '#api/hosts/cloud-host.provisioner.js';
import { hashHostGitCredential, mintHostGitCredential } from '#api/hosts/host-git-credential.js';
import { hostCapabilitiesSchema, hostControlMessageSchema } from '#api/hosts/hosts.dto.js';
import type { HostCapabilities, HostControlMessage } from '#api/hosts/hosts.dto.js';

const pairingLifetimeSeconds = 600;
/**
 * How long an *unclaimed* offer lives, and the window every refresh of a
 * claimed one buys. A session whose sockets are open is refreshed on this
 * lifetime for as long as it has one (see `touchSession`).
 */
const sessionLifetimeSeconds = 120;
/** Milliseconds between keepalives for a session that still has an open socket. */
const sessionRefreshInterval = 30_000;
/** Milliseconds. */
const sessionOfferTimeout = 15_000;
const pairingPollInterval = 1000;
const controlPresenceLifetime = 60;
const controlPresenceRefresh = 20_000;

const pairingStateSchema = z.object({
  deviceLabel: z.string(),
  userCode: z.string(),
  approvedUserId: z.string().optional(),
});

const sessionStateSchema = z.object({
  userId: z.string(),
  deviceId: z.string(),
  runtimeVersion: z.string(),
  expiresAt: z.string(),
  runtimeGrantHash: z.string(),
  fileSystemGrantHash: z.string(),
  /* Optional: a session minted before rung 2 shipped is still readable, and a
   * daemon that runs no agent host simply never claims this grant. */
  agentGrantHash: z.string().optional(),
});

const onlineDeviceStateSchema = z.object({
  connectionId: z.string(),
  runtimeVersion: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  /* Presence, not a column: a capability is only true while the device is
   * connected, so it lives and dies with the control connection's Redis key. */
  capabilities: hostCapabilitiesSchema.optional(),
});

const sessionOutcomeSchema = z.discriminatedUnion('accepted', [
  z.object({ accepted: z.literal(true) }),
  z.object({ accepted: z.literal(false), code: z.string() }),
]);

const controlEnvelopeSchema = z.discriminatedUnion('kind', [
  z.object({ connectionId: z.string(), kind: z.literal('message'), payload: z.string() }),
  z.object({ connectionId: z.string(), kind: z.literal('close'), reason: z.string() }),
]);

const hostGrantSchema = z.object({
  sessionId: z.string(),
  deviceId: z.string(),
  route: z.enum(['runtime', 'fs', 'agent']),
});

/**
 * The three channel concerns, each on its own socket.
 *
 * `agent` carries the daemon's chat wire (PH19): the API splices its frames and
 * stores nothing from them — no chat content ever reaches Postgres, exactly as
 * for `runtime` and `fs`.
 */
type HostRoute = 'runtime' | 'fs' | 'agent';

const hostRoutes: readonly HostRoute[] = ['runtime', 'fs', 'agent'];

/**
 * The sockets one session currently has parked here, and the keepalive that
 * holds its Redis record open while it has any.
 */
type SessionRelay = {
  readonly sockets: Set<WebSocket>;
  readonly deviceId: string;
  readonly timer: NodeJS.Timeout;
};

type OnlineDevice = {
  readonly socket: WebSocket;
  readonly connectionId: string;
  readonly subscriber: ReturnType<RedisService['createDuplicateClient']>;
  readonly presenceTimer: NodeJS.Timeout;
  runtimeVersion?: string;
  capacity?: number;
  capabilities?: HostCapabilities;
};

/**
 * A device row as its owner sees it: the credential hashes never leave this
 * service, and everything a live control connection advertises is merged in.
 */
type HostDeviceListing = Omit<typeof hostDevice.$inferSelect, 'credentialHash' | 'gitCredentialHash'> & {
  readonly online: boolean;
  readonly runtimeVersion: string | undefined;
  readonly capacity: number | undefined;
  readonly agent: HostCapabilities['agent'];
};

/** The browser's half of a session the daemon has just accepted. */
type HostSessionOffer = {
  readonly id: string;
  readonly runtimeVersion: string;
  readonly expiresAt: string;
  readonly url: string;
  readonly runtimeUrl: string;
  readonly fileSystemUrl: string;
  readonly agentUrl?: string;
};

const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('base64url');
const pairingKey = (deviceCodeHash: string): string => `host:pairing:device:${deviceCodeHash}`;
const userCodeKey = (userCode: string): string => `host:pairing:user:${userCode}`;
const sessionKey = (sessionId: string): string => `host:session:${sessionId}`;
const browserRouteKey = (sessionId: string, route: HostRoute): string => `host:browser:${sessionId}:${route}`;
const hostGrantKey = (grantHash: string): string => `host:host-grant:${grantHash}`;
const onlineDeviceKey = (deviceId: string): string => `host:online:${deviceId}`;
const controlChannel = (deviceId: string): string => `host:control:${deviceId}`;
const sessionOutcomeKey = (sessionId: string): string => `host:session-outcome:${sessionId}`;
/**
 * The offer reaches the daemon on pub/sub; its answer comes back the same way.
 *
 * The `getdel` on {@link sessionOutcomeKey} stays as the fallback — it is what
 * makes the answer survive a replica that is not subscribed, and what makes the
 * outcome consumable exactly once — but polling it was the whole latency of a
 * reconnect: measured p50 96.9 ms of a 139 ms dial, against a daemon whose real
 * accept took 5.3 ms.
 */
const sessionOutcomeChannel = (sessionId: string): string => `host:session-outcome-channel:${sessionId}`;
const deviceSessionsKey = (deviceId: string): string => `host:device-sessions:${deviceId}`;
const normalizeUserCode = (code: string): string => code.toUpperCase().replaceAll(/[^A-Z0-9]/gu, '');
/**
 * Ruling 4: an agent grant exists only for a device that advertised the
 * capability. Minting one unconditionally would hand the browser an `agentUrl`
 * no daemon ever splices, and the client would wait out a socket that never
 * opens.
 *
 * @param capabilities - What the device's control `ready` frame advertised.
 * @returns The one-use grant, or `undefined` for a compute-only device.
 */
const mintAgentGrant = (
  capabilities: HostCapabilities | undefined,
): { readonly authorization: string; readonly hash: string } | undefined => {
  if (!capabilities?.agent) {
    return undefined;
  }
  const authorization = randomBytes(32).toString('base64url');
  return { authorization, hash: hashSecret(authorization) };
};
/**
 * Every cloud host wears the same name, because there is only ever one per
 * project and the row it produces is what the selector renders.
 */
const cloudHostLabel = 'Tau Cloud';
/** How many directory rows one host lists; a page has no use for more. */
const runListLimit = 200;
const newDeviceId = (): string => `agent_${randomUUID().replaceAll('-', '')}`;
const randomUserCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
};

@Injectable()
export class HostsService implements OnModuleDestroy {
  private readonly onlineDevices = new Map<string, OnlineDevice>();
  private readonly relayHandles = new Map<WebSocket, DistributedRelayHandle>();
  private readonly sessionSockets = new Map<string, SessionRelay>();
  /** Devices whose control socket this process closed when it began to stop. */
  private readonly departedAtStop = new Set<string>();
  readonly #logger = new Logger(HostsService.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<Environment, true>,
    /* Defaulted, not optional: the module injects the configured provisioner and
     * a hand-constructed service (tests) gets the same one it would have in
     * production rather than a second concept to keep in sync. */
    @Inject(cloudHostProvisionerToken)
    private readonly cloudHostProvisioner: CloudHostProvisioner = createConfiguredCloudHostProvisioner(),
    // oxlint-disable-next-line new-cap -- NestJS decorator
    @Optional() private readonly shutdown: ShutdownService = new ShutdownService(),
  ) {
    this.shutdown.signal.addEventListener(
      'abort',
      () => {
        this.departAll();
      },
      { once: true },
    );
  }

  /** The backstop for a close that skipped the stop signal (tests, dev). */
  public onModuleDestroy(): void {
    this.departAll();
    this.onlineDevices.clear();
    this.relayHandles.clear();
    this.sessionSockets.clear();
  }

  public async createPairing(deviceLabel: string): Promise<{
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresAt: string;
    pollInterval: number;
  }> {
    const deviceCode = randomBytes(32).toString('base64url');
    const deviceCodeHash = hashSecret(deviceCode);
    let userCode = '';
    for (let attempt = 0; attempt < 5; attempt++) {
      userCode = randomUserCode();
      // oxlint-disable-next-line no-await-in-loop -- bounded collision retry
      const claimed = await this.redisService.client.set(
        userCodeKey(userCode),
        deviceCodeHash,
        'EX',
        pairingLifetimeSeconds,
        'NX',
      );
      if (claimed === 'OK') {
        break;
      }
      userCode = '';
    }
    if (!userCode) {
      throw new ConflictException({ code: 'PAIRING_CODE_UNAVAILABLE' });
    }
    const state = { deviceLabel, userCode };
    await this.redisService.client.set(pairingKey(deviceCodeHash), JSON.stringify(state), 'EX', pairingLifetimeSeconds);
    const frontend = new URL(this.configService.get('TAU_FRONTEND_URL', { infer: true }));
    frontend.pathname = '/';
    frontend.searchParams.set('settings', 'compute');
    frontend.searchParams.set('pair', userCode);
    return {
      deviceCode,
      userCode: `${userCode.slice(0, 4)}-${userCode.slice(4)}`,
      verificationUri: frontend.href,
      expiresAt: new Date(Date.now() + pairingLifetimeSeconds * 1000).toISOString(),
      pollInterval: pairingPollInterval,
    };
  }

  public async approvePairing(userCodeInput: string, userId: string): Promise<void> {
    const userCode = normalizeUserCode(userCodeInput);
    const deviceCodeHash = await this.redisService.client.get(userCodeKey(userCode));
    if (!deviceCodeHash) {
      throw new GoneException({ code: 'PAIRING_CODE_EXPIRED' });
    }
    const result = await this.redisService.client.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local state = cjson.decode(raw)
       if state.approvedUserId then return 2 end
       state.approvedUserId = ARGV[1]
       redis.call('SET', KEYS[1], cjson.encode(state), 'KEEPTTL')
       return 1`,
      1,
      pairingKey(deviceCodeHash),
      userId,
    );
    if (result === 0) {
      throw new GoneException({ code: 'PAIRING_CODE_EXPIRED' });
    }
    if (result === 2) {
      throw new ConflictException({ code: 'PAIRING_CODE_ALREADY_APPROVED' });
    }
  }

  public async exchangePairing(
    deviceCode: string,
  ): Promise<{ deviceId: string; credential: string; accountId: string } | undefined> {
    const deviceCodeHash = hashSecret(deviceCode);
    const raw = await this.redisService.client.get(pairingKey(deviceCodeHash));
    if (!raw) {
      throw new GoneException({ code: 'PAIRING_CODE_EXPIRED' });
    }
    const state = pairingStateSchema.parse(JSON.parse(raw));
    if (!state.approvedUserId) {
      return undefined;
    }
    const consumed = await this.redisService.client.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return nil end
       local state = cjson.decode(raw)
       if not state.approvedUserId then return nil end
       redis.call('DEL', KEYS[1], KEYS[2])
       return raw`,
      2,
      pairingKey(deviceCodeHash),
      userCodeKey(state.userCode),
    );
    if (typeof consumed !== 'string') {
      throw new ConflictException({ code: 'PAIRING_CODE_ALREADY_EXCHANGED' });
    }
    const approved = pairingStateSchema.parse(JSON.parse(consumed));
    if (!approved.approvedUserId) {
      throw new ConflictException({ code: 'PAIRING_NOT_APPROVED' });
    }
    const credential = randomBytes(32).toString('base64url');
    const deviceId = newDeviceId();
    await this.databaseService.database.insert(hostDevice).values({
      id: deviceId,
      ownerId: approved.approvedUserId,
      label: approved.deviceLabel,
      credentialHash: hashSecret(credential),
    });
    /* The account the device acts for: the daemon names it as its funded principal (GI-Q6, W6 RH-S6). */
    return { deviceId, credential, accountId: approved.approvedUserId };
  }

  /**
   * Provision the cloud host for one project, or recover the one that exists.
   *
   * This is pairing with the user-code dance removed, and nothing else: the row
   * it writes is an ordinary `agent_device` owned by the caller, its credential
   * is minted the way {@link exchangePairing} mints one, and everything
   * downstream — the control connection, the offer, the agent channel, the
   * files-first log — is the code a laptop daemon already runs.
   *
   * The credentials are handed to the provisioner and to nobody else. They are
   * not in the return value and cannot be recovered from the row, which stores
   * only their hashes; a lost cloud host is revoked and provisioned again.
   *
   * Two credentials, because a cloud host runs model-authored code (I10): the
   * device credential opens the control socket and the model gateway, and the
   * push credential minted beside it opens this project's git routes and
   * nothing else (D21). Revoking the row kills both.
   *
   * @param options - The owner and the project whose host this is.
   * @returns The device the caller can now place turns on.
   * @throws `ConflictException({ code: 'PROJECT_NOT_ON_TAU_CLOUD', message })` when
   * the caller owns no project of this id on Tau Cloud: the host clones the
   * project's Hosted Remote at start, and its push credential cannot register
   * one, so a container provisioned first would only restart on a `404`.
   * @throws `ServiceUnavailableException({ code: 'CLOUD_HOST_UNAVAILABLE', message })`
   * when the provisioner refuses or is unreachable; the half-created device is
   * revoked first.
   */
  public async provisionCloudHost(options: { userId: string; projectId: string }): Promise<{
    readonly deviceId: string;
    readonly label: string;
    readonly state: 'existing' | 'provisioned';
  }> {
    /* Registration *is* this row (P51, D1): a registered project clones — empty
     * until its first push — and anything else is a `404` the host can only
     * restart on. Owner only: a cloud host is a device of the owner (EQ5). */
    const [registered] = await this.databaseService.database
      .select({ id: project.id, ownerName: user.name })
      .from(project)
      .innerJoin(user, eq(user.id, project.ownerId))
      .where(and(eq(project.id, options.projectId), eq(project.ownerId, options.userId)))
      .limit(1);
    if (registered === undefined) {
      throw new ConflictException({
        code: 'PROJECT_NOT_ON_TAU_CLOUD',
        message: 'Back this project up to Tau Cloud before running its agent there.',
      });
    }
    const existing = await this.findCloudHost(options.userId, options.projectId);
    if (existing?.gitCredentialHash === null) {
      /* Provisioned before the push credential existed (RV-W10 F5): its
       * container can never clone or push, so answering `existing` would pin
       * the owner to a host that restart-loops. Retire it and start over. */
      await this.revokeDevice(existing.id, options.userId);
    } else if (existing) {
      return { deviceId: existing.id, label: existing.label, state: 'existing' };
    }
    const credential = randomBytes(32).toString('base64url');
    const gitCredential = mintHostGitCredential();
    const deviceId = newDeviceId();
    try {
      await this.databaseService.database.insert(hostDevice).values({
        id: deviceId,
        ownerId: options.userId,
        label: cloudHostLabel,
        credentialHash: hashSecret(credential),
        gitCredentialHash: hashHostGitCredential(gitCredential),
        cloudProjectId: options.projectId,
      });
    } catch (error) {
      /* `agent_device_cloud_project_idx` is the race guard: two provisioning
       * calls for one project can only produce one row, and the loser reads it
       * rather than inventing a second container. */
      const raced = await this.findCloudHost(options.userId, options.projectId);
      if (!raced) {
        throw error;
      }
      return { deviceId: raced.id, label: raced.label, state: 'existing' };
    }
    try {
      await this.cloudHostProvisioner.start({
        deviceId,
        credential,
        gitCredential,
        ownerId: options.userId,
        ownerName: registered.ownerName,
        projectId: options.projectId,
        apiUrl: this.configService.get('TAU_API_URL', { infer: true }),
      });
    } catch (error) {
      /* A device row whose container never started is worse than none: it holds
       * the project's unique slot and would be listed as a host that can never
       * come online. */
      await this.databaseService.database
        .update(hostDevice)
        .set({ revokedAt: new Date() })
        .where(eq(hostDevice.id, deviceId));
      /* Rethrowing the provisioner's own error made the filter answer `500
       * Internal server error`, and the browser had nothing to show: the reason
       * — no image, no Docker daemon — lived only in the API log. It is a
       * typed refusal of a downstream dependency, which is a 503.
       *
       * The reason rides `message`, not a `reason` key, because
       * `HttpExceptionFilter` rewrites every `HttpException` into the shared
       * `HttpErrorResponse` and drops keys that shape does not have; `message`
       * is the one it maps to `error`, which is what the browser reads. */
      throw new ServiceUnavailableException({
        code: 'CLOUD_HOST_UNAVAILABLE',
        message: cloudHostRefusalReason(error),
      });
    }
    return { deviceId, label: cloudHostLabel, state: 'provisioned' };
  }

  /**
   * The run directory rows one host owns, newest first.
   *
   * Identity and state only — this is how a client that lost its page discovers
   * a detached run and which host to tail; the run's content never left that
   * host's `events.jsonl`.
   *
   * @param deviceId - The host whose runs are listed.
   * @param userId - The caller, who must own the host.
   * @returns The directory rows.
   * @throws When the device is not the caller's.
   */
  public async listRuns(deviceId: string, userId: string): Promise<Array<typeof agentRun.$inferSelect>> {
    const owned = await this.databaseService.database
      .select({ id: hostDevice.id })
      .from(hostDevice)
      .where(and(eq(hostDevice.id, deviceId), eq(hostDevice.ownerId, userId), isNull(hostDevice.revokedAt)))
      .limit(1);
    if (owned.length === 0) {
      throw new NotFoundException({ code: 'AGENT_NOT_FOUND' });
    }
    return this.databaseService.database
      .select()
      .from(agentRun)
      .where(eq(agentRun.placement, deviceId))
      .orderBy(desc(agentRun.updatedAt))
      .limit(runListLimit);
  }

  public async authenticateDevice(
    authorization: string | undefined,
  ): Promise<typeof hostDevice.$inferSelect | undefined> {
    const credential = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : '';
    if (!credential) {
      return undefined;
    }
    const rows = await this.databaseService.database
      .select()
      .from(hostDevice)
      .where(and(eq(hostDevice.credentialHash, hashSecret(credential)), isNull(hostDevice.revokedAt)))
      .limit(1);
    return rows[0];
  }

  public async registerControl(deviceId: string, socket: WebSocket): Promise<void> {
    const connectionId = randomUUID();
    const existingRaw = await this.redisService.client.get(onlineDeviceKey(deviceId));
    const existing = existingRaw ? onlineDeviceStateSchema.safeParse(JSON.parse(existingRaw)) : undefined;
    const subscriber = this.redisService.createDuplicateClient();
    if (subscriber.status === 'wait') {
      await subscriber.connect();
    }
    await subscriber.subscribe(controlChannel(deviceId));
    subscriber.on('message', (_channel, raw) => {
      const parsed = controlEnvelopeSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.connectionId !== connectionId) {
        return;
      }
      if (parsed.data.kind === 'close') {
        socket.close(4003, parsed.data.reason);
      } else if (socket.readyState === socket.OPEN) {
        socket.send(parsed.data.payload);
      }
    });
    this.onlineDevices.get(deviceId)?.socket.close(4001, 'replaced by a new control connection');
    await this.redisService.client.set(
      onlineDeviceKey(deviceId),
      JSON.stringify({ connectionId }),
      'EX',
      controlPresenceLifetime,
    );
    if (existing?.success && existing.data.connectionId !== connectionId) {
      await this.publishControl(deviceId, {
        connectionId: existing.data.connectionId,
        kind: 'close',
        reason: 'replaced by a new control connection',
      });
    }
    const presenceTimer = setInterval(() => {
      void this.refreshControlPresence(deviceId, connectionId, socket);
    }, controlPresenceRefresh);
    presenceTimer.unref();
    this.onlineDevices.set(deviceId, { socket, connectionId, subscriber, presenceTimer });
    socket.once('close', () => {
      /* This connection's own timer and subscriber, whether or not it is still
       * the current one: a socket that was replaced never matches the map again,
       * and its refresh interval would outlive it for the process's lifetime. */
      clearInterval(presenceTimer);
      subscriber.disconnect();
      if (this.onlineDevices.get(deviceId)?.connectionId === connectionId) {
        this.onlineDevices.delete(deviceId);
      }
      /* Compare-and-set on the stored connection id: a replaced socket's close
       * must not wipe its successor's presence. */
      void this.deleteControlPresence(deviceId, connectionId);
    });
  }

  public async handleControlMessage(deviceId: string, raw: string): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.onlineDevices.get(deviceId)?.socket.close(1008, 'invalid control message');
      return;
    }
    const parsed = hostControlMessageSchema.safeParse(value);
    if (!parsed.success) {
      this.onlineDevices.get(deviceId)?.socket.close(1008, 'invalid control message');
      return;
    }
    const message = parsed.data;
    if (message.type === 'ready') {
      if (message.deviceId !== deviceId) {
        this.onlineDevices.get(deviceId)?.socket.close(1008, 'device mismatch');
        return;
      }
      const online = this.onlineDevices.get(deviceId);
      if (online) {
        online.runtimeVersion = message.runtimeVersion;
        online.capacity = message.capacity;
        online.capabilities = message.capabilities;
        await this.writeControlPresence(deviceId, online);
      }
      await this.databaseService.database
        .update(hostDevice)
        .set({ lastSeenAt: new Date() })
        .where(eq(hostDevice.id, deviceId));
      return;
    }
    if (message.type === 'run') {
      await this.recordRun(deviceId, message);
      return;
    }
    const session = await this.readSession(message.sessionId);
    if (session?.deviceId !== deviceId) {
      this.onlineDevices.get(deviceId)?.socket.close(1008, 'session device mismatch');
      return;
    }
    const outcome = message.type === 'accept' ? { accepted: true } : { accepted: false, code: message.code };
    const payload = JSON.stringify(outcome);
    /* Written before it is announced: the key is what a replica that missed the
     * announcement falls back to, so hearing the answer must never be possible
     * before the answer can be found. */
    await this.redisService.client.set(
      sessionOutcomeKey(message.sessionId),
      payload,
      'EX',
      Math.ceil(sessionOfferTimeout / 1000),
    );
    await this.redisService.client.publish(sessionOutcomeChannel(message.sessionId), payload);
  }

  public async listDevices(userId: string): Promise<HostDeviceListing[]> {
    const devices = await this.databaseService.database
      .select()
      .from(hostDevice)
      .where(and(eq(hostDevice.ownerId, userId), isNull(hostDevice.revokedAt)))
      .orderBy(desc(hostDevice.createdAt));
    return Promise.all(
      devices.map(async ({ credentialHash: _credentialHash, gitCredentialHash: _gitCredentialHash, ...device }) => {
        const raw = await this.redisService.client.get(onlineDeviceKey(device.id));
        const parsed = raw ? onlineDeviceStateSchema.safeParse(JSON.parse(raw)) : undefined;
        const online = parsed?.success ? parsed.data : undefined;
        return {
          ...device,
          online: online?.runtimeVersion !== undefined,
          runtimeVersion: online?.runtimeVersion,
          capacity: online?.capacity,
          /* Present only while the device is online *and* advertising it: a
           * client picks its placement from what the daemon can do right now. */
          agent: online?.capabilities?.agent,
        };
      }),
    );
  }

  public async renameDevice(deviceId: string, userId: string, label: string): Promise<void> {
    const updated = await this.databaseService.database
      .update(hostDevice)
      .set({ label })
      .where(and(eq(hostDevice.id, deviceId), eq(hostDevice.ownerId, userId), isNull(hostDevice.revokedAt)))
      .returning({ id: hostDevice.id });
    if (updated.length === 0) {
      throw new NotFoundException({ code: 'AGENT_NOT_FOUND' });
    }
  }

  /**
   * Stop and revoke every cloud host an account owns, ahead of the account's
   * deletion (W10 a4). A container holds a clone of the owner's project, so it
   * must not outlive the account; the rows themselves go with the cascade.
   *
   * Each host goes through {@link revokeDevice}, the same path as the owner's
   * own *Remove*. A host that cannot be stopped is logged and skipped rather
   * than thrown: a stuck container must never block an account deletion, and
   * `revokedAt` is written before the stop, so its credentials are dead
   * whatever happens to the container (the orphan sweep is a go-live item).
   *
   * @param ownerId - The account being deleted.
   */
  public async retireCloudHosts(ownerId: string): Promise<void> {
    const hosts = await this.databaseService.database
      .select({ id: hostDevice.id })
      .from(hostDevice)
      .where(and(eq(hostDevice.ownerId, ownerId), isNotNull(hostDevice.cloudProjectId), isNull(hostDevice.revokedAt)));
    for (const host of hosts) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- one account's cloud hosts, one per project; sequential keeps the Docker daemon calm.
        await this.revokeDevice(host.id, ownerId);
      } catch (error) {
        this.#logger.warn(
          { err: error, deviceId: host.id },
          'A cloud host could not be stopped during account deletion',
        );
      }
    }
  }

  public async revokeDevice(deviceId: string, userId: string): Promise<void> {
    const updated = await this.databaseService.database
      .update(hostDevice)
      .set({ revokedAt: new Date() })
      .where(and(eq(hostDevice.id, deviceId), eq(hostDevice.ownerId, userId), isNull(hostDevice.revokedAt)))
      .returning({ id: hostDevice.id, cloudProjectId: hostDevice.cloudProjectId });
    if (updated.length === 0) {
      throw new NotFoundException({ code: 'AGENT_NOT_FOUND' });
    }
    /* A cloud host *is* its container: revoking the credential without stopping
     * it would leave a machine running with nothing to talk to. A paired laptop
     * has no container and is left alone. `revokedAt` is also what kills the
     * push credential (D21): its next git request resolves to nobody, so a
     * container that outlives this stop still cannot push. */
    if (updated[0]?.cloudProjectId) {
      await this.cloudHostProvisioner.stop(deviceId);
    }
    const onlineRaw = await this.redisService.client.get(onlineDeviceKey(deviceId));
    const online = onlineRaw ? onlineDeviceStateSchema.safeParse(JSON.parse(onlineRaw)) : undefined;
    if (online?.success) {
      await this.publishControl(deviceId, {
        connectionId: online.data.connectionId,
        kind: 'close',
        reason: 'device revoked',
      });
    }
    await this.redisService.client.del(onlineDeviceKey(deviceId));
    const distributedSessionIds = await this.redisService.client.smembers(deviceSessionsKey(deviceId));
    const sessionIds = new Set([...this.sessionSockets.keys(), ...distributedSessionIds]);
    const sessions = await Promise.all(
      [...sessionIds].map(async (sessionId) => ({ sessionId, state: await this.readSession(sessionId) })),
    );
    const deletions: Array<Promise<void>> = [];
    for (const { sessionId, state } of sessions) {
      if (state?.deviceId !== deviceId) {
        continue;
      }
      const sockets = this.sessionSockets.get(sessionId)?.sockets ?? [];
      for (const socket of sockets) {
        socket.close(4003, 'device revoked');
      }
      // oxlint-disable-next-line no-await-in-loop -- bounded by the device's own session count, which its advertised capacity keeps at one or two.
      await this.publishSessionClose(sessionId, 'device revoked');
      deletions.push(this.deleteSession(sessionId, state));
    }
    await Promise.all(deletions);
  }

  public async createSession(options: {
    deviceId: string;
    userId: string;
    runtimeVersion: string;
  }): Promise<HostSessionOffer> {
    const owned = await this.databaseService.database
      .select({ id: hostDevice.id })
      .from(hostDevice)
      .where(
        and(eq(hostDevice.id, options.deviceId), eq(hostDevice.ownerId, options.userId), isNull(hostDevice.revokedAt)),
      )
      .limit(1);
    if (owned.length === 0) {
      throw new NotFoundException({ code: 'AGENT_NOT_FOUND' });
    }
    const onlineRaw = await this.redisService.client.get(onlineDeviceKey(options.deviceId));
    const onlineParsed = onlineRaw ? onlineDeviceStateSchema.safeParse(JSON.parse(onlineRaw)) : undefined;
    const online = onlineParsed?.success ? onlineParsed.data : undefined;
    if (!online?.runtimeVersion) {
      throw new ConflictException({ code: 'DEVICE_OFFLINE' });
    }
    if (online.runtimeVersion !== options.runtimeVersion) {
      throw new ConflictException({ code: 'VERSION_MISMATCH', runtimeVersion: online.runtimeVersion });
    }

    const sessionId = `as_${randomUUID().replaceAll('-', '')}`;
    const runtimeAuthorization = randomBytes(32).toString('base64url');
    const fileSystemAuthorization = randomBytes(32).toString('base64url');
    const agent = mintAgentGrant(online.capabilities);
    const expiresAt = new Date(Date.now() + sessionLifetimeSeconds * 1000).toISOString();
    const state = {
      userId: options.userId,
      deviceId: options.deviceId,
      runtimeVersion: options.runtimeVersion,
      expiresAt,
      runtimeGrantHash: hashSecret(runtimeAuthorization),
      fileSystemGrantHash: hashSecret(fileSystemAuthorization),
      ...(agent ? { agentGrantHash: agent.hash } : {}),
    };
    const grants: ReadonlyArray<readonly [HostRoute, string]> = [
      ['runtime', state.runtimeGrantHash],
      ['fs', state.fileSystemGrantHash],
      ...(agent ? [['agent', agent.hash] as const] : []),
    ];
    const pipeline = this.redisService.client.multi();
    pipeline.set(sessionKey(sessionId), JSON.stringify(state), 'EX', sessionLifetimeSeconds);
    for (const [route, grantHash] of grants) {
      pipeline.set(browserRouteKey(sessionId, route), '1', 'EX', sessionLifetimeSeconds);
      pipeline.set(
        hostGrantKey(grantHash),
        JSON.stringify({ sessionId, deviceId: options.deviceId, route }),
        'EX',
        sessionLifetimeSeconds,
      );
    }
    pipeline.sadd(deviceSessionsKey(options.deviceId), sessionId);
    pipeline.expire(deviceSessionsKey(options.deviceId), sessionLifetimeSeconds);
    await pipeline.exec();

    const apiUrl = new URL(this.configService.get('TAU_API_URL', { infer: true }));
    apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const browserRuntimeUrl = new URL(`/v1/agents/sessions/${sessionId}/browser/runtime`, apiUrl);
    const browserFileSystemUrl = new URL(`/v1/agents/sessions/${sessionId}/browser/fs`, apiUrl);
    const browserAgentUrl = new URL(`/v1/agents/sessions/${sessionId}/browser/agent`, apiUrl);
    const browserBaseUrl = new URL(`/v1/agents/sessions/${sessionId}/browser`, apiUrl);
    const hostRuntimeUrl = new URL(`/v1/agents/sessions/${sessionId}/host/runtime`, apiUrl);
    const hostFileSystemUrl = new URL(`/v1/agents/sessions/${sessionId}/host/fs`, apiUrl);
    const hostAgentUrl = new URL(`/v1/agents/sessions/${sessionId}/host/agent`, apiUrl);

    const offer = JSON.stringify({
      v: 1,
      type: 'offer',
      sessionId,
      runtimeVersion: options.runtimeVersion,
      runtimeUrl: hostRuntimeUrl.href,
      fileSystemUrl: hostFileSystemUrl.href,
      runtimeAuthorization,
      fileSystemAuthorization,
      ...(agent ? { agentUrl: hostAgentUrl.href, agentAuthorization: agent.authorization } : {}),
      expiresAt,
    });
    const delivered = await this.publishControl(options.deviceId, {
      connectionId: online.connectionId,
      kind: 'message',
      payload: offer,
    });
    const outcome = delivered > 0 ? await this.waitForSessionOutcome(sessionId, options.deviceId) : undefined;
    if (!outcome?.accepted) {
      await this.deleteSession(sessionId, state);
      throw new ConflictException({ code: outcome?.code ?? 'CHILD_UNAVAILABLE' });
    }
    return {
      id: sessionId,
      runtimeVersion: options.runtimeVersion,
      expiresAt,
      url: browserBaseUrl.href,
      runtimeUrl: browserRuntimeUrl.href,
      fileSystemUrl: browserFileSystemUrl.href,
      ...(agent ? { agentUrl: browserAgentUrl.href } : {}),
    };
  }

  public async acceptBrowserRoute(options: {
    sessionId: string;
    route: HostRoute;
    userId: string;
    socket: WebSocket;
  }): Promise<void> {
    const state = await this.readSession(options.sessionId);
    if (!state || state.userId !== options.userId) {
      options.socket.close(1008, 'session unavailable');
      return;
    }
    const marker = await this.redisService.client.getdel(browserRouteKey(options.sessionId, options.route));
    if (!marker) {
      options.socket.close(1008, 'route already consumed');
      return;
    }
    await this.parkRoute({ ...options, side: 'browser', deviceId: state.deviceId });
  }

  public async acceptHostRoute(options: {
    sessionId: string;
    route: HostRoute;
    authorization: string | undefined;
    socket: WebSocket;
  }): Promise<void> {
    const credential = options.authorization?.startsWith('Bearer ')
      ? options.authorization.slice('Bearer '.length)
      : '';
    const raw = credential ? await this.redisService.client.getdel(hostGrantKey(hashSecret(credential))) : undefined;
    if (!raw) {
      options.socket.close(1008, 'host grant unavailable');
      return;
    }
    const grant = hostGrantSchema.parse(JSON.parse(raw));
    if (grant.sessionId !== options.sessionId || grant.route !== options.route) {
      options.socket.close(1008, 'host grant route mismatch');
      return;
    }
    const device = await this.databaseService.database
      .select({ id: hostDevice.id })
      .from(hostDevice)
      .where(and(eq(hostDevice.id, grant.deviceId), isNull(hostDevice.revokedAt)))
      .limit(1);
    if (device.length === 0) {
      // 4003, like `revokeDevice`'s closes: one cause, one code, whichever socket hears it first.
      options.socket.close(4003, 'device revoked');
      return;
    }
    await this.parkRoute({ ...options, side: 'host', deviceId: grant.deviceId });
  }

  private async findCloudHost(userId: string, projectId: string) {
    const rows = await this.databaseService.database
      .select({ id: hostDevice.id, label: hostDevice.label, gitCredentialHash: hostDevice.gitCredentialHash })
      .from(hostDevice)
      .where(
        and(eq(hostDevice.ownerId, userId), eq(hostDevice.cloudProjectId, projectId), isNull(hostDevice.revokedAt)),
      )
      .limit(1);
    return rows[0];
  }

  /**
   * Upsert one run's directory row from its host's control frame.
   *
   * The owner and the project are read from the device rather than trusted from
   * the wire: a daemon knows neither (its T0 vocabulary carries no project
   * identity), and a compromised one must not be able to file a run against
   * somebody else's account.
   *
   * ponytail: one indexed primary-key read per lifecycle transition (about five
   * per run). Cache the owner on the control connection if a host ever reports
   * often enough for it to matter.
   */
  private async recordRun(
    deviceId: string,
    message: Extract<HostControlMessage, { readonly type: 'run' }>,
  ): Promise<void> {
    const rows = await this.databaseService.database
      .select({ ownerId: hostDevice.ownerId, cloudProjectId: hostDevice.cloudProjectId })
      .from(hostDevice)
      .where(and(eq(hostDevice.id, deviceId), isNull(hostDevice.revokedAt)))
      .limit(1);
    const device = rows[0];
    if (!device) {
      return;
    }
    const updatedAt = new Date(message.updatedAt);
    const row = {
      runId: message.runId,
      chatId: message.chatId,
      projectId: message.projectId ?? device.cloudProjectId,
      ownerId: device.ownerId,
      placement: deviceId,
      state: message.state,
      updatedAt,
    };
    await this.databaseService.database
      .insert(agentRun)
      .values(row)
      .onConflictDoUpdate({
        target: agentRun.runId,
        set: { chatId: row.chatId, projectId: row.projectId, state: row.state, updatedAt },
        /* Frames are ordered on one socket but a reconnect can replay an older
         * one; a directory that can go backwards is worse than a stale one. */
        setWhere: lt(agentRun.updatedAt, updatedAt),
      });
  }

  private async parkRoute(options: {
    readonly sessionId: string;
    readonly route: HostRoute;
    readonly side: 'browser' | 'host';
    readonly deviceId: string;
    readonly socket: WebSocket;
  }): Promise<void> {
    const { sessionId, route, side, socket } = options;
    const parked = this.sessionSockets.get(sessionId) ?? this.openSessionRelay(sessionId, options.deviceId);
    parked.sockets.add(socket);
    /* Registered before the first await, because every await below is a window
     * in which this socket can die: a `close` attached after the event never
     * fires, and the session's keepalive would then refresh a record no socket
     * is using for the process's lifetime.
     *
     * Bookkeeping only. The relay tears *itself* down once it has published the
     * departure to its peer, and closing its handle from here would run first
     * and cancel that publish — which is the defect this ordering exists to fix. */
    const release = (): void => {
      parked.sockets.delete(socket);
      if (parked.sockets.size === 0 && this.sessionSockets.get(sessionId) === parked) {
        clearInterval(parked.timer);
        this.sessionSockets.delete(sessionId);
      }
      this.relayHandles.delete(socket);
    };
    socket.once('close', release);
    /* Immediately, too: a route dialled late in the session's window would
     * otherwise wait up to a full interval for its first refresh. */
    await this.touchSession(sessionId, parked.deviceId);

    const relay = await relayHostFramesThroughRedis({
      socket,
      writer: this.redisService.client,
      reader: this.redisService.createDuplicateClient(),
      sessionId,
      route,
      side,
    });
    this.relayHandles.set(socket, relay);
    if (socket.readyState === socket.CLOSED) {
      release();
    }
  }

  private openSessionRelay(sessionId: string, deviceId: string): SessionRelay {
    /* One keepalive per session, not per socket and not per frame: the cost is a
     * single pipeline every 30 s regardless of how much is flowing. */
    const timer = setInterval(() => {
      void this.touchSession(sessionId, deviceId);
    }, sessionRefreshInterval);
    timer.unref();
    const relay: SessionRelay = { sockets: new Set(), deviceId, timer };
    this.sessionSockets.set(sessionId, relay);
    return relay;
  }

  /**
   * Hold one session's Redis record open while it is in use.
   *
   * `sessionLifetimeSeconds` bounds an *unclaimed* offer. Once a socket is
   * parked, letting the record expire underneath it left the API unable to
   * admit the session's remaining routes, and unable to find — so unable to
   * close — a live session on `revokeDevice`. The keys that were already
   * consumed (`getdel`-ed markers and grants) are simply missing, and `EXPIRE`
   * on a missing key is a no-op, so this needs no bookkeeping about which
   * routes were dialled.
   *
   * @param sessionId - The session with at least one open socket.
   * @param deviceId - Owner of the session, whose session set expires with it.
   */
  private async touchSession(sessionId: string, deviceId: string): Promise<void> {
    const pipeline = this.redisService.client.multi();
    pipeline.expire(sessionKey(sessionId), sessionLifetimeSeconds);
    for (const route of hostRoutes) {
      pipeline.expire(browserRouteKey(sessionId, route), sessionLifetimeSeconds);
    }
    pipeline.expire(deviceSessionsKey(deviceId), sessionLifetimeSeconds);
    await pipeline.exec();
  }

  private async readSession(sessionId: string) {
    const raw = await this.redisService.client.get(sessionKey(sessionId));
    return raw ? sessionStateSchema.parse(JSON.parse(raw)) : undefined;
  }

  private async deleteSession(sessionId: string, state: z.infer<typeof sessionStateSchema>): Promise<void> {
    await this.redisService.client.del(
      sessionKey(sessionId),
      ...hostRoutes.map((route) => browserRouteKey(sessionId, route)),
      hostGrantKey(state.runtimeGrantHash),
      hostGrantKey(state.fileSystemGrantHash),
      ...(state.agentGrantHash ? [hostGrantKey(state.agentGrantHash)] : []),
    );
    await this.redisService.client.srem(deviceSessionsKey(state.deviceId), sessionId);
  }

  private async publishControl(deviceId: string, envelope: z.infer<typeof controlEnvelopeSchema>): Promise<number> {
    return this.redisService.client.publish(controlChannel(deviceId), JSON.stringify(envelope));
  }

  private async writeControlPresence(deviceId: string, online: OnlineDevice): Promise<void> {
    await this.redisService.client.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local state = cjson.decode(raw)
       if state.connectionId ~= ARGV[1] then return 0 end
       redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
       return 1`,
      1,
      onlineDeviceKey(deviceId),
      online.connectionId,
      JSON.stringify({
        connectionId: online.connectionId,
        runtimeVersion: online.runtimeVersion,
        capacity: online.capacity,
        capabilities: online.capabilities,
      }),
      controlPresenceLifetime,
    );
  }

  private async refreshControlPresence(deviceId: string, connectionId: string, socket: WebSocket): Promise<void> {
    const result = await this.redisService.client.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local state = cjson.decode(raw)
       if state.connectionId ~= ARGV[1] then return 0 end
       redis.call('EXPIRE', KEYS[1], ARGV[2])
       return 1`,
      1,
      onlineDeviceKey(deviceId),
      connectionId,
      controlPresenceLifetime,
    );
    if (result !== 1) {
      socket.close(4001, 'control connection replaced');
    }
  }

  /**
   * Tells every socket on this process that it is going, while Redis is still
   * up: control and relay sockets close with 1012 (Service Restart), so daemons
   * and browsers reconnect to a Machine that is staying; presence is deleted so
   * no offer is routed to a connection that is closing; and each relay
   * publishes its departure, so the peer half on another Machine closes and
   * frees its session slot rather than waiting on a socket that is gone. The
   * Redis writes are tracked, not awaited: this runs inside the stop, which must
   * not wait on I/O before the listener closes. Runs once; later calls find
   * nothing left to depart.
   */
  private departAll(): void {
    for (const [deviceId, device] of this.onlineDevices) {
      if (device.socket.readyState !== device.socket.OPEN) {
        continue;
      }
      clearInterval(device.presenceTimer);
      device.subscriber.disconnect();
      device.socket.close(1012, 'service restart');
      this.departedAtStop.add(deviceId);
      this.shutdown.track(this.deleteControlPresence(deviceId, device.connectionId));
    }
    for (const relay of this.sessionSockets.values()) {
      clearInterval(relay.timer);
      for (const socket of relay.sockets) {
        socket.close(1012, 'service restart');
      }
    }
    for (const relay of this.relayHandles.values()) {
      /* Departure first: `close()` alone marks the relay closed, and the
         socket's own close event would then find nothing left to publish. Once
         the publish has started, `close()` only stops the inbound reader. */
      this.shutdown.track(relay.depart(1012, 'service restart'));
      relay.close();
    }
  }

  private async deleteControlPresence(deviceId: string, connectionId: string): Promise<void> {
    await this.redisService.client.eval(
      `local raw = redis.call('GET', KEYS[1])
       if not raw then return 0 end
       local state = cjson.decode(raw)
       if state.connectionId ~= ARGV[1] then return 0 end
       return redis.call('DEL', KEYS[1])`,
      1,
      onlineDeviceKey(deviceId),
      connectionId,
    );
  }

  /**
   * Wait for the daemon's answer to one offer.
   *
   * The answer arrives on pub/sub — the channel the offer itself travelled on —
   * and the `getdel` poll stays underneath it as the cross-replica fallback and
   * as the exactly-once consumption. Polling alone *was* the latency of a
   * reconnect: p50 96.9 ms of a 139 ms dial against a daemon that accepted in
   * 5.3 ms, because the answer landed just after a tick.
   *
   * @param sessionId - The offer being waited on.
   * @param deviceId - The daemon the offer went to.
   * @returns The outcome, or `undefined` when the offer timed out or cannot be answered.
   */
  private async waitForSessionOutcome(
    sessionId: string,
    deviceId: string,
  ): Promise<z.infer<typeof sessionOutcomeSchema> | undefined> {
    const announced = Promise.withResolvers<z.infer<typeof sessionOutcomeSchema>>();
    const subscriber = this.redisService.createDuplicateClient();
    try {
      subscriber.on('message', (_channel: string, raw: string) => {
        try {
          announced.resolve(sessionOutcomeSchema.parse(JSON.parse(raw)));
        } catch {
          /* A malformed announcement is not an answer; the poll still is. */
        }
      });
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      await subscriber.subscribe(sessionOutcomeChannel(sessionId));
      return await this.pollSessionOutcome(sessionId, deviceId, announced.promise);
    } finally {
      subscriber.disconnect();
    }
  }

  private async pollSessionOutcome(
    sessionId: string,
    deviceId: string,
    announced: Promise<z.infer<typeof sessionOutcomeSchema>>,
  ): Promise<z.infer<typeof sessionOutcomeSchema> | undefined> {
    const deadline = Date.now() + sessionOfferTimeout;
    /* A daemon whose control socket this process closed at stop never sees the
       offer: it went out on that socket's subscription. Give up within a tick
       rather than hold the drain for the full timeout; the caller's retry lands
       on the Machine the daemon has reconnected to. A daemon connected
       elsewhere still answers through Redis, so its offer keeps waiting. */
    while (Date.now() < deadline && !this.departedAtStop.has(deviceId)) {
      // oxlint-disable-next-line no-await-in-loop -- broker polling is bounded by the offer timeout.
      const raw = await this.redisService.client.getdel(sessionOutcomeKey(sessionId));
      if (raw) {
        return sessionOutcomeSchema.parse(JSON.parse(raw));
      }
      /* The announcement, or the next tick — whichever lands first. */
      // oxlint-disable-next-line no-await-in-loop -- avoid process-local resolvers across replicas.
      const heard = await Promise.race([
        announced,
        new Promise<undefined>((resolve) => {
          setTimeout(() => {
            resolve(undefined);
          }, 100);
        }),
      ]);
      if (heard) {
        /* Consume the record the announcement duplicates, so a retry of this
         * session cannot read a stale answer. */
        // oxlint-disable-next-line no-await-in-loop -- the loop returns immediately after.
        await this.redisService.client.del(sessionOutcomeKey(sessionId));
        return heard;
      }
    }
    return undefined;
  }

  private async publishSessionClose(sessionId: string, reason: string): Promise<void> {
    const envelope = JSON.stringify({ kind: 'close', code: 4003, reason });
    const pipeline = this.redisService.client.multi();
    for (const route of hostRoutes) {
      for (const direction of ['browser-host', 'host-browser'] as const) {
        const stream = `host:relay:${sessionId}:${route}:${direction}`;
        pipeline.xadd(stream, '*', 'payload', envelope);
        pipeline.expire(stream, sessionLifetimeSeconds);
      }
    }
    await pipeline.exec();
  }
}
