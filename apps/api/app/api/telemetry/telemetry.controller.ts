/* oxlint-disable new-cap -- NestJS decorators use PascalCase */
import { Body, Controller, Post, HttpCode, UseGuards } from '@nestjs/common';
import { IngestEntryName, AttributeKey, knownAgentIds } from '@taucad/telemetry';
import type { ClientMetricEntry } from '@taucad/telemetry';
import { AuthGuard } from '#auth/auth.guard.js';
import { MetricsService } from '#telemetry/metrics.js';
import { IngestPayloadDto } from '#api/telemetry/telemetry.dto.js';

const maximumSyncLagMilliseconds = 24 * 60 * 60 * 1000;
const maximumSyncPending = 10_000;

/**
 * Receives batched telemetry from the client runtime (web workers).
 * Metrics are reported directly from the observability middleware via fetch().
 */
@UseGuards(AuthGuard)
@Controller({ path: 'telemetry', version: '1' })
export class TelemetryController {
  public constructor(private readonly metrics: MetricsService) {}

  @Post('ingest')
  @HttpCode(204)
  public ingest(@Body() body: IngestPayloadDto): void {
    for (const entry of body.entries) {
      this.recordEntry(entry, entry.duration / 1000);
    }
  }

  private recordEntry(entry: ClientMetricEntry, durationSeconds: number): void {
    switch (entry.name) {
      case IngestEntryName.KERNEL_CREATE_GEOMETRY: {
        this.recordKernelCreate(entry, durationSeconds);
        return;
      }
      case IngestEntryName.KERNEL_EXPORT_GEOMETRY: {
        this.recordKernelExport(entry, durationSeconds);
        return;
      }
      case IngestEntryName.WEBSOCKET_RECONNECTION: {
        this.recordWebsocketReconnection(entry, durationSeconds);
        return;
      }
      case IngestEntryName.EDITOR_LOAD: {
        this.recordEditorLoad(entry, durationSeconds);
        return;
      }
      case IngestEntryName.WASM_MODULE_LOAD: {
        this.recordWasmModuleLoad(entry, durationSeconds);
        return;
      }
      case IngestEntryName.INDEXEDDB_OPERATION: {
        this.recordIndexedDbOperation(entry, durationSeconds);
        return;
      }
      case IngestEntryName.AGENT_SESSION: {
        this.recordAgentSession(entry);
        return;
      }
      case IngestEntryName.AGENT_TURN: {
        this.recordAgentTurn(entry, durationSeconds);
        return;
      }
      case IngestEntryName.SYNC_ATTEMPT: {
        this.recordSyncAttempt(entry);
        return;
      }
      default: {
        const exhaustive: never = entry;
        throw new Error(`Unhandled ingest entry: ${(exhaustive as { name: string }).name}`);
      }
    }
  }

  private recordKernelCreate(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.KERNEL_CREATE_GEOMETRY }>,
    durationSeconds: number,
  ): void {
    const status = entry.detail?.status ?? 'unknown';
    this.metrics.kernelExecutionDuration.record(durationSeconds, { [AttributeKey.KERNEL_STATUS]: status });
    this.metrics.kernelExecutions.add(1, { [AttributeKey.KERNEL_STATUS]: status });
  }

  private recordKernelExport(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.KERNEL_EXPORT_GEOMETRY }>,
    durationSeconds: number,
  ): void {
    const status = entry.detail?.status ?? 'unknown';
    const format = entry.detail?.exportFormat ?? 'unknown';
    this.metrics.kernelExportDuration.record(durationSeconds, {
      [AttributeKey.KERNEL_STATUS]: status,
      [AttributeKey.EXPORT_FORMAT]: format,
    });
  }

  private recordWebsocketReconnection(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.WEBSOCKET_RECONNECTION }>,
    durationSeconds: number,
  ): void {
    this.metrics.wsReconnectionDuration.record(durationSeconds, {
      [AttributeKey.WS_RECONNECTION_ATTEMPT]: entry.detail?.attempt ?? 0,
    });
  }

  private recordEditorLoad(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.EDITOR_LOAD }>,
    durationSeconds: number,
  ): void {
    this.metrics.editorLoadDuration.record(durationSeconds, {
      [AttributeKey.EDITOR_KERNEL]: entry.detail?.kernel ?? 'unknown',
    });
  }

  private recordWasmModuleLoad(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.WASM_MODULE_LOAD }>,
    durationSeconds: number,
  ): void {
    this.metrics.wasmModuleLoadDuration.record(durationSeconds, {
      [AttributeKey.WASM_MODULE]: entry.detail?.module ?? 'unknown',
    });
  }

  private recordIndexedDbOperation(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.INDEXEDDB_OPERATION }>,
    durationSeconds: number,
  ): void {
    this.metrics.indexeddbOperationDuration.record(durationSeconds, {
      [AttributeKey.INDEXEDDB_OPERATION]: entry.detail?.operation ?? 'unknown',
      [AttributeKey.INDEXEDDB_STORE]: entry.detail?.store ?? 'unknown',
    });
  }

  private recordAgentSession(entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.AGENT_SESSION }>): void {
    const { agentId, placement, outcome } = entry.detail;
    this.metrics.agentSessions.add(1, {
      [AttributeKey.AGENT_ID]: recordedAgentId(agentId),
      [AttributeKey.AGENT_PLACEMENT]: placement,
      [AttributeKey.AGENT_OUTCOME]: outcome,
    });
  }

  private recordAgentTurn(
    entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.AGENT_TURN }>,
    durationSeconds: number,
  ): void {
    const { placement, outcome, errorCode, timeToFirstUpdate, toolCalls, tokens } = entry.detail;
    const agent = { [AttributeKey.AGENT_ID]: recordedAgentId(entry.detail.agentId) };
    const placed = { ...agent, [AttributeKey.AGENT_PLACEMENT]: placement };
    const turn = { ...placed, [AttributeKey.AGENT_OUTCOME]: outcome };
    this.metrics.agentTurns.add(1, turn);
    this.metrics.agentTurnDuration.record(durationSeconds, turn);
    if (timeToFirstUpdate !== undefined) {
      this.metrics.agentTimeToFirstUpdate.record(timeToFirstUpdate / 1000, placed);
    }
    for (const call of toolCalls ?? []) {
      this.metrics.agentToolCalls.add(call.count, {
        ...agent,
        [AttributeKey.AGENT_TOOL_KIND]: call.kind,
        [AttributeKey.AGENT_TOOL_STATUS]: call.status,
      });
    }
    if (tokens !== undefined) {
      const byType = [
        ['input', tokens.input],
        ['output', tokens.output],
        ['cache_read', tokens.cacheRead],
        ['cache_write', tokens.cacheWrite],
      ] as const;
      for (const [tokenType, count] of byType) {
        /* A type the agent never uses (Codex reports no cache writes) mints no series. */
        if (count > 0) {
          this.metrics.agentTokens.add(count, { ...agent, [AttributeKey.AGENT_TOKEN_TYPE]: tokenType });
        }
      }
    }
    if (errorCode !== undefined && (outcome === 'error' || outcome === 'refused')) {
      this.metrics.agentErrors.add(1, { ...agent, [AttributeKey.AGENT_ERROR_CODE]: errorCode });
    }
  }

  private recordSyncAttempt(entry: Extract<ClientMetricEntry, { name: typeof IngestEntryName.SYNC_ATTEMPT }>): void {
    const { direction, outcome, placement, lagMilliseconds, pending } = entry.detail;
    const attributes = { 'agent.placement': placement };
    this.metrics.syncClientAttempts.add(1, { direction, outcome, ...attributes });
    /* A client clock or a corrupt queue must not stretch the histograms: clamp to a day and a bounded depth. */
    if (lagMilliseconds !== undefined) {
      this.metrics.syncClientLag.record(Math.min(lagMilliseconds, maximumSyncLagMilliseconds) / 1000, attributes);
    }
    if (pending !== undefined) {
      this.metrics.syncClientPending.record(Math.min(pending, maximumSyncPending), attributes);
    }
  }
}

/** The ingest validates an id's shape; only known agents are recorded as themselves (bounded cardinality). */
const recordedAgentId = (agentId: string): string => (knownAgentIds.has(agentId) ? agentId : 'other');
