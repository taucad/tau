/**
 * Runs a KCL fixture directory through the offline engine and measures what it builds.
 *
 * Shared by the KCL fixture regression suite and `scripts/offline/measure-kcl-fixtures.mts`, which measures the
 * baselines the suite compares against.
 */
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { FileSystemManager } from '#filesystem-manager.js';
import { KclUtilities } from '#kcl-utils.js';
import { OfflineEngineConnection } from '#offline/offline-engine-connection.js';
import type { Oc } from '#offline/offline-occt.js';
import { compound, massProperties } from '#offline/offline-occt.js';

/** What one fixture built: KCL errors, the visible solids, and their combined volume (mm³) and area (mm²). */
export type KclFixtureMeasurement = {
  errors: string[];
  solids: number;
  volume: number;
  area: number;
};

/**
 * A fixture's outcome as the suite's manifest records it: what it built, or the first error, which is a gap in the
 * offline engine (or the fixture) that a fix will clear.
 */
export type KclFixtureOutcome = { solids: number; volume: number; area: number } | { gap: string };

const uuidPattern = /[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}/g;

/**
 * Normalizes an error into a stable gap description: one line, without the entity ids that change every run.
 *
 * @param message - the error message
 * @returns the gap as the manifest records it
 */
export const gapOf = (message: string): string =>
  message.replaceAll(uuidPattern, '<id>').replaceAll(/\s+/g, ' ').trim().slice(0, 100).trimEnd();

export const directoryFileSystem = (directory: string): ConstructorParameters<typeof FileSystemManager>[0] =>
  ({
    async readFile(file: string, encoding?: string) {
      const bytes = await readFile(path.join(directory, file));
      return encoding ? bytes.toString('utf8') : new Uint8Array(bytes);
    },
    async exists(file: string) {
      try {
        await access(path.join(directory, file));
        return true;
      } catch {
        return false;
      }
    },
    async readdir(file: string) {
      return readdir(path.join(directory, file));
    },
  }) as unknown as ConstructorParameters<typeof FileSystemManager>[0];

/**
 * Executes `main.kcl` in a fixture directory offline, resolving imports against that directory.
 *
 * @param directory - the fixture directory
 * @returns the fixture's errors and the solids it left visible
 */
export async function runKclFixture(directory: string): Promise<KclFixtureMeasurement> {
  const utils = new KclUtilities({
    baseUrl: 'ws://offline',
    mode: 'offline',
    fileSystemManager: new FileSystemManager(directoryFileSystem(directory)),
  });
  try {
    await utils.initializeEngine();
    const code = await readFile(path.join(directory, 'main.kcl'), 'utf8');
    const parsed = await utils.parseKcl(code);
    if (parsed.errors.length > 0) {
      return { errors: parsed.errors.map((item) => item.message), solids: 0, volume: 0, area: 0 };
    }

    const outcome = await utils.executeProgram(parsed.program, 'main.kcl');
    const errors = outcome.errors.map((item) => item.message);
    const solids = utils.offlineConnection!.engine!.scene.visibleSolids();
    if (solids.length === 0) {
      return { errors, solids: 0, volume: 0, area: 0 };
    }

    const oc = await (OfflineEngineConnection as unknown as { occt: Promise<Oc> }).occt;
    const { volume, area } = massProperties(
      oc,
      compound(
        oc,
        solids.map((solid) => solid.shape),
      ),
    );
    return { errors, solids: solids.length, volume, area };
  } finally {
    await utils.cleanup();
  }
}

/**
 * Runs a fixture and reduces it to the outcome the manifest records.
 *
 * @param directory - the fixture directory
 * @returns what the fixture built, or its first error as a gap
 */
export async function measureKclFixture(directory: string): Promise<KclFixtureOutcome> {
  try {
    const { errors, solids, volume, area } = await runKclFixture(directory);
    return errors[0] === undefined ? { solids, volume, area } : { gap: gapOf(errors[0]) };
  } catch (error) {
    return { gap: gapOf(String((error as { message?: unknown }).message ?? error)) };
  }
}
