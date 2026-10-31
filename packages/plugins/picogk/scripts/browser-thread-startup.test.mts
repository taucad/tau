/* eslint-disable @typescript-eslint/naming-convention -- These are the pinned generated Mono/Emscripten ABI names. */
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
/* oxlint-disable no-restricted-imports -- The preparation script's sibling module; scripts have no `#` alias. */
import {
  patchBrowserThreadStartup,
  patchBrowserThreadMemory,
  patchBrowserThreadMailbox,
  bindBrowserThreadStartup,
  browserThreadModuleNames,
  patchBrowserThreadRuntime,
  patchBrowserThreadWorkerMessages,
} from './browser-thread-startup.mjs';
/* oxlint-enable no-restricted-imports */

const source = `ENVIRONMENT_IS_WORKER = dotnet_replacements.ENVIRONMENT_IS_WORKER;
    Module.__dotnet_runtime.initializeReplacements(dotnet_replacements);
    onFinishedLoading(worker);`;
// The pinned bootstrap's worker branch: it asks the page for its configuration, loads, then loads the glue.
const bootstrapWorkerSource = 'Me&&async function(){(function(){const e=new MessageChannel';
const bootstrapWorkerLoaded =
  'self.dispatchEvent(new MessageEvent("message",{data:{cmd:1,handlers:Fe.handlers,wasmMemory:Fe.wasmMemory,wasmModule:Fe.wasmModule}})),Fe}()';

describe('pinned Mono worker startup staging', () => {
  it('should notify the owner locally and forward only other live pthreads', () => {
    const mailbox = `
      function wait() { if (!waitAsyncPolyfilled) {
    // Wait on the thread self pointer.
        registerAtomicWait();
      } }
      function receive(d) {
        if (d.targetThread) {
          PThread.pthreads[d.targetThread]?.postMessage(d);
          return;
        }
        if (d.cmd === 4) checkMailbox();
      }
      wait(); receive({targetThread: 11, cmd: 4}); receive({targetThread: 22, cmd: 4});
      receive({targetThread: 33, cmd: 4}); receive({cmd: 4});`;
    for (const pthread of [false, true]) {
      const delivered: string[] = [];
      const context = {
        ENVIRONMENT_IS_PTHREAD: pthread,
        waitAsyncPolyfilled: false,
        _pthread_self: () => 11,
        registerAtomicWait: () => delivered.push('atomic'),
        checkMailbox: () => delivered.push('owner'),
        PThread: { pthreads: { 22: { postMessage: () => delivered.push('other') } } },
      };
      runInNewContext(patchBrowserThreadMailbox(mailbox), context);
      expect(delivered).toEqual([...(pthread ? ['atomic'] : []), 'owner', 'other', 'owner']);
    }
    for (const invalid of ['', mailbox + mailbox, patchBrowserThreadMailbox(mailbox)]) {
      expect(() => patchBrowserThreadMailbox(invalid)).toThrow('mailbox sequence changed');
    }
  });

  it.each([false, true])('should apply Mono thread classification before native initialization: %s', (worker) => {
    const context = {
      worker: { loaded: false },
      onFinishedLoading(loadedWorker: { loaded: boolean }) {
        expect(loadedWorker.loaded).toBe(true);
      },
      ENVIRONMENT_IS_WORKER: true,
      dotnet_replacements: { ENVIRONMENT_IS_WORKER: true },
      Module: {
        __dotnet_runtime: {
          initializeReplacements(replacements: { ENVIRONMENT_IS_WORKER: boolean }) {
            replacements.ENVIRONMENT_IS_WORKER = worker;
          },
        },
      },
    };
    runInNewContext(patchBrowserThreadStartup(source), context);
    expect(context.ENVIRONMENT_IS_WORKER).toBe(worker);
  });

  it('should deliver a pthread start that reaches a pool worker before its glue listens', async () => {
    let finishLoading = (): void => undefined;
    // The release is scheduled on a timer the test advances itself, so nothing races the assertions.
    let release: (() => void) | undefined;
    const delivered: unknown[] = [];
    const self = new EventTarget();
    const context = {
      self,
      MessageEvent,
      MessageChannel,
      setTimeout: (callback: () => void) => {
        release = callback;
      },
      Fe: { handlers: [], wasmMemory: 0, wasmModule: 0 },
      Me: true,
      loaded: async () =>
        new Promise<void>((resolve) => {
          finishLoading = resolve;
        }),
      // The native glue's handler, registered only once its module has loaded.
      handle: (event: MessageEvent<{ cmd: number }>) => delivered.push(event.data.cmd),
    };
    runInNewContext(
      patchBrowserThreadWorkerMessages(
        `${bootstrapWorkerSource}();})(),await loaded(),self.addEventListener("message",handle),${bootstrapWorkerLoaded}`,
      ),
      context,
    );
    const post = (cmd: number) => self.dispatchEvent(new MessageEvent('message', { data: { cmd } }));
    // Emscripten's own load message and the start message both arrive while the bootstrap loads.
    post(1);
    post(2);
    finishLoading();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    // A notification that arrives after the load but before the release still keeps its place.
    post(4);
    expect(delivered).toEqual([1]);
    expect(release).toBeDefined();
    release?.();
    expect(delivered).toEqual([1, 2, 4]);
    post(4);
    expect(delivered).toEqual([1, 2, 4, 4]);
    const valid = `${bootstrapWorkerSource}${bootstrapWorkerLoaded}`;
    for (const invalid of ['', valid + valid, patchBrowserThreadWorkerMessages(valid)]) {
      expect(() => patchBrowserThreadWorkerMessages(invalid)).toThrow('worker bootstrap sequence changed');
    }
  });

  it('should let generated traces import the host shared-memory maximum', () => {
    const pages: number[] = [];
    const context = {
      appendULeb(value: number) {
        pages.push(value);
      },
    };
    runInNewContext(patchBrowserThreadMemory('this.appendULeb(256),this.appendULeb(32768)'), context);
    expect(pages).toEqual([256, 65_536]);
    expect(() => patchBrowserThreadMemory('this.appendULeb(256),this.appendULeb(65536)')).toThrow(
      'import limit changed',
    );
  });

  it('should refuse changed, duplicate and already patched sequences', () => {
    for (const invalid of ['', source + source, patchBrowserThreadStartup(source)]) {
      expect(() => patchBrowserThreadStartup(invalid)).toThrow('startup sequence changed');
    }
  });

  it('should correct one published runtime for every caller that stages a threaded app', () => {
    // The measured parity apps and the shipped bundle go through this one function, so a figure
    // taken on one describes the other. The mailbox source carries both anchors the pair needs.
    const mailbox = `${source}
      if (!waitAsyncPolyfilled) {
    // Wait on the thread self pointer.
      }
      if (d.targetThread) {}`;
    const config = {
      resources: {
        hash: 'sha256-original',
        jsModuleNative: [{ name: 'dotnet.native.aaaaaaaaaa.js' }],
        jsModuleRuntime: [{ name: 'dotnet.runtime.bbbbbbbbbb.js' }],
        wasmNative: [{ name: 'native.wasm' }],
      },
    };
    const bootstrap = `prefix${bootstrapWorkerSource}${bootstrapWorkerLoaded}/*json-start*/${JSON.stringify(config)}/*json-end*/suffix`;
    expect(browserThreadModuleNames(bootstrap)).toEqual({
      native: 'dotnet.native.aaaaaaaaaa.js',
      runtime: 'dotnet.runtime.bbbbbbbbbb.js',
    });
    const patched = patchBrowserThreadRuntime({
      bootstrap,
      native: mailbox,
      runtime: 'this.appendULeb(256),this.appendULeb(32768)',
    });
    const names = [...patched.modules.keys()];
    expect(names).toHaveLength(2);
    // Both corrections are applied, both executables are renamed by content, and the rebound
    // configuration names the new ones rather than the ones the workload published.
    for (const name of names) {
      expect(patched.bootstrap).toContain(name);
    }
    expect(patched.bootstrap).not.toContain('dotnet.native.aaaaaaaaaa.js');
    expect(patched.bootstrap).not.toContain('dotnet.runtime.bbbbbbbbbb.js');
    expect(patched.bootstrap).toContain('"wasmNative":[{"name":"native.wasm"}]');
    expect(patched.bootstrap).toContain('holdEarlyMessage');
    expect(patched.modules.get(names[0]!)).toContain('ENVIRONMENT_IS_PTHREAD');
    expect(patched.modules.get(names[1]!)).toContain('appendULeb(65536)');
    // An already corrected runtime is refused rather than corrected twice.
    expect(() =>
      patchBrowserThreadRuntime({
        bootstrap: patched.bootstrap,
        native: patched.modules.get(names[0]!)!,
        runtime: patched.modules.get(names[1]!)!,
      }),
    ).toThrow();
    expect(() => browserThreadModuleNames('')).toThrow('configuration is missing');
  });

  it('should bind the changed executable without losing other boot resources', () => {
    const config = {
      mainAssemblyName: 'Worker',
      resources: {
        hash: 'sha256-original',
        jsModuleNative: [{ name: 'dotnet.native.original.js' }],
        jsModuleRuntime: [{ name: 'dotnet.runtime.original.js' }],
        wasmNative: [{ name: 'native.wasm' }],
      },
    };
    const boot = `prefix/*json-start*/${JSON.stringify(config)}/*json-end*/suffix`;
    const native = patchBrowserThreadStartup(source);
    const bound = bindBrowserThreadStartup(boot, native);
    expect(bound.name).toBe(`dotnet.native.${createHash('sha256').update(native).digest('hex').slice(0, 16)}.js`);
    expect(bound.bootstrap).toContain('"mainAssemblyName":"Worker"');
    expect(bound.bootstrap).toContain('"wasmNative":[{"name":"native.wasm"}]');
    expect(bound.bootstrap).toContain(bound.name);
    expect(bound.bootstrap).not.toContain('sha256-original');
    expect(bindBrowserThreadStartup(boot, native)).toEqual(bound);
    expect(bindBrowserThreadStartup(boot, native + '\n').name).not.toBe(bound.name);
    expect(() => bindBrowserThreadStartup('', native)).toThrow('configuration is missing');
    expect(() => bindBrowserThreadStartup(boot.replace('dotnet.native.original.js', '../escape.js'), native)).toThrow();
  });
});
