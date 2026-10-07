import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodValidationPipe } from 'nestjs-zod';
import type { MetricsService } from '#telemetry/metrics.js';
import { TelemetryController } from '#api/telemetry/telemetry.controller.js';
import { IngestPayloadDto } from '#api/telemetry/telemetry.dto.js';
import { IngestEntryName, AttributeKey } from '@taucad/telemetry';

function createMockMetrics() {
  return {
    kernelExecutionDuration: { record: vi.fn() },
    kernelExecutions: { add: vi.fn() },
    kernelExportDuration: { record: vi.fn() },
    agentSessions: { add: vi.fn() },
    agentTurns: { add: vi.fn() },
    agentTurnDuration: { record: vi.fn() },
    agentTimeToFirstUpdate: { record: vi.fn() },
    agentToolCalls: { add: vi.fn() },
    agentTokens: { add: vi.fn() },
    agentErrors: { add: vi.fn() },
    syncClientAttempts: { add: vi.fn() },
    syncClientLag: { record: vi.fn() },
    syncClientPending: { record: vi.fn() },
  };
}

describe('TelemetryController', () => {
  let controller: TelemetryController;
  let mockMetrics: ReturnType<typeof createMockMetrics>;

  beforeEach(() => {
    mockMetrics = createMockMetrics();
    controller = new TelemetryController(mockMetrics as unknown as MetricsService);
  });

  describe('POST /v1/telemetry/ingest', () => {
    it('should record kernel execution duration and count for createGeometry entries', () => {
      controller.ingest({
        entries: [{ name: IngestEntryName.KERNEL_CREATE_GEOMETRY, duration: 1500, detail: { status: 'ok' } }],
      });

      expect(mockMetrics.kernelExecutionDuration.record).toHaveBeenCalledWith(1.5, {
        [AttributeKey.KERNEL_STATUS]: 'ok',
      });
      expect(mockMetrics.kernelExecutions.add).toHaveBeenCalledWith(1, { [AttributeKey.KERNEL_STATUS]: 'ok' });
    });

    it('should record export duration for exportGeometry entries', () => {
      controller.ingest({
        entries: [
          {
            name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
            duration: 800,
            detail: { status: 'ok', exportFormat: 'glb' },
          },
        ],
      });

      expect(mockMetrics.kernelExportDuration.record).toHaveBeenCalledWith(0.8, {
        [AttributeKey.KERNEL_STATUS]: 'ok',
        [AttributeKey.EXPORT_FORMAT]: 'glb',
      });
    });

    it('should default status to "unknown" when detail is missing', () => {
      controller.ingest({
        entries: [{ name: IngestEntryName.KERNEL_CREATE_GEOMETRY, duration: 500 }],
      });

      expect(mockMetrics.kernelExecutionDuration.record).toHaveBeenCalledWith(0.5, {
        [AttributeKey.KERNEL_STATUS]: 'unknown',
      });
    });

    it('should default export format to "unknown" when not provided', () => {
      controller.ingest({
        entries: [{ name: IngestEntryName.KERNEL_EXPORT_GEOMETRY, duration: 300, detail: { status: 'ok' } }],
      });

      expect(mockMetrics.kernelExportDuration.record).toHaveBeenCalledWith(0.3, {
        [AttributeKey.KERNEL_STATUS]: 'ok',
        [AttributeKey.EXPORT_FORMAT]: 'unknown',
      });
    });

    it('should process multiple entries in a single batch', () => {
      controller.ingest({
        entries: [
          { name: IngestEntryName.KERNEL_CREATE_GEOMETRY, duration: 1000, detail: { status: 'ok' } },
          {
            name: IngestEntryName.KERNEL_EXPORT_GEOMETRY,
            duration: 2000,
            detail: { status: 'ok', exportFormat: 'step' },
          },
          { name: IngestEntryName.KERNEL_CREATE_GEOMETRY, duration: 500, detail: { status: 'error' } },
        ],
      });

      expect(mockMetrics.kernelExecutionDuration.record).toHaveBeenCalledTimes(2);
      expect(mockMetrics.kernelExecutions.add).toHaveBeenCalledTimes(2);
      expect(mockMetrics.kernelExportDuration.record).toHaveBeenCalledTimes(1);
    });

    it('should record a client sync attempt, its lag and its queue depth by placement, clamped', () => {
      controller.ingest({
        entries: [
          {
            name: IngestEntryName.SYNC_ATTEMPT,
            duration: 120,
            detail: { direction: 'push', outcome: 'ok', placement: 'browser', lagMilliseconds: 2500, pending: 3 },
          },
          {
            name: IngestEntryName.SYNC_ATTEMPT,
            duration: 50,
            detail: { direction: 'push', outcome: 'retry', placement: 'daemon', lagMilliseconds: 1e12, pending: 1e9 },
          },
          {
            name: IngestEntryName.SYNC_ATTEMPT,
            duration: 0,
            detail: { direction: 'pull', outcome: 'offline', placement: 'desktop' },
          },
        ],
      });

      expect(mockMetrics.syncClientAttempts.add.mock.calls).toEqual([
        [1, { direction: 'push', outcome: 'ok', 'agent.placement': 'browser' }],
        [1, { direction: 'push', outcome: 'retry', 'agent.placement': 'daemon' }],
        [1, { direction: 'pull', outcome: 'offline', 'agent.placement': 'desktop' }],
      ]);
      expect(mockMetrics.syncClientLag.record.mock.calls).toEqual([
        [2.5, { 'agent.placement': 'browser' }],
        [86_400, { 'agent.placement': 'daemon' }],
      ]);
      expect(mockMetrics.syncClientPending.record.mock.calls).toEqual([
        [3, { 'agent.placement': 'browser' }],
        [10_000, { 'agent.placement': 'daemon' }],
      ]);
    });
  });

  describe('agent usage entries', () => {
    const codex = { [AttributeKey.AGENT_ID]: 'codex', [AttributeKey.AGENT_PLACEMENT]: 'daemon' };

    it('should record a completed Codex turn with tools and only the token types it reported', () => {
      controller.ingest({
        entries: [
          {
            name: IngestEntryName.AGENT_TURN,
            duration: 12_000,
            detail: {
              agentId: 'codex',
              placement: 'daemon',
              outcome: 'completed',
              timeToFirstUpdate: 1500,
              toolCalls: [{ kind: 'execute', status: 'completed', count: 2 }],
              tokens: { input: 100, output: 20, cacheRead: 50, cacheWrite: 0 },
            },
          },
        ],
      });

      const turn = { ...codex, [AttributeKey.AGENT_OUTCOME]: 'completed' };
      expect(mockMetrics.agentTurns.add).toHaveBeenCalledWith(1, turn);
      expect(mockMetrics.agentTurnDuration.record).toHaveBeenCalledWith(12, turn);
      expect(mockMetrics.agentTimeToFirstUpdate.record).toHaveBeenCalledWith(1.5, codex);
      expect(mockMetrics.agentToolCalls.add).toHaveBeenCalledWith(2, {
        [AttributeKey.AGENT_ID]: 'codex',
        [AttributeKey.AGENT_TOOL_KIND]: 'execute',
        [AttributeKey.AGENT_TOOL_STATUS]: 'completed',
      });
      expect(mockMetrics.agentTokens.add.mock.calls).toEqual([
        [100, { [AttributeKey.AGENT_ID]: 'codex', [AttributeKey.AGENT_TOKEN_TYPE]: 'input' }],
        [20, { [AttributeKey.AGENT_ID]: 'codex', [AttributeKey.AGENT_TOKEN_TYPE]: 'output' }],
        [50, { [AttributeKey.AGENT_ID]: 'codex', [AttributeKey.AGENT_TOKEN_TYPE]: 'cache_read' }],
      ]);
      expect(mockMetrics.agentErrors.add).not.toHaveBeenCalled();
    });

    it('should count a refused turn as an error once and record no tokens', () => {
      controller.ingest({
        entries: [
          {
            name: IngestEntryName.AGENT_TURN,
            duration: 30,
            detail: {
              agentId: 'tau',
              placement: 'browser',
              outcome: 'refused',
              errorCode: 'CHAT_PLACEMENT_UNAVAILABLE',
            },
          },
          {
            name: IngestEntryName.AGENT_SESSION,
            duration: 0,
            detail: { agentId: 'tau', placement: 'browser', outcome: 'refused' },
          },
        ],
      });

      expect(mockMetrics.agentErrors.add).toHaveBeenCalledExactlyOnceWith(1, {
        [AttributeKey.AGENT_ID]: 'tau',
        [AttributeKey.AGENT_ERROR_CODE]: 'CHAT_PLACEMENT_UNAVAILABLE',
      });
      expect(mockMetrics.agentSessions.add).toHaveBeenCalledWith(1, {
        [AttributeKey.AGENT_ID]: 'tau',
        [AttributeKey.AGENT_PLACEMENT]: 'browser',
        [AttributeKey.AGENT_OUTCOME]: 'refused',
      });
      expect(mockMetrics.agentTokens.add).not.toHaveBeenCalled();
      expect(mockMetrics.agentTimeToFirstUpdate.record).not.toHaveBeenCalled();
    });

    it('should record an agent outside the known set as other', () => {
      controller.ingest({
        entries: [
          {
            name: IngestEntryName.AGENT_SESSION,
            duration: 0,
            detail: { agentId: 'my-agent', placement: 'daemon', outcome: 'started' },
          },
        ],
      });

      expect(mockMetrics.agentSessions.add).toHaveBeenCalledWith(1, {
        [AttributeKey.AGENT_ID]: 'other',
        [AttributeKey.AGENT_PLACEMENT]: 'daemon',
        [AttributeKey.AGENT_OUTCOME]: 'started',
      });
    });
  });

  describe('IngestPayloadDto validation (via ZodValidationPipe)', () => {
    const pipe = new ZodValidationPipe();

    it('should reject entries with unknown names', () => {
      expect(() =>
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- pipe.transform return type is any from NestJS ValidationPipe
        pipe.transform(
          { entries: [{ name: 'unknown.metric', duration: 100 }] },
          { type: 'body', metatype: IngestPayloadDto },
        ),
      ).toThrow();
    });

    it.each([
      ['an unknown outcome', { direction: 'push', outcome: 'mystery', placement: 'browser' }],
      ['an unknown placement', { direction: 'push', outcome: 'ok', placement: 'mars' }],
      ['a fractional queue depth', { direction: 'push', outcome: 'ok', placement: 'browser', pending: 1.5 }],
      ['a negative lag', { direction: 'push', outcome: 'ok', placement: 'browser', lagMilliseconds: -1 }],
    ])('should reject a sync attempt with %s', (_label, detail) => {
      expect(() =>
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- pipe.transform return type is any from NestJS ValidationPipe
        pipe.transform(
          { entries: [{ name: IngestEntryName.SYNC_ATTEMPT, duration: 1, detail }] },
          { type: 'body', metatype: IngestPayloadDto },
        ),
      ).toThrow();
    });

    it('should reject empty entries array', () => {
      expect(() =>
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- pipe.transform return type is any from NestJS ValidationPipe
        pipe.transform({ entries: [] }, { type: 'body', metatype: IngestPayloadDto }),
      ).toThrow();
    });

    it('should clamp an out-of-range token count instead of dropping the turn', () => {
      // oxlint-disable-next-line @typescript-eslint/no-unsafe-assignment -- pipe.transform return type is any from NestJS ValidationPipe
      const parsed: IngestPayloadDto = pipe.transform(
        {
          entries: [
            {
              name: IngestEntryName.AGENT_TURN,
              duration: 1e12,
              detail: {
                agentId: 'codex',
                placement: 'daemon',
                outcome: 'completed',
                tokens: { input: 1e12, output: 1, cacheRead: 0, cacheWrite: 0 },
              },
            },
          ],
        },
        { type: 'body', metatype: IngestPayloadDto },
      );

      expect(parsed.entries[0]).toMatchObject({
        duration: 86_400_000,
        detail: { tokens: { input: 100_000_000, output: 1 } },
      });
    });

    it.each([
      ['an unbounded agent id', { agentId: 'Some User Text', placement: 'daemon', outcome: 'completed' }],
      ['an unknown placement', { agentId: 'codex', placement: 'mars', outcome: 'completed' }],
      ['a free-text error code', { agentId: 'codex', placement: 'daemon', outcome: 'error', errorCode: 'oops: x' }],
    ])('should reject an agent turn with %s', (_label, detail) => {
      expect(() =>
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- pipe.transform return type is any from NestJS ValidationPipe
        pipe.transform(
          { entries: [{ name: IngestEntryName.AGENT_TURN, duration: 1, detail }] },
          { type: 'body', metatype: IngestPayloadDto },
        ),
      ).toThrow();
    });
  });
});
