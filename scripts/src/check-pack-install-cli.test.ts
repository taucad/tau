import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import {
  geoSpecSessionFailure,
  isNotPreparedRefusal,
  isWithinRealPath,
  mcpInitializeRequest,
  vendorPayloads,
} from '#check-pack-install-cli.js';

describe('isNotPreparedRefusal', () => {
  it('should accept exit 3 naming the prepare command', () => {
    expect(isNotPreparedRefusal({ status: 3, output: 'build123d is not prepared. Run `tau prepare build123d`.' })).toBe(
      true,
    );
  });

  it('should reject another exit code or a refusal that names no prepare command', () => {
    expect(isNotPreparedRefusal({ status: 1, output: 'Run `tau prepare build123d`.' })).toBe(false);
    expect(isNotPreparedRefusal({ status: 3, output: 'No kernel handles ".py".' })).toBe(false);
  });
});

describe('mcpInitializeRequest', () => {
  it('should be one newline-terminated JSON-RPC initialize request', () => {
    expect(mcpInitializeRequest.endsWith('\n')).toBe(true);
    expect(JSON.parse(mcpInitializeRequest)).toMatchObject({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  });
});

describe('geoSpecSessionFailure', () => {
  const initialized = {};
  const tools = ['evaluate_model', 'test_model', 'screenshot', 'export_model'];

  it('should accept a session that lists test_model and passes the suite', () => {
    expect(
      geoSpecSessionFailure({ initialized, tools, testModel: { structuredContent: { passed: 1, total: 1 } } }),
    ).toBeUndefined();
  });

  it('should name a server that does not list test_model (audit H-01)', () => {
    expect(
      geoSpecSessionFailure({ initialized, tools: ['evaluate_model', 'screenshot'], testModel: undefined }),
    ).toContain('listed no test_model');
  });

  it('should carry the text of a test_model that failed', () => {
    expect(
      geoSpecSessionFailure({
        initialized,
        tools,
        testModel: { isError: true, content: [{ type: 'text', text: 'TOOL_NOT_FOUND: Unknown tool: test_model' }] },
      }),
    ).toContain('TOOL_NOT_FOUND');
  });
});

describe('vendorPayloads', () => {
  it('should find a vendor CLI payload at any depth and nothing else', () => {
    const root = mkdtempSync(join(tmpdir(), 'tau-vendor-payloads-'));
    try {
      for (const directory of [
        'node_modules/@openai/codex',
        'node_modules/@taucad/cli/dist-acp/node_modules/x',
        'node_modules/a/node_modules/@anthropic-ai/claude-agent-sdk',
        'node_modules/a/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64',
        'node_modules/@openai/codex/node_modules/@openai/codex-linux-x64',
      ]) {
        mkdirSync(join(root, directory), { recursive: true });
      }

      expect(vendorPayloads(join(root, 'node_modules')).toSorted()).toEqual(
        [
          join(root, 'node_modules/@openai/codex/node_modules/@openai/codex-linux-x64'),
          join(root, 'node_modules/a/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64'),
        ].toSorted(),
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('isWithinRealPath', () => {
  it('should place a module reached through a symlinked root inside that root', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'tau-within-'));
    try {
      const real = join(scratch, 'real');
      mkdirSync(join(real, 'dist-acp/node_modules'), { recursive: true });
      writeFileSync(join(real, 'dist-acp/node_modules/index.js'), '');
      symlinkSync(real, join(scratch, 'link'));

      expect(isWithinRealPath(join(scratch, 'link/dist-acp'), join(real, 'dist-acp/node_modules/index.js'))).toBe(true);
      expect(isWithinRealPath(join(scratch, 'link/dist-acp'), join(scratch, 'link/dist-acp'))).toBe(true);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('should reject a sibling whose name merely shares the prefix', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'tau-within-'));
    try {
      mkdirSync(join(scratch, 'dist-acp'));
      mkdirSync(join(scratch, 'dist-acp-other'));

      expect(isWithinRealPath(join(scratch, 'dist-acp'), join(scratch, 'dist-acp-other'))).toBe(false);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
