import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNodeEventLog } from '@taucad/agent-host/node';
import type { HostToolInvocation, HostToolResult } from '@taucad/agent-host';
import { toolName } from '@taucad/chat/constants';
import { z } from 'zod';
import { isModelListEntryEnabled, modelList } from '#api/models/model.constants.js';
import {
  createLiveSession,
  createLiveToolRegistry,
  hasLiveCredential,
  liveCadSystemPrompt,
  liveCredentialName,
  liveSessionModel,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';
import { expectCompleted, expectPairedToolMessages, finalText, toolCalls } from '#testing/live/live-assertions.js';

/** Same supported model/harness pairs as the existing provider matrix. */
const modelIds: readonly string[] = [
  ...Object.values(modelList.vertexai)
    .filter((entry) => isModelListEntryEnabled(entry))
    .map(({ id }) => id),
  'anthropic-claude-sonnet-5.5',
  'openai-gpt-5.6-luna',
  'xai-grok-4.7',
];

const exportFileSchema = z.object({ name: z.string(), mimeType: z.string(), text: z.string() });
const sourceRevisionSchema = z.object({ entry: z.string(), files: z.record(z.string(), z.string()) });
const boardFacts = z
  .object({
    source: z.string(),
    evaluation: z.object({
      success: z.literal(true),
      views: z.array(z.object({ id: z.string() })),
      exports: z.array(z.object({ id: z.string(), extension: z.string() })),
      issues: z.array(
        z.object({ code: z.string(), severity: z.string(), message: z.string(), details: z.json().optional() }),
      ),
      sourceRevision: sourceRevisionSchema,
    }),
    bom: z.object({
      exportId: z.string(),
      sourceRevision: sourceRevisionSchema,
      files: z.array(exportFileSchema).min(1),
    }),
    netlist: z.object({
      exportId: z.string(),
      sourceRevision: sourceRevisionSchema,
      files: z.array(exportFileSchema).min(1),
    }),
  })
  .parse(JSON.parse(readFileSync(new URL('__fixtures__/board-production-facts.json', import.meta.url), 'utf8')));
const skill = readFileSync(
  new URL('../../../../../packages/plugins/tscircuit/agent/cad-tscircuit/SKILL.md', import.meta.url),
  'utf8',
);
const [bomFile] = boardFacts.bom.files;
const [netlistFile] = boardFacts.netlist.files;
if (!bomFile || !netlistFile) {
  throw new Error('The real board fixture needs BOM and netlist files.');
}
const sourceDigest = `sha256:${createHash('sha256').update(boardFacts.source).digest('hex')}`;
const answerParts = bomFile.text
  .split(/\r?\n/u)
  .slice(1)
  .filter(Boolean)
  .map((line) => {
    const columns = line.split(',').map((value) => value.replaceAll('"', ''));
    return { designator: columns[0] ?? '', footprint: columns[3] ?? '' };
  });

const textResult = (content: string): HostToolResult => ({
  content: { success: true, content, contentKind: 'text', size: content.length },
  isError: false,
});

const unavailable = (): HostToolResult => ({
  content: {
    success: false,
    errorCode: 'TOOL_UNAVAILABLE',
    message: 'This board fixture does not serve that operation.',
  },
  isError: true,
});

const target = (input: unknown, key: string): unknown =>
  input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (Reflect.get(input, key) as unknown)
    : undefined;

/** Serve bytes captured from the real tscircuit document, persisting its exports for read_file. */
const boardResult = async (root: string, reads: string[], invocation: HostToolInvocation): Promise<HostToolResult> => {
  const { input } = invocation;
  if (invocation.toolName === toolName.useSkill) {
    const requested = target(input, 'skillName');
    if (requested !== 'cad-tscircuit') {
      return { content: { success: false, errorCode: 'SKILL_NOT_FOUND', message: 'Skill not found.' }, isError: true };
    }
    return {
      content: {
        success: true,
        skillName: 'cad-tscircuit',
        resourceUri: 'system:skills/cad-tscircuit/SKILL.md',
        source: 'system',
        version: '0.1.0-beta.0',
        fingerprint: createHash('sha256').update(skill).digest('hex'),
        frontmatter: {
          name: 'cad-tscircuit',
          description: 'Guides tscircuit TSX electronics authoring in main.tsx.',
        },
        content: skill,
        supportingFiles: [],
      },
      isError: false,
    };
  }
  if (invocation.toolName === toolName.listDirectory) {
    return {
      content: {
        success: true,
        path: '',
        entries: [
          {
            name: 'main.tsx',
            type: 'file',
            size: Buffer.byteLength(boardFacts.source),
            contentKind: 'text',
            lineCount: boardFacts.source.split('\n').length,
          },
        ],
      },
      isError: false,
    };
  }
  if (invocation.toolName === toolName.globSearch) {
    return {
      content: {
        success: true,
        files: ['main.tsx'],
        entries: [
          {
            path: 'main.tsx',
            size: Buffer.byteLength(boardFacts.source),
            contentKind: 'text',
            lineCount: boardFacts.source.split('\n').length,
          },
        ],
        totalFiles: 1,
      },
      isError: false,
    };
  }
  if (invocation.toolName === toolName.readFile) {
    const path = target(input, 'targetFile');
    if (path === 'main.tsx') {
      return textResult(boardFacts.source);
    }
    if (path !== `.tau/artifacts/board/${bomFile.name}` && path !== `.tau/artifacts/board/${netlistFile.name}`) {
      return { content: { success: false, errorCode: 'FILE_NOT_FOUND', message: 'File not found.' }, isError: true };
    }
    try {
      reads.push(path);
      return textResult(await readFile(join(root, path), 'utf8'));
    } catch {
      return { content: { success: false, errorCode: 'FILE_NOT_FOUND', message: 'File not found.' }, isError: true };
    }
  }
  if (invocation.toolName === toolName.evaluateModel) {
    return {
      content: {
        success: true,
        status: 'ready',
        kernelIssues: boardFacts.evaluation.issues,
        sourceRevision: boardFacts.evaluation.sourceRevision,
        views: boardFacts.evaluation.views.map(({ id }) => id),
        exports: Object.fromEntries(boardFacts.evaluation.exports.map(({ id, extension }) => [id, extension])),
      },
      isError: false,
    };
  }
  if (invocation.toolName === toolName.exportModel) {
    const to = target(input, 'to');
    if (to === 'bom' || to === 'csv' || to === 'netlist' || to === 'txt') {
      const product = to === 'bom' || to === 'csv' ? boardFacts.bom : boardFacts.netlist;
      const file = product.files[0];
      if (!file) {
        return unavailable();
      }
      const path = `.tau/artifacts/board/${file.name}`;
      await mkdir(join(root, '.tau/artifacts/board'), { recursive: true });
      await writeFile(join(root, path), file.text);
      return {
        content: {
          success: true,
          to,
          exportId: product.exportId,
          files: [
            { name: file.name, artifactPath: path, mimeType: file.mimeType, byteLength: Buffer.byteLength(file.text) },
          ],
          sourceRevision: product.sourceRevision,
        },
        isError: false,
      };
    }
  }
  return unavailable();
};

for (const modelId of modelIds) {
  describe.skipIf(!hasLiveCredential(modelId))(
    `board export-evidence live benchmark: ${modelId} (set ${liveCredentialName(modelId)} to run)`,
    () => {
      let gateway: LiveGateway;
      let root: string;
      beforeAll(async () => {
        gateway = await startLiveGateway();
        root = await mkdtemp(join(tmpdir(), 'tau-board-live-'));
      });
      afterAll(async () => {
        await gateway.close();
        await rm(root, { recursive: true, force: true });
      });

      it('finds the open pin and reads the parts through the live toolbelt', async () => {
        const id = `board-evidence-${modelId}-${Date.now().toString(36)}`;
        const reads: string[] = [];
        const session = await createLiveSession({
          gateway,
          chatId: id,
          runId: `${id}-run`,
          leaderEpoch: `${id}-epoch`,
          systemPrompt: liveCadSystemPrompt({ chatId: id, modelId, kernel: 'tscircuit' }),
          model: liveSessionModel(modelId),
          toolRegistry: createLiveToolRegistry({ results: async (invocation) => boardResult(root, reads, invocation) }),
          eventLog: await createNodeEventLog({ filePath: join(root, id, 'events.jsonl'), access: 'write' }),
        });
        try {
          await session.prompt({
            id: `${id}-user`,
            role: 'user',
            content:
              'Check main.tsx: find the unconnected pin, then list the parts with their values and packages. This is a design question, not a request to download a file. Answer briefly from board evidence.',
          });
          const snapshot = await session.snapshot();
          const answer = snapshot.state === 'completed' ? finalText(snapshot) : '';
          const calls = toolCalls(snapshot.messages).map((call) => call.toolName);
          const usage = snapshot.messages.findLast((message) => message.role === 'assistant')?.metadata?.usage;
          const parts = answerParts.every(
            ({ designator, footprint }) => answer.includes(designator) && answer.includes(footprint),
          );
          const evidenceRead = reads.includes(`.tau/artifacts/board/${bomFile.name}`);
          const openPin = /R2[.\s-]*pin1|pin1[.\s-]*on[.\s-]*R2/iu.test(answer);
          process.stdout.write(
            `BOARD_EVIDENCE ${JSON.stringify({ modelId, state: snapshot.state, calls, openPin, parts, evidenceRead, usage, failureCode: snapshot.failure?.code })}\n`,
          );
          expect(boardFacts.evaluation.sourceRevision.files['main.tsx']).toBe(sourceDigest);
          expect(boardFacts.bom.sourceRevision).toEqual(boardFacts.evaluation.sourceRevision);
          expect(boardFacts.netlist.sourceRevision).toEqual(boardFacts.evaluation.sourceRevision);
          expectCompleted(snapshot);
          expectPairedToolMessages(snapshot);
          expect(calls).toContain(toolName.evaluateModel);
          expect(calls).toContain(toolName.exportModel);
          expect(evidenceRead, `${modelId} did not read the producer-backed BOM export`).toBe(true);
          expect(openPin, `${modelId} did not identify the open R2 pin`).toBe(true);
          expect(parts, `${modelId} did not name every BOM designator and footprint`).toBe(true);
        } finally {
          await session.close();
        }
      });
    },
  );
}
