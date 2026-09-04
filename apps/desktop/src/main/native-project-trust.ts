import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type ProjectIdentity = {
  readonly path: string;
  readonly device: string;
  readonly inode: string;
  readonly birthtime: string;
};

export type NativeProjectTrustStore = {
  isTrusted(projectRoot: string): boolean;
  grant(projectRoot: string): void;
  revoke(projectRoot: string): void;
  markerPath(projectRoot: string): string;
};

export type NativeProjectTrustStoreOptions = {
  readonly storePath: string;
  readonly markerRoot: string;
};

const identify = (projectRoot: string): ProjectIdentity => {
  const path = realpathSync(resolve(projectRoot));
  const stats = statSync(path);
  if (!stats.isDirectory()) {
    throw new Error('Native-code trust can be granted only to a project directory.');
  }
  return { path, device: String(stats.dev), inode: String(stats.ino), birthtime: String(stats.birthtimeMs) };
};

const identityKey = (identity: ProjectIdentity): string =>
  `${identity.path}\0${identity.device}\0${identity.inode}\0${identity.birthtime}`;

/** Persist explicit native-code grants against physical directory identity. */
export const createNativeProjectTrustStore = ({
  storePath,
  markerRoot,
}: NativeProjectTrustStoreOptions): NativeProjectTrustStore => {
  const grants = new Map<string, ProjectIdentity>();
  try {
    const stored: unknown = JSON.parse(readFileSync(storePath, 'utf8'));
    for (const value of Array.isArray(stored) ? stored : []) {
      if (
        typeof value === 'object' &&
        value !== null &&
        typeof Reflect.get(value, 'path') === 'string' &&
        typeof Reflect.get(value, 'device') === 'string' &&
        typeof Reflect.get(value, 'inode') === 'string' &&
        typeof Reflect.get(value, 'birthtime') === 'string'
      ) {
        const identity = value as ProjectIdentity;
        grants.set(identity.path, identity);
      }
    }
  } catch {
    // No valid grants yet.
  }

  const persist = (): void => {
    mkdirSync(dirname(storePath), { recursive: true });
    const temporary = `${storePath}.tmp`;
    writeFileSync(temporary, `${JSON.stringify([...grants.values()], undefined, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    renameSync(temporary, storePath);
  };

  const markerForIdentity = (identity: ProjectIdentity): string => {
    const hash = createHash('sha256').update(identityKey(identity)).digest('hex');
    return resolve(markerRoot, `${hash}.json`);
  };

  const markerPath = (projectRoot: string): string => markerForIdentity(identify(projectRoot));

  const isTrusted = (projectRoot: string): boolean => {
    let current: ProjectIdentity;
    try {
      current = identify(projectRoot);
    } catch {
      return false;
    }
    const granted = grants.get(current.path);
    if (granted === undefined) {
      return false;
    }
    if (identityKey(granted) === identityKey(current)) {
      return true;
    }
    grants.delete(current.path);
    persist();
    rmSync(markerForIdentity(granted), { force: true });
    return false;
  };

  return {
    isTrusted,
    markerPath,
    grant(projectRoot) {
      const identity = identify(projectRoot);
      const previous = grants.get(identity.path);
      if (previous && identityKey(previous) !== identityKey(identity)) {
        rmSync(markerForIdentity(previous), { force: true });
      }
      grants.set(identity.path, identity);
      persist();
      const marker = markerPath(identity.path);
      mkdirSync(dirname(marker), { recursive: true });
      const temporary = `${marker}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ version: 1, trusted: true })}\n`, { encoding: 'utf8', mode: 0o600 });
      renameSync(temporary, marker);
    },
    revoke(projectRoot) {
      let identity: ProjectIdentity | undefined;
      try {
        identity = identify(projectRoot);
      } catch {
        // Remove a path-matched stale grant below.
      }
      const key = identity?.path ?? resolve(projectRoot);
      const granted = grants.get(key);
      grants.delete(key);
      persist();
      try {
        if (identity) {
          rmSync(markerForIdentity(identity), { force: true });
        }
        if (granted && (!identity || identityKey(granted) !== identityKey(identity))) {
          rmSync(markerForIdentity(granted), { force: true });
        }
      } catch {
        // The directory or its former marker no longer exists.
      }
    },
  };
};
