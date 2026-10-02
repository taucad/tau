// @vitest-environment node
import process from 'node:process';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { collectStreamChunks, collectFinalMessage } from '#testing/stream-consumer.js';
import {
  expectNoErrors,
  expectHasTextContent,
  expectHasToolCall,
  expectToolCallSucceeded,
  expectMultipleSteps,
  extractToolCallParts,
  expectToolCallOutput,
} from '#testing/stream-assertions.js';
import { createTestApp } from '#testing/create-test-app.js';
import type { TestApp } from '#testing/create-test-app.js';
import { buildCadAgent, providerEnvForModelId, requiresEnv } from '#testing/skip-helpers.js';

type SearchResult = { title: string; url: string; content: string };
type BrowserResult = { url: string; content: string };

const modelId = process.env['TEST_MODEL_ID'] ?? 'anthropic-claude-sonnet-4.6';

// Live test — requires `TAVILY_API_KEY` plus the provider key derived from
// `TEST_MODEL_ID`. Run via:
// `pnpm nx test api app/testing/web-tools-integration.test.ts --watch=false`
const providerEnvVariable = providerEnvForModelId(modelId);

describe.skipIf(providerEnvVariable === undefined || requiresEnv(providerEnvVariable, 'TAVILY_API_KEY'))(
  `Web Tools Integration: ${modelId}`,
  () => {
    let testApp: TestApp;

    beforeAll(async () => {
      testApp = await createTestApp();
    }, 30_000);

    afterAll(async () => {
      await testApp.app.close();
    });

    // =============================================================================
    // Helper
    // =============================================================================

    const sendChat = async (text: string, toolChoice?: string[]) =>
      fetch(`${testApp.baseUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `test-web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          messages: [
            {
              id: 'msg_1',
              role: 'user',
              parts: [{ type: 'text', text }],
              metadata: { model: modelId, kernel: 'replicad' },
            },
          ],
          agent: {
            ...buildCadAgent(modelId, 'replicad'),
            ...(toolChoice ? { toolChoice } : {}),
          },
        }),
      });

    // =============================================================================
    // Web Search Tool
    // =============================================================================

    describe('web_search', () => {
      it('should return search results containing relevant TypeScript content', async () => {
        const response = await sendChat(
          'Search the web for "TypeScript programming language". Only search, do not browse any pages.',
          ['web_search'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);
        expectNoErrors(chunks);

        const message = await collectFinalMessage(chunks);
        expectHasTextContent(message);
        expectHasToolCall(message, 'web_search');
        expectToolCallSucceeded(message, 'web_search');

        expectToolCallOutput(message, 'web_search', (output) => {
          const results = output as SearchResult[];
          expect(results.length, 'web_search should return at least one result').toBeGreaterThanOrEqual(1);

          for (const result of results) {
            expect(typeof result.title, 'Each result should have a string title').toBe('string');
            expect(typeof result.url, 'Each result should have a string url').toBe('string');
            expect(typeof result.content, 'Each result should have a string content').toBe('string');
          }

          const allContent = results.map((r) => `${r.title} ${r.url} ${r.content}`.toLowerCase()).join(' ');
          expect(allContent, 'Search results should mention TypeScript').toContain('typescript');
        });
      }, 120_000);

      it('should return substantive content snippets for science queries', async () => {
        const response = await sendChat(
          'Search the web for "how does the sun produce energy" and summarize what you find.',
          ['web_search'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);
        expectNoErrors(chunks);

        const message = await collectFinalMessage(chunks);
        expect(message.role).toBe('assistant');
        expectHasTextContent(message);
        expectHasToolCall(message, 'web_search');
        expectToolCallSucceeded(message, 'web_search');

        expectToolCallOutput(message, 'web_search', (output) => {
          const results = output as SearchResult[];
          expect(results.length, 'web_search should return results').toBeGreaterThanOrEqual(1);

          const allContent = results.map((r) => r.content.toLowerCase()).join(' ');
          const hasScienceContent =
            allContent.includes('fusion') || allContent.includes('nuclear') || allContent.includes('hydrogen');
          expect(
            hasScienceContent,
            `Search content should reference fusion/nuclear/hydrogen. Got: ${allContent.slice(0, 300)}`,
          ).toBe(true);
        });
      }, 120_000);
    });

    // =============================================================================
    // Web Browser Tool
    // =============================================================================

    describe('web_browser', () => {
      it('should extract "Example Domain" text from example.com HTML page', async () => {
        const response = await sendChat(
          'Use the web_browser tool to extract the content of https://example.com and tell me what it says.',
          ['web_browser'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);
        expectNoErrors(chunks);

        const message = await collectFinalMessage(chunks);
        expectHasTextContent(message);
        expectHasToolCall(message, 'web_browser');
        expectToolCallSucceeded(message, 'web_browser');

        expectToolCallOutput(message, 'web_browser', (output) => {
          const results = output as BrowserResult[];
          expect(results.length).toBeGreaterThanOrEqual(1);

          const first = results[0]!;
          expect(first.url, 'URL should reference example.com').toContain('example.com');

          expect(first.content, 'HTML extraction should contain the page heading').toContain('Example Domain');
          expect(first.content, 'HTML extraction should contain the page body text').toContain('for use in');
        });
      }, 120_000);

      it('should extract readable text from a content-rich PDF document', async () => {
        const pdfUrl = 'https://datasheets.raspberrypi.com/rpi5/raspberry-pi-5-product-brief.pdf';
        const response = await sendChat(
          `Use the web_browser tool to extract the text content from this PDF: ${pdfUrl} — tell me the key specifications.`,
          ['web_browser'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);
        expectNoErrors(chunks);

        const message = await collectFinalMessage(chunks);
        expectHasTextContent(message);
        expectHasToolCall(message, 'web_browser');
        expectToolCallSucceeded(message, 'web_browser');

        const parts = extractToolCallParts(message, 'web_browser');
        const completed = parts.filter((p) => p.state === 'output-available');
        expect(completed.length, 'web_browser should complete with output').toBeGreaterThanOrEqual(1);

        const results = completed[0]!.output as BrowserResult[];
        expect(results.length).toBeGreaterThanOrEqual(1);

        const first = results[0]!;
        expect(first.url, 'URL should reference the PDF').toContain('.pdf');

        expect(first.content.length, 'PDF extraction should produce substantial text').toBeGreaterThan(100);
        expect(first.content, 'PDF should contain product name').toContain('Raspberry Pi 5');
        expect(first.content.toLowerCase(), 'PDF should mention the processor architecture').toContain('cortex-a76');
      }, 120_000);

      it('should report extraction failure with HTTP status for unreachable URLs', async () => {
        const response = await sendChat(
          'Use the web_browser tool to read https://httpstat.us/404 — if it fails, just tell me it failed.',
          ['web_browser'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);

        const message = await collectFinalMessage(chunks);
        expect(message.role).toBe('assistant');
        expectHasTextContent(message);
        expectHasToolCall(message, 'web_browser');

        const parts = extractToolCallParts(message, 'web_browser');
        expect(parts.length, 'Should have web_browser tool call parts').toBeGreaterThanOrEqual(1);

        const lastPart = parts.at(-1)!;
        if (lastPart.state === 'output-available') {
          const results = lastPart.output as BrowserResult[];
          const first = results[0]!;
          expect(first.content, 'Failed extraction should include error marker').toContain('[Extraction failed]');
          expect(first.content, 'Error should mention HTTP 404 status').toMatch(/404/);
        }
      }, 120_000);

      it('should report 403 Forbidden with actionable error message', async () => {
        const response = await sendChat(
          'Use the web_browser tool to read https://httpstat.us/403 — report exactly what the tool returns.',
          ['web_browser'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);

        const message = await collectFinalMessage(chunks);
        expect(message.role).toBe('assistant');
        expectHasTextContent(message);
        expectHasToolCall(message, 'web_browser');

        const parts = extractToolCallParts(message, 'web_browser');
        expect(parts.length, 'Should have web_browser tool call parts').toBeGreaterThanOrEqual(1);

        const lastPart = parts.at(-1)!;
        if (lastPart.state === 'output-available') {
          const results = lastPart.output as BrowserResult[];
          const first = results[0]!;
          expect(first.content, 'Should surface the 403 error clearly').toContain('[Extraction failed]');
          expect(first.content, 'Error should mention Forbidden status').toMatch(/403|Forbidden/);
          expect(first.content, 'Error should suggest alternative approach').toContain('web_search');
        }
      }, 120_000);
    });

    // =============================================================================
    // Combined Search + Browse Flow
    // =============================================================================

    describe('search + browse', () => {
      it('should search for Raspberry Pi 5 specs and browse a result with extractable content', async () => {
        const response = await sendChat(
          'Search the web for "Raspberry Pi 5 specifications", then use the web_browser tool to read the full content of the most relevant result. Summarize what you find.',
          ['web_search', 'web_browser'],
        );

        expect(response.ok, `HTTP ${response.status}: ${response.statusText}`).toBe(true);

        const chunks = await collectStreamChunks(response);
        expectNoErrors(chunks);

        const message = await collectFinalMessage(chunks);
        expect(message.role).toBe('assistant');
        expectHasTextContent(message);

        expectHasToolCall(message, 'web_search');
        expectToolCallSucceeded(message, 'web_search');

        expectToolCallOutput(message, 'web_search', (output) => {
          const results = output as SearchResult[];
          expect(results.length, 'Search should return results').toBeGreaterThanOrEqual(1);

          const allText = results.map((r) => `${r.title} ${r.content}`.toLowerCase()).join(' ');
          expect(allText, 'Search results should mention Raspberry Pi').toContain('raspberry pi');
        });

        expectHasToolCall(message, 'web_browser');
        expectToolCallSucceeded(message, 'web_browser');

        expectToolCallOutput(message, 'web_browser', (output) => {
          const results = output as BrowserResult[];
          expect(results.length, 'Browser should return results').toBeGreaterThanOrEqual(1);

          const first = results[0]!;
          expect(first.url.length, 'Browsed URL should be non-empty').toBeGreaterThan(0);
          expect(first.content.length, 'Browsed page should return content').toBeGreaterThan(0);
        });

        expectMultipleSteps(chunks, 2);
      }, 180_000);
    });
  },
);
