#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import {
  profileCanonicalPerTestLoadPath,
  profileLoadPath,
  profileNodeCliLoadPath,
} from '#experiments/load-path/profiler.js';

const valueAfter = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index !== -1 ? args[index + 1] : undefined;
};

const hasFlag = (args: readonly string[], name: string): boolean => args.includes(name);

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const projectPath = valueAfter(args, '--project');
  if (hasFlag(args, '--node-cli')) {
    if (!projectPath) {
      throw new Error(
        'Usage: node packages/geospec/experiments/load-path/benchmark.ts --node-cli --project <project> [--iterations 5] [--test-timeout 120000]',
      );
    }
    const iterations = Number(valueAfter(args, '--iterations') ?? '1');
    if (!Number.isInteger(iterations) || iterations < 1) {
      throw new Error('--iterations must be a positive integer.');
    }
    const testTimeout = valueAfter(args, '--test-timeout');
    const result = await profileNodeCliLoadPath({
      projectPath,
      iterations,
      ...(testTimeout ? { testTimeout: Number(testTimeout) } : {}),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const glbPath = valueAfter(args, '--glb');
  if (!glbPath) {
    throw new Error(
      'Usage: node packages/geospec/experiments/load-path/benchmark.ts --glb <model.glb> [--iterations 10] [--rich] [--overlap] [--canonical-per-it] OR --node-cli --project <project>',
    );
  }

  const iterations = Number(valueAfter(args, '--iterations') ?? '1');
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('--iterations must be a positive integer.');
  }

  const bytes = Uint8Array.from(await readFile(glbPath));
  if (hasFlag(args, '--canonical-per-it')) {
    const result = await profileCanonicalPerTestLoadPath({
      glbBytes: bytes,
      iterations,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const result = await profileLoadPath({
    glbBytes: bytes,
    iterations,
    richDiagnostics: hasFlag(args, '--rich'),
    overlap: hasFlag(args, '--overlap'),
  });

  process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
};

await main();
