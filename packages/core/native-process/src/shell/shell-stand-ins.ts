/**
 * Host-side stand-ins for absent protected paths on Linux, shared by every launch of this process.
 */
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, relative } from 'node:path';

import type { ShellFilesystem } from '#shell/shell-provider.js';

/** A stand-in this process created for an absent protected path, and how many live launches rely on it. */
type StandIn = { holders: number; directory: boolean };

const standIns = new Map<string, StandIn>();
let exitHookRegistered = false;

const inside = (path: string, root: string): boolean => {
  const step = relative(root, path);
  return step === '' || (!step.startsWith('..') && !isAbsolute(step));
};

const removeStandIn = (path: string, directory: boolean): void => {
  try {
    const info = lstatSync(path, { throwIfNoEntry: false });
    // Only the empty entry this process made is removed; anything written into it since is someone's real data.
    if (directory && info?.isDirectory() === true && readdirSync(path).length === 0) {
      rmdirSync(path);
    } else if (!directory && info?.isFile() === true && info.size === 0) {
      unlinkSync(path);
    }
  } catch {
    // Already gone or no longer ours.
  }
};

/** Claim the stand-in for one protected path: an existing one this process holds, or a new one it creates. */
const standInStep = (path: string, root: string, filesystem: ShellFilesystem): string | undefined => {
  const protectedPaths = new Set([...filesystem.denied, ...(filesystem.readOnly ?? [])]);
  const directories = new Set(filesystem.directories ?? []);
  const steps: string[] = [];
  for (let step = path; step !== root && inside(step, root); step = dirname(step)) {
    steps.unshift(step);
  }
  for (const step of steps) {
    const existing = standIns.get(step);
    if (existing !== undefined) {
      existing.holders += 1;
      return step;
    }
    const info = lstatSync(step, { throwIfNoEntry: false });
    if (info === undefined) {
      // An intermediate component, or a protected path the registry declares a directory, is an empty directory:
      // what Tau itself would create there. Only a file row is stood in for by an empty file.
      const directory = step !== path || directories.has(path);
      try {
        if (directory) {
          mkdirSync(step);
        } else {
          closeSync(openSync(step, 'wx'));
        }
      } catch {
        // Created by someone else meanwhile, or not creatable: the runtime handles it as before.
        return undefined;
      }
      standIns.set(step, { holders: 1, directory });
      return step;
    }
    if (step === path || info.isSymbolicLink() || !info.isDirectory() || protectedPaths.has(step)) {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Hold a host-side stand-in at the first absent component of every protected path inside a writable root, shared by
 * every Linux launch of this process, before the launch's sandbox configuration observes the filesystem.
 *
 * Bubblewrap can only mask a name that exists, so the runtime creates such a mount point itself and its supervisor
 * deletes it on exit, even while another launch's sandbox is mounted on it: that sandbox's mask detaches, and a launch
 * configured against the vanished entry binds a source that is gone. A stand-in instead exists from before any launch
 * that relies on it is configured until the last of them has ended, so the runtime never creates or deletes it. It is
 * an empty directory for an intermediate component or a directory row, and an empty file only for a file row, so the
 * product never finds a file where it reads a directory. Paths under an existing protected directory, a symbolic
 * link or a file are left alone: those are already covered, and the host never writes there.
 *
 * @internal
 * @param filesystem - The launch's filesystem grant.
 * @returns Release, idempotent: call it once the launch's sandbox and supervisor are gone.
 */
export const holdProtectedStandIns = (filesystem: ShellFilesystem): (() => void) => {
  if (process.platform !== 'linux') {
    return () => undefined;
  }
  const held: string[] = [];
  for (const path of [...filesystem.denied, ...(filesystem.readOnly ?? [])]) {
    const root = filesystem.writable
      .filter((candidate) => candidate !== path && inside(path, candidate))
      .toSorted((left, right) => right.length - left.length)[0];
    if (root === undefined) {
      continue;
    }
    const step = standInStep(path, root, filesystem);
    if (step !== undefined) {
      held.push(step);
    }
  }
  if (held.length > 0 && !exitHookRegistered) {
    exitHookRegistered = true;
    process.once('exit', () => {
      for (const [path, standIn] of standIns) {
        removeStandIn(path, standIn.directory);
      }
    });
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    for (const step of held.toSorted((left, right) => right.length - left.length)) {
      const standIn = standIns.get(step);
      if (standIn === undefined) {
        continue;
      }
      standIn.holders -= 1;
      if (standIn.holders === 0) {
        standIns.delete(step);
        removeStandIn(step, standIn.directory);
      }
    }
  };
};
