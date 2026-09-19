/** Actor identity established by a trusted host credential boundary. @public */
export type HostActor = Readonly<{ kind: 'user' | 'agent'; id: string }>;

/** Closed host routes that may receive a scoped local session. @public */
export type HostAdmissionRoute = 'jobs' | 'machines';

/** Canonical operations admitted by the jobs and machines host facets. @public */
export const hostAdmissionOperations = [
  'jobs.listProviders',
  'jobs.validate',
  'jobs.query',
  'jobs.submit',
  'jobs.get',
  'jobs.list',
  'jobs.watch',
  'jobs.cancel',
  'jobs.steer',
  'jobs.resume',
  'jobs.openArtifact',
  'machines.listProviders',
  'machines.discover',
  'machines.list',
  'machines.pairing.begin',
  'machines.pairing.status',
  'machines.unpair',
  'machines.snapshot',
  'machines.watch',
  'machines.captureStill',
  'machines.validate',
  'machines.query',
] as const;

/** Operations admitted on each host route. @public */
export type HostAdmissionOperation = (typeof hostAdmissionOperations)[number];

/** One exact route-operation grant issued by a trusted host. @public */
export type HostRouteGrant = Readonly<{ route: HostAdmissionRoute; operation: HostAdmissionOperation }>;

/** Trusted-only session issuance input. This is never a request payload. @public */
export type IssueHostSessionInput = Readonly<{
  actor: HostActor;
  authorityId: string;
  workspaceId: string;
  grants: readonly HostRouteGrant[];
}>;

declare const hostSessionHandleBrand: unique symbol;

/** Opaque, authority-local session identity. It is not a serializable bearer. @public */
export type HostSessionHandle = Readonly<{ [hostSessionHandleBrand]: never }>;

/** Named input for one route admission check. @public */
export type AdmitHostOperationInput = Readonly<{
  session: HostSessionHandle;
  authorityId: string;
  workspaceId: string;
  route: HostAdmissionRoute;
  operation: HostAdmissionOperation;
}>;

/** Refusal codes produced by local host admission. @public */
export type HostAdmissionRefusalCode =
  | 'INVALID_SESSION'
  | 'SESSION_REVOKED'
  | 'AUTHORITY_MISMATCH'
  | 'WORKSPACE_MISMATCH'
  | 'ROUTE_DENIED';

/** Structured fail-closed admission refusal. @public */
export class HostAdmissionRefusal extends Error {
  public readonly code: HostAdmissionRefusalCode;

  public constructor(code: HostAdmissionRefusalCode) {
    super(code);
    this.name = 'HostAdmissionRefusal';
    this.code = code;
  }
}

/** Successful admission, including an explicit fence for post-await checks. @public */
export type AdmittedHostOperation = Readonly<{
  hostId: string;
  actor: HostActor;
  authorityId: string;
  workspaceId: string;
  route: HostAdmissionRoute;
  operation: HostAdmissionOperation;
  assertCurrent(): void;
}>;

/** Authority-local issuer and admission checker. @public */
export type HostAdmissionAuthority = Readonly<{
  hostId: string;
  issueTrustedSession(input: IssueHostSessionInput): HostSessionHandle;
  admit(input: AdmitHostOperationInput): AdmittedHostOperation;
  revoke(session: HostSessionHandle): boolean;
}>;

/** Named input for {@link createHostAdmissionAuthority}. @public */
export type CreateHostAdmissionAuthorityInput = Readonly<{ hostId: string }>;

type SessionRecord = Readonly<{
  actor: HostActor;
  authorityId: string;
  workspaceId: string;
  grants: ReadonlySet<string>;
  state: { revoked: boolean };
}>;

const operationsByRoute: Readonly<Record<HostAdmissionRoute, ReadonlySet<HostAdmissionOperation>>> = {
  jobs: new Set(hostAdmissionOperations.filter((operation) => operation.startsWith('jobs.'))),
  machines: new Set(hostAdmissionOperations.filter((operation) => operation.startsWith('machines.'))),
};

const record = (value: unknown, keys: readonly string[], context: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`INVALID_${context}`);
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) {
      throw new TypeError(`INVALID_${context}`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError(`INVALID_${context}`);
    }
  }
  return value as Record<string, unknown>;
};

const own = (value: Record<string, unknown>, key: string): unknown =>
  Object.getOwnPropertyDescriptor(value, key)?.value;

const fixedGrantArray = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new TypeError('INVALID_HOST_GRANTS');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length: unknown = lengthDescriptor && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 64) {
    throw new TypeError('INVALID_HOST_GRANTS');
  }
  const allowedKeys = new Set<string>(['length']);
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    allowedKeys.add(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError('INVALID_HOST_GRANTS');
    }
    result.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !allowedKeys.has(key))) {
    throw new TypeError('INVALID_HOST_GRANTS');
  }
  return result;
};

const identity = (value: unknown, context: string): string => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !value.isWellFormed()) {
    throw new TypeError(`INVALID_${context}`);
  }
  return value;
};

const grantKey = (route: HostAdmissionRoute, operation: HostAdmissionOperation): string => `${route}\0${operation}`;

/**
 * Create one local admission authority. Credential verification remains in the
 * executable host which alone may call `issueTrustedSession`.
 *
 * @param input - Exact identity of the serving host.
 * @returns An authority whose opaque handles are valid only on this instance.
 * @public
 */
export const createHostAdmissionAuthority = (input: CreateHostAdmissionAuthorityInput): HostAdmissionAuthority => {
  const authorityInput = record(input, ['hostId'], 'HOST_ADMISSION_AUTHORITY');
  const hostId = identity(own(authorityInput, 'hostId'), 'HOST_ID');
  const sessions = new WeakMap<HostSessionHandle, SessionRecord>();

  const resolve = (session: HostSessionHandle): SessionRecord => {
    const found = sessions.get(session);
    if (found === undefined) {
      throw new HostAdmissionRefusal('INVALID_SESSION');
    }
    if (found.state.revoked) {
      throw new HostAdmissionRefusal('SESSION_REVOKED');
    }
    return found;
  };

  return Object.freeze({
    hostId,
    issueTrustedSession(input_) {
      const inputRecord = record(input_, ['actor', 'authorityId', 'workspaceId', 'grants'], 'HOST_SESSION');
      const actorRecord = record(own(inputRecord, 'actor'), ['kind', 'id'], 'HOST_ACTOR');
      const kind = own(actorRecord, 'kind');
      if (kind !== 'user' && kind !== 'agent') {
        throw new TypeError('INVALID_HOST_ACTOR');
      }
      const actor = Object.freeze({ kind, id: identity(own(actorRecord, 'id'), 'ACTOR_ID') });
      const authorityId = identity(own(inputRecord, 'authorityId'), 'AUTHORITY_ID');
      const workspaceId = identity(own(inputRecord, 'workspaceId'), 'WORKSPACE_ID');
      const grantsInput = fixedGrantArray(own(inputRecord, 'grants'));
      const grants = new Set<string>();
      for (const grantInput of grantsInput) {
        const grant = record(grantInput, ['route', 'operation'], 'HOST_GRANT');
        const route = own(grant, 'route');
        const operation = own(grant, 'operation');
        if (
          (route !== 'jobs' && route !== 'machines') ||
          typeof operation !== 'string' ||
          !operationsByRoute[route].has(operation as HostAdmissionOperation)
        ) {
          throw new TypeError('INVALID_HOST_GRANT');
        }
        const key = grantKey(route, operation as HostAdmissionOperation);
        if (grants.has(key)) {
          throw new TypeError('DUPLICATE_HOST_GRANT');
        }
        grants.add(key);
      }
      const handle = Object.freeze({}) as HostSessionHandle;
      sessions.set(handle, { actor, authorityId, workspaceId, grants, state: { revoked: false } });
      return handle;
    },
    admit(input_) {
      const inputRecord = record(
        input_,
        ['session', 'authorityId', 'workspaceId', 'route', 'operation'],
        'HOST_OPERATION_ADMISSION',
      );
      const session = own(inputRecord, 'session') as HostSessionHandle;
      const sessionRecord = resolve(session);
      const authorityId = identity(own(inputRecord, 'authorityId'), 'AUTHORITY_ID');
      const workspaceId = identity(own(inputRecord, 'workspaceId'), 'WORKSPACE_ID');
      const route = own(inputRecord, 'route');
      const operation = own(inputRecord, 'operation');
      if ((route !== 'jobs' && route !== 'machines') || typeof operation !== 'string') {
        throw new HostAdmissionRefusal('ROUTE_DENIED');
      }
      if (sessionRecord.authorityId !== authorityId) {
        throw new HostAdmissionRefusal('AUTHORITY_MISMATCH');
      }
      if (sessionRecord.workspaceId !== workspaceId) {
        throw new HostAdmissionRefusal('WORKSPACE_MISMATCH');
      }
      if (!operationsByRoute[route].has(operation as HostAdmissionOperation)) {
        throw new HostAdmissionRefusal('ROUTE_DENIED');
      }
      const operation_ = operation as HostAdmissionOperation;
      if (!sessionRecord.grants.has(grantKey(route, operation_))) {
        throw new HostAdmissionRefusal('ROUTE_DENIED');
      }
      return Object.freeze({
        hostId,
        actor: sessionRecord.actor,
        authorityId,
        workspaceId,
        route,
        operation: operation_,
        assertCurrent(): void {
          resolve(session);
        },
      });
    },
    revoke(session) {
      const found = sessions.get(session);
      if (found === undefined || found.state.revoked) {
        return false;
      }
      found.state.revoked = true;
      return true;
    },
  });
};
