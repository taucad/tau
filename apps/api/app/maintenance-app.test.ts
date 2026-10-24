import net from 'node:net';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRoot, importChain, moduleGraph } from '#testing/module-graph.js';

/**
 * North star DC4: `tau-maintenance` is a private singleton app with no inbound
 * service. These tests tie the deployable pieces to one another and to that
 * rule: the Dockerfile's `maintenance` target runs the maintenance command,
 * the command's module graph opens no listener, and both Fly configs deploy one
 * Machine in `syd` with no service, no metrics endpoint and no volume.
 */

const read = (file: string): string => readFileSync(path.join(apiRoot, file), 'utf8');

/** The deploy unit's Fly configs live in their own Nx project, so `ci.yml`'s staging plan can deploy it. */
const maintenanceProject = path.join(apiRoot, '../maintenance');

type Stage = { from: string; instructions: string[] };

/** The Dockerfile's stages by name, each with its base and its instructions. */
const dockerStages = (): Map<string, Stage> => {
  const stages = new Map<string, Stage>();
  let current: Stage | undefined;
  for (const line of read('Dockerfile').replaceAll('\\\n', ' ').split('\n')) {
    const from = /^FROM\s+(\S+)\s+AS\s+(\S+)/iu.exec(line);
    if (from) {
      current = { from: from[1] ?? '', instructions: [] };
      stages.set(from[2] ?? '', current);
    } else if (current !== undefined && /^[A-Z]+\s/u.test(line)) {
      current.instructions.push(line);
    }
  }
  return stages;
};

/** A stage's instructions followed by those of every stage it builds on, nearest first. */
const inherited = (stages: Map<string, Stage>, name: string): string[] => {
  const instructions: string[] = [];
  for (let stage = stages.get(name); stage !== undefined; stage = stages.get(stage.from)) {
    instructions.push(...stage.instructions);
  }
  return instructions;
};

/** The source entry a `dist/<file>` bundle is built from, read from the Vite config that names it. */
const sourceEntryOf = (bundle: string): string => {
  const configs = readdirSync(apiRoot).filter((name) => /^vite\..+\.config\.ts$/u.test(name));
  for (const config of configs) {
    const text = read(config);
    if (text.includes(`entryFileNames: '${bundle}'`)) {
      const ssr = /ssr:\s*'([^']+)'/u.exec(text)?.[1];
      if (ssr !== undefined) {
        return ssr;
      }
    }
  }
  throw new Error(`No Vite config builds ${bundle}`);
};

const maintenanceImageEntry = (): string => {
  const command = inherited(dockerStages(), 'maintenance').find((line) => line.startsWith('CMD '));
  const script = /"\/app\/dist\/([^"]+\.js)"/u.exec(command ?? '')?.[1];
  if (script === undefined) {
    throw new Error('The Dockerfile maintenance target has no CMD running a dist bundle');
  }
  return sourceEntryOf(script);
};

/** Modules and packages whose presence in the graph would mean something can serve or listen. */
const listeningPackages = [
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dgram',
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'fastify',
  'express',
  'ws',
  '@nestjs/core',
  '@nestjs/platform-fastify',
  '@nestjs/platform-express',
  '@opentelemetry/exporter-prometheus',
  '@opentelemetry/sdk-node',
];
const listeningModules = ['app/main.ts', 'app/app.module.ts', 'app/telemetry/otel.ts'];

describe('tau-maintenance image (DC4)', () => {
  it('should build a maintenance target that runs the maintenance command and exposes nothing', () => {
    const stages = dockerStages();

    expect(stages.has('maintenance')).toBe(true);
    expect(maintenanceImageEntry()).toBe('app/maintenance-command.ts');
    const instructions = inherited(stages, 'maintenance');
    expect(instructions.filter((line) => /^(?:EXPOSE|HEALTHCHECK)\s/u.test(line))).toEqual([]);
  });

  it('should keep the API image as the default target', () => {
    const last = [...dockerStages().keys()].at(-1);

    expect(last).toBe('runtime');
    expect(inherited(dockerStages(), 'runtime').find((line) => line.startsWith('CMD '))).toContain('/app/dist/main.js');
  });

  it('should start a module graph with no HTTP listener', () => {
    const graph = moduleGraph(maintenanceImageEntry());

    expect(
      listeningModules.filter((module) => graph.modules.has(module)).map((module) => importChain(graph, module)),
    ).toEqual([]);
    expect(listeningPackages.filter((name) => graph.packages.has(name))).toEqual([]);
  });

  describe('when the command module loads', () => {
    const { argv } = process;

    afterEach(() => {
      process.argv = argv;
      vi.restoreAllMocks();
    });

    it('should open no listening socket', async () => {
      const listen = vi.spyOn(net.Server.prototype, 'listen');
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      // `--help` loads the whole graph and returns before any connection is made.
      process.argv = [process.execPath, 'maintenance-command.js', '--help'];

      await import('#maintenance-command.js');

      expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage: revisions-maintenance'));
      expect(listen).not.toHaveBeenCalled();
    });
  });
});

describe.each([
  ['staging', 'tau-maintenance-staging'],
  ['prod', 'tau-maintenance'],
])('apps/maintenance/fly.%s.toml (DC4)', (environment, app) => {
  const config = (): string => readFileSync(path.join(maintenanceProject, `fly.${environment}.toml`), 'utf8');
  /** Section headers, comments excluded. */
  const sections = (): string[] => config().match(/^\[\[?[^\]]+\]\]?$/gmu) ?? [];

  it('should name the app and deploy it in syd', () => {
    expect(config()).toMatch(new RegExp(`^app = '${app}'$`, 'mu'));
    expect(config()).toMatch(/^primary_region = 'syd'$/mu);
  });

  it('should declare no service, metrics endpoint, volume or release command', () => {
    expect(sections().filter((section) => /services|http_service|metrics|mounts|statics/u.test(section))).toEqual([]);
    expect(config()).not.toMatch(/^\s*release_command\s*=/mu);
  });

  it('should run one process group, the singleton maintenance worker, from the maintenance target', () => {
    const processes = /^\[processes\]\n((?:[^[\n].*\n|\n)*)/mu.exec(config())?.[1] ?? '';
    const groups = processes.split('\n').filter((line) => /^[\w-]+\s*=/u.test(line));

    expect(groups).toEqual(["revisions-maintenance = 'node /app/dist/maintenance-command.js worker'"]);
    expect(sections().filter((section) => section === '[[vm]]')).toHaveLength(1);
    expect(config()).toMatch(/^build-target = 'maintenance'$/mu);
  });

  /*
   * Charter D21 allows one worker. While the API's own config still runs the
   * `revisions-maintenance` group, this app must hold in standby; the cutover
   * removes the group there and the flag here in the same reviewed change.
   */
  it('should hold in standby while the API still runs the revisions-maintenance group', () => {
    const api = read(`fly.${environment}.toml`);
    const apiRunsWorker = /^revisions-maintenance\s*=/mu.test(api);

    expect(config().includes("TAU_MAINTENANCE_STANDBY = 'true'")).toBe(apiRunsWorker);
  });
});
