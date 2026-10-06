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
  });

  /* eslint-disable @typescript-eslint/naming-convention -- keys are the `tau_agent_*` Prometheus label contract */
  describe('agent usage entries', () => {
    const codex = { agent_id: 'codex', agent_placement: 'daemon' };

    it('should record a completed Codex turn with tools and tokens', () => {
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

      const turn = { ...codex, outcome: 'completed' };
      expect(mockMetrics.agentTurns.add).toHaveBeenCalledWith(1, turn);
      expect(mockMetrics.agentTurnDuration.record).toHaveBeenCalledWith(12, turn);
      expect(mockMetrics.agentTimeToFirstUpdate.record).toHaveBeenCalledWith(1.5, codex);
      expect(mockMetrics.agentToolCalls.add).toHaveBeenCalledWith(2, {
        agent_id: 'codex',
        tool_kind: 'execute',
        status: 'completed',
      });
      expect(mockMetrics.agentTokens.add.mock.calls).toEqual([
        [100, { agent_id: 'codex', token_type: 'input' }],
        [20, { agent_id: 'codex', token_type: 'output' }],
        [50, { agent_id: 'codex', token_type: 'cache_read' }],
        [0, { agent_id: 'codex', token_type: 'cache_write' }],
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
        agent_id: 'tau',
        error_code: 'CHAT_PLACEMENT_UNAVAILABLE',
      });
      expect(mockMetrics.agentSessions.add).toHaveBeenCalledWith(1, {
        agent_id: 'tau',
        agent_placement: 'browser',
        outcome: 'refused',
      });
      expect(mockMetrics.agentTokens.add).not.toHaveBeenCalled();
      expect(mockMetrics.agentTimeToFirstUpdate.record).not.toHaveBeenCalled();
    });
  });

  /* eslint-enable @typescript-eslint/naming-convention -- end label contract */

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

    it('should reject empty entries array', () => {
      expect(() =>
        // oxlint-disable-next-line @typescript-eslint/no-unsafe-return -- pipe.transform return type is any from NestJS ValidationPipe
        pipe.transform({ entries: [] }, { type: 'body', metatype: IngestPayloadDto }),
      ).toThrow();
    });

    it.each([
      ['an unbounded agent id', { agentId: 'Some User Text', placement: 'daemon', outcome: 'completed' }],
      ['an unknown placement', { agentId: 'codex', placement: 'mars', outcome: 'completed' }],
      ['a free-text error code', { agentId: 'codex', placement: 'daemon', outcome: 'error', errorCode: 'oops: x' }],
      [
        'an out-of-range token count',
        {
          agentId: 'codex',
          placement: 'daemon',
          outcome: 'completed',
          tokens: { input: 1e12, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      ],
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
