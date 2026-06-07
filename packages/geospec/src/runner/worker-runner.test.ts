import { describe, expect, it } from 'vitest';
import type { VmFileSystem } from '@taucad/vm';
import { createGeoSpecNodeRunner } from '#runner/node/index.js';
import { createGeoSpecWebRunner } from '#runner/web/index.js';
import type { GeoSpecRunner, GeoSpecRunnerEvent } from '#runner/worker/index.js';

class MemoryFileSystem implements VmFileSystem {
  private readonly files = new Map<string, string>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(_path: string): Promise<void> {
    return undefined;
  }
}

const passingTestModule = (name: string): string => `
import { describe, it } from 'geospec';

describe('runner ${name}', () => {
  it('should pass ${name}', () => {});
});
`;

const createFilesystem = (): MemoryFileSystem => {
  const filesystem = new MemoryFileSystem();
  filesystem.setText('/first.geospec.ts', passingTestModule('first'));
  filesystem.setText('/second.geospec.ts', passingTestModule('second'));
  return filesystem;
};

describe('GeoSpec worker-style runners', () => {
  it('should run GeoSpec files serially through the Node runner', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
      onEvent: (event) => events.push(event),
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result).toMatchObject({
      success: true,
      passed: 2,
      failed: 0,
      selectedTests: 2,
    });
    expect(events.map((event) => event.type)).toEqual([
      'run-start',
      'file-start',
      'file-complete',
      'file-start',
      'file-complete',
      'run-complete',
    ]);
    await runner.close();
  });

  it('should fail clearly when filters select no tests', async () => {
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });

    const result = await runner.run({
      files: ['/first.geospec.ts'],
      testNamePattern: 'does not exist',
    });

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.issues?.[0]).toMatchObject({
      code: 'NO_MATCHING_GEOSPEC_TESTS',
      severity: 'error',
    });
    await runner.close();
  });

  it('should return structured file issues when testNamePattern is invalid', async () => {
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });

    const result = await runner.run({
      files: ['/first.geospec.ts'],
      testNamePattern: '[',
    });

    expect(result.success).toBe(false);
    expect(result.files[0]?.result).toMatchObject({
      success: false,
      issues: [
        {
          code: 'INVALID_GEOSPEC_TEST_NAME_PATTERN',
          message: 'testNamePattern is not a valid JavaScript regular expression.',
          severity: 'error',
          type: 'runtime',
        },
      ],
    });
    await runner.close();
  });

  it('should abort before starting the next queued file', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const runner: GeoSpecRunner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
      onEvent: (event) => {
        events.push(event);
        if (event.type === 'file-complete') {
          runner.abort('test requested stop');
        }
      },
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(result.files).toHaveLength(1);
    expect(result.issues?.[0]).toMatchObject({
      code: 'GEOSPEC_RUNNER_ABORTED',
      message: 'GeoSpec run aborted: test requested stop',
    });
    expect(events.some((event) => event.type === 'abort')).toBe(true);
    await runner.close();
  });

  it('should reject runs after close with a structured issue', async () => {
    const runner = createGeoSpecNodeRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });
    await runner.close();

    const result = await runner.run({ files: ['/first.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]).toMatchObject({
      code: 'GEOSPEC_RUNNER_CLOSED',
      severity: 'error',
    });
  });

  it('should expose the same compact result shape through the web runner factory', async () => {
    const runner = createGeoSpecWebRunner({
      filesystem: createFilesystem(),
      projectPath: '/',
    });

    const result = await runner.run({ files: ['/first.geospec.ts'] });

    expect(result).toMatchObject({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
    });
    await runner.close();
  });
});
