import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { MessageChannelMain, utilityProcess } from 'electron';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { composeView, maskedPathCode } from '@taucad/filesystem/composed-view';
import { tauPathPolicy } from '@taucad/filesystem/path-registry';
import { createRuntimeClient } from '@taucad/runtime/client';
import { electronUtilityMainTransport } from '@taucad/runtime/electron/renderer';
import { serveElectronFileSystemBridgePort } from '@taucad/runtime/electron/utility';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type {
  PublishedPartAsset,
  PublishedAssembly,
  PublishedPartExact,
  PublishAssemblyOutcome,
} from '@taucad/runtime/types';

/** Test-owned trusted-main inputs, never a renderer fork context. */
export type MissingWriterUtilityInput = Readonly<{
  entry: string;
  projectRoot: string;
  root: PublishedPartAsset;
  assets: ReadonlyArray<Readonly<{ path: string; digest: string; byteLength: number }>>;
  ordinary: Readonly<{ path: string; text: string; digest: string; byteLength: number }>;
  resourceRoot: string;
  pythonRoot: string;
  picoGkRoot: string;
  apiUrl: string;
  webSocketUrl: string;
}>;

type MissingWriterUtilityProof = Readonly<{
  utilityPid: number;
  root: PublishedPartAsset;
  admittedPublication: PublishedAssembly;
  exact: PublishedPartExact;
  publication: Extract<PublishAssemblyOutcome, { status: 'invalid' }>;
  stepBase64: string;
  evaluatorWritable: boolean;
  publicationPortTransferred: false;
  assetBytesUnchanged: true;
  agentProtectedWriteDenied: true;
  ordinaryRead: Readonly<{ path: string; digest: string; byteLength: number; unchanged: true }>;
}>;

/** Exercise missing publication authority in an actual utility, independently of writable product main. */
export const runMissingWriterUtility = async (input: MissingWriterUtilityInput): Promise<MissingWriterUtilityProof> => {
  const abort = new AbortController();
  const disposers: Array<() => void> = [];
  const pending: Array<Promise<unknown>> = [];
  let drainClient: (() => Promise<void>) | undefined;
  let killUtility: (() => void) | undefined;
  let exited: Promise<number> | undefined;
  let utilityTimeout: ReturnType<typeof setTimeout> | undefined;
  let proof: MissingWriterUtilityProof | undefined;
  let primaryFailed = false;
  let primaryError: unknown;
  const cleanupErrors: unknown[] = [];
  const observe = async <T>(operation: Promise<T>): Promise<T> => {
    const outcomes = Promise.allSettled([operation]);
    pending.push(outcomes);
    const [outcome] = await outcomes;
    if (outcome.status === 'rejected') {
      const error: unknown = outcome.reason;
      throw error;
    }
    return outcome.value;
  };
  const verifyAssets = async (): Promise<void> => {
    await Promise.all(
      input.assets.map(async (asset) => {
        const bytes = await readFile(join(input.projectRoot, asset.path));
        const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
        if (bytes.byteLength !== asset.byteLength || digest !== asset.digest) {
          throw new Error(`Actual utility changed immutable browser bytes: ${asset.path}`);
        }
      }),
    );
  };
  try {
    const provider = new NodeFsProvider(input.projectRoot, { policy: tauPathPolicy });
    disposers.push(() => {
      provider.dispose();
    });
    const runtimePorts = new MessageChannelMain();
    disposers.push(
      () => {
        runtimePorts.port1.close();
      },
      () => {
        runtimePorts.port2.close();
      },
    );
    const evaluatorPorts = new MessageChannelMain();
    disposers.push(
      () => {
        evaluatorPorts.port1.close();
      },
      () => {
        evaluatorPorts.port2.close();
      },
    );
    // NodeFsProvider has a synchronous watch face; use the same agent policy as services-host.executorViewFor.
    const evaluator = composeView({ filesystem: provider }, { consumer: 'agent', policy: tauPathPolicy });
    const verifyOrdinary = async (): Promise<void> => {
      const expected = new TextEncoder().encode(input.ordinary.text);
      const expectedDigest = `sha256:${createHash('sha256').update(expected).digest('hex')}`;
      if (expected.byteLength !== input.ordinary.byteLength || expectedDigest !== input.ordinary.digest) {
        throw new Error('Ordinary control input does not match its declared byte identity.');
      }
      const bytes = await evaluator.readFile(input.ordinary.path);
      if (
        bytes.byteLength !== input.ordinary.byteLength ||
        `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== input.ordinary.digest
      ) {
        throw new Error('Product agent view did not preserve the ordinary control bytes.');
      }
    };
    await observe(verifyOrdinary());
    const bridge = serveElectronFileSystemBridgePort(evaluator, evaluatorPorts.port1);
    disposers.push(() => {
      bridge.dispose();
    });
    const environment = { ...process.env };
    delete environment['TAU_RUNTIME_EPHEMERAL'];
    delete environment['TAU_PROJECT_ROOT'];
    delete environment['NODE_COMPILE_CACHE'];
    environment['TAU_REPLICAD_RESOURCE_ROOT'] = input.resourceRoot;
    environment['TAU_BUILD123D_RESOURCE_ROOT'] = input.pythonRoot;
    environment['TAU_PICOGK_RESOURCE_ROOT'] = input.picoGkRoot;
    // Allocate the client before forking: constructor failure leaves no child, and exit never captures a TDZ binding.
    const client = createRuntimeClient<AnyRuntimeDefinition>({
      transport: electronUtilityMainTransport({ port: runtimePorts.port1 }),
      config: { tauApiUrl: input.apiUrl, tauWebSocketUrl: input.webSocketUrl },
    });
    const cancelClient = () => {
      client.terminate();
    };
    drainClient = async () => {
      try {
        await client.shutdown();
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        client.terminate();
      }
    };
    const utility = utilityProcess.fork(input.entry, [], {
      cwd: input.projectRoot,
      env: environment,
      serviceName: 'tau-published-pin-missing-writer-control',
    });
    killUtility = () => {
      utility.kill();
    };
    exited = new Promise<number>((resolve) => {
      utility.once('exit', (code) => {
        try {
          cancelClient();
        } catch (error) {
          cleanupErrors.push(error);
        } finally {
          resolve(code);
        }
      });
    });
    utilityTimeout = setTimeout(() => {
      abort.abort(new Error('Missing-writer actual utility control timed out.'));
      utility.kill();
    }, 120_000);
    await observe(verifyAssets());
    const pinnedRoot = await evaluator.readFile(input.root.path);
    if (
      pinnedRoot.byteLength !== input.root.byteLength ||
      `sha256:${createHash('sha256').update(pinnedRoot).digest('hex')}` !== input.root.digest
    ) {
      throw new Error('Product agent view did not return the exact protected pin.');
    }
    // Qualify the actual composed policy, independently of the runtime publication fence.
    let protectedWriteDenied = false;
    try {
      await evaluator.writeFile(input.root.path, new Uint8Array([0, 1, 2]));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'EROFS' ||
        !('reason' in error) ||
        error.reason !== maskedPathCode
      ) {
        throw error;
      }
      protectedWriteDenied = true;
    }
    if (!protectedWriteDenied) {
      throw new Error('Product agent view admitted a protected-root overwrite.');
    }
    await observe(verifyAssets());
    // No publication index or port: no evaluator authority is promoted to a host writer.
    utility.postMessage(
      { taucadRuntime: true, runtimePortIndex: 0, fileSystemPortIndex: 1, computeBindingMode: 'off' },
      [runtimePorts.port2, evaluatorPorts.port2],
    );
    await observe(client.connect());
    const admitted = await observe(client.openAssembly({ root: input.root, signal: abort.signal }));
    const exported = await observe(
      client.exportPublished({ format: 'step', publishedAssembly: { root: input.root }, signal: abort.signal }),
    );
    if (!exported.success) {
      throw new Error(`Actual missing-writer utility STEP denied: ${JSON.stringify(exported)}`);
    }
    if (exported.files.length !== 1) {
      throw new Error('Actual utility did not return exactly one STEP file.');
    }
    const part = admitted.admitted.publication.parts['inspection'];
    const variant = part?.variants['default'];
    const exact = variant?.exact;
    if (!part || !variant || !exact) {
      throw new Error('Actual consumer omitted browser exact provider identity.');
    }
    // Both erased paths stay absent. Protected publication must deny BEFORE reading/solving them.
    const publication = await observe(
      client.publishAssembly({
        authoredPath: 'physical/assembly.json',
        publicationPath: input.root.path,
        signal: abort.signal,
      }),
    );
    if (
      publication.status !== 'invalid' ||
      !publication.issues.some(
        (issue) =>
          issue.code === 'SCENE_REFERENCE_INVALID' &&
          issue.message === 'Protected authored assembly publication requires captured host publication authority.',
      )
    ) {
      throw new Error(`Missing captured writer was not independently denied: ${JSON.stringify(publication)}`);
    }
    const { glb } = variant;
    const displayBytes = await observe(admitted.admitted.readAsset(glb.digest));
    if (
      displayBytes.byteLength !== glb.byteLength ||
      `sha256:${createHash('sha256').update(displayBytes).digest('hex')}` !== glb.digest
    ) {
      throw new Error('Actual source-free facade returned changed display bytes.');
    }
    await observe(verifyAssets());
    await observe(verifyOrdinary());
    const utilityPid = utility.pid;
    if (utilityPid === undefined || !Number.isSafeInteger(utilityPid) || utilityPid <= 0) {
      throw new Error('Actual utility omitted its process identity.');
    }
    proof = {
      utilityPid,
      root: input.root,
      admittedPublication: admitted.admitted.publication,
      exact,
      publication,
      stepBase64: uint8ArrayToBase64(exported.files[0]!.bytes),
      evaluatorWritable: provider.capabilities.writable,
      publicationPortTransferred: false,
      assetBytesUnchanged: true,
      agentProtectedWriteDenied: true,
      ordinaryRead: {
        path: input.ordinary.path,
        digest: input.ordinary.digest,
        byteLength: input.ordinary.byteLength,
        unchanged: true,
      },
    };
  } catch (error) {
    primaryFailed = true;
    primaryError = error;
  } finally {
    abort.abort(new Error('Actual utility control closing.'));
    try {
      await drainClient?.();
    } catch (error) {
      cleanupErrors.push(error);
    }
    await Promise.allSettled(pending);
    try {
      killUtility?.();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (exited) {
      let exitTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          exited,
          new Promise<never>((_resolve, reject) => {
            exitTimeout = setTimeout(() => {
              reject(new Error('Owned utility did not exit after teardown.'));
            }, 5000);
          }),
        ]);
      } catch (error) {
        cleanupErrors.push(error);
      } finally {
        clearTimeout(exitTimeout);
      }
    }
    clearTimeout(utilityTimeout);
    // Every allocated binding closes, including when allocation or a sibling disposer fails.
    for (const dispose of disposers.reverse()) {
      try {
        dispose();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }
  if (primaryFailed) {
    if (cleanupErrors.length > 0) {
      console.warn('Actual utility fixture teardown also failed', cleanupErrors);
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Actual utility fixture teardown failed.');
  }
  if (!proof) {
    throw new Error('Actual utility fixture produced no proof.');
  }
  return proof;
};
