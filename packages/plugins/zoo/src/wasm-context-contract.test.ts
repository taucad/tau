/* eslint-disable @typescript-eslint/naming-convention -- Kittycad wire fixtures */
// @vitest-environment node
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileWasmStreaming } from '@taucad/runtime/kernel';
import type { KernelFileSystem } from '@taucad/runtime/kernel';
import { kclWasmUrl } from '#kcl-utils.js';
import { FileSystemManager } from '#filesystem-manager.js';
import type { WasmModule } from '#zoo-wasm-module.types.js';

class RecordingEngineCommandManager {
  public readonly invocations: Array<{ method: 'fire' | 'send'; args: [string, string, string, string] }> = [];

  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` stub uses four positional parameters
  public fireModelingCommandFromWasm(
    id: string,
    rangeString: string,
    commandString: string,
    idToRangeString: string,
  ): void {
    this.invocations.push({ method: 'fire', args: [id, rangeString, commandString, idToRangeString] });
  }

  // oxlint-disable-next-line max-params -- wasm `EngineCommandManager` stub uses four positional parameters
  public async sendModelingCommandFromWasm(
    id: string,
    rangeString: string,
    commandString: string,
    idToRangeString: string,
  ): Promise<Uint8Array<ArrayBuffer>> {
    this.invocations.push({ method: 'send', args: [id, rangeString, commandString, idToRangeString] });
    const response = {
      success: true,
      request_id: id,
      resp: {
        type: 'modeling',
        data: { modeling_response: { type: 'empty' } },
      },
    } as const;
    return new Uint8Array(msgpackEncode(response));
  }

  public async startNewSession(): Promise<void> {
    /* Upstream no-op surface */
    await Promise.resolve();
  }
}

const memoryFs = (): KernelFileSystem => {
  const files = new Map<string, string>([['/main.kcl', 'x = 1\n']]);
  return {
    async readFile(path: string) {
      const hit = files.get(path);
      if (hit === undefined) {
        throw new Error(`ENOENT ${path}`);
      }

      return new TextEncoder().encode(hit);
    },
    async exists(path: string) {
      return files.has(path);
    },
    async readdir(path: string) {
      if (path === '/' || path === '') {
        return ['main.kcl'];
      }

      return [];
    },
  } as unknown as KernelFileSystem;
};

describe('KCL WASM Context ↔ EngineCommandManager contract', () => {
  let wasm: WasmModule;

  beforeAll(async () => {
    wasm = await import('@taucad/kcl-wasm-lib');
    const compiled = await compileWasmStreaming(kclWasmUrl);
    await wasm.default({ module_or_path: compiled });
  }, 120_000);

  it('invokes fire/send with four string parameters (id, rangeStr, commandStr, idToRangeStr)', async () => {
    const engine = new RecordingEngineCommandManager();
    const fs = new FileSystemManager(memoryFs());

    // oxlint-disable-next-line @typescript-eslint/await-thenable -- wasm-bindgen Context constructor is Promise-like
    const context = await new wasm.Context(engine, fs);
    const parseResult = wasm.parse_wasm('x = 1\n') as [unknown, Array<{ severity: string }>];
    const [programNode, issues] = parseResult;
    expect(issues.filter((issue) => issue.severity === 'Error')).toEqual([]);

    await context.executeMock(JSON.stringify(programNode), 'main.kcl', '{}', false);

    for (const invocation of engine.invocations) {
      expect(invocation.args).toHaveLength(4);
      for (const argument of invocation.args) {
        expect(typeof argument).toBe('string');
      }
    }

    const sendCall = engine.invocations.find((i) => i.method === 'send');
    if (sendCall) {
      const commandString = sendCall.args[2];
      const parsed = JSON.parse(commandString) as { type?: string };
      expect(typeof parsed.type).toBe('string');
      expect(parsed.type?.length).toBeGreaterThan(0);
    }
  });
});
