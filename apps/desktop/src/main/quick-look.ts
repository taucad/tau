/** Native macOS Quick Look panel lifecycle and trust-boundary validation. */

import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';

import type { ProjectRootRegistry } from '#main/project-roots.js';
import type { QuickLookPathRequest, QuickLookUsdzRequest } from '#shared/quick-look.js';

const staleSessionAgeMilliseconds = 24 * 60 * 60 * 1000;
const usdzLocalFileHeader = [0x50, 0x4b, 0x03, 0x04] as const;

type QuickLookWindow = {
  closeFilePreview(): void;
  previewFile(path: string, displayName?: string): void;
};

export type QuickLookController = {
  close(): void;
  dispose(): void;
  previewPath(payload: unknown): void;
  previewUsdz(payload: unknown): void;
};

type QuickLookControllerOptions = {
  readonly maxOutputBytes: number;
  readonly registry: ProjectRootRegistry;
  readonly temporaryRoot: string;
  readonly window: QuickLookWindow;
};

const isInside = (candidate: string, root: string): boolean => candidate === root || candidate.startsWith(root + sep);

const parseDisplayName = (value: unknown, fallback: string): string => {
  if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) {
    throw new TypeError('Quick Look displayName must be a non-empty string');
  }
  const raw = basename(typeof value === 'string' ? value.trim() : fallback).replaceAll(/\p{Cc}/gu, '');
  if (raw.length === 0) {
    throw new TypeError('Quick Look displayName is empty after sanitization');
  }
  return raw.slice(0, 160);
};

const trustedRealFile = (path: unknown, registry: ProjectRootRegistry): string => {
  if (typeof path !== 'string' || !isAbsolute(path) || !registry.isTrusted(path)) {
    throw new Error('Quick Look refused an untrusted file path');
  }
  const candidate = realpathSync(path);
  if (!statSync(candidate).isFile()) {
    throw new Error('Quick Look path is not a file');
  }
  const trusted = registry.roots().some((root) => {
    try {
      return isInside(candidate, realpathSync(root));
    } catch {
      return false;
    }
  });
  if (!trusted) {
    throw new Error('Quick Look refused a file that escapes its admitted root');
  }
  return candidate;
};

const parseUsdz = (payload: unknown, maximumBytes: number): QuickLookUsdzRequest => {
  const request = payload as Partial<QuickLookUsdzRequest> | undefined;
  if (!(request?.bytes instanceof Uint8Array)) {
    throw new TypeError('Quick Look USDZ bytes must be a Uint8Array');
  }
  const { bytes } = request;
  if (bytes.byteLength === 0 || bytes.byteLength > maximumBytes) {
    throw new Error(`Quick Look USDZ must be between 1 and ${String(maximumBytes)} bytes`);
  }
  if (!usdzLocalFileHeader.every((value, index) => bytes[index] === value)) {
    throw new Error('Quick Look USDZ does not have a ZIP local-file header');
  }
  return {
    bytes,
    displayName: parseDisplayName(request.displayName, 'model.usdz'),
  };
};

/** Remove abandoned session directories without touching unrelated temporary files. */
export const removeStaleQuickLookSessions = (
  temporaryRoot: string,
  now: number = Date.now(),
  maximumAgeMilliseconds: number = staleSessionAgeMilliseconds,
): void => {
  mkdirSync(temporaryRoot, { recursive: true });
  for (const entry of readdirSync(temporaryRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('session-')) {
      continue;
    }
    const path = join(temporaryRoot, entry.name);
    if (now - lstatSync(path).mtimeMs > maximumAgeMilliseconds) {
      rmSync(path, { recursive: true, force: true });
    }
  }
};

/** Create one Quick Look controller for one BrowserWindow. */
export const createQuickLookController = (options: QuickLookControllerOptions): QuickLookController => {
  mkdirSync(options.temporaryRoot, { recursive: true });
  const sessionDirectory = mkdtempSync(join(options.temporaryRoot, 'session-'));
  let generatedPath: string | undefined;
  let disposed = false;

  const close = (): void => {
    options.window.closeFilePreview();
    if (generatedPath !== undefined) {
      rmSync(generatedPath, { force: true });
      generatedPath = undefined;
    }
  };

  const assertActive = (): void => {
    if (disposed) {
      throw new Error('Quick Look controller is disposed');
    }
  };

  return {
    close,
    dispose() {
      if (disposed) {
        return;
      }
      close();
      disposed = true;
      rmSync(sessionDirectory, { recursive: true, force: true });
    },
    previewPath(payload) {
      assertActive();
      const request = payload as Partial<QuickLookPathRequest> | undefined;
      const path = trustedRealFile(request?.path, options.registry);
      const displayName = parseDisplayName(request?.displayName, basename(path));
      close();
      options.window.previewFile(path, displayName);
    },
    previewUsdz(payload) {
      assertActive();
      const request = parseUsdz(payload, options.maxOutputBytes);
      const stem = request.displayName.toLowerCase().endsWith('.usdz')
        ? request.displayName.slice(0, -'.usdz'.length)
        : request.displayName;
      const outputName = `${stem || 'model'}.usdz`;
      close();
      generatedPath = resolve(sessionDirectory, outputName);
      if (!isInside(generatedPath, sessionDirectory)) {
        throw new Error('Quick Look generated path escaped its session directory');
      }
      writeFileSync(generatedPath, request.bytes, { flag: 'wx' });
      options.window.previewFile(generatedPath, request.displayName);
    },
  };
};
