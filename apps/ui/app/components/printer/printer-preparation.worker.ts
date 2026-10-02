import { sha256BytesSync } from '@taucad/utils/hash';
import { ToolpathParseError } from '@taucad/slicer/toolpath';
import { preparePrinterProgram } from '#components/printer/printer-program.js';
import type { PrinterFileKind } from '#components/printer/printer-file.js';
import type { PrinterPreparationResult } from '#components/printer/printer-preparation.js';

globalThis.addEventListener(
  'message',
  (event: MessageEvent<{ bytes: Uint8Array<ArrayBuffer>; kind: PrinterFileKind | 'hash' }>): void => {
    if (event.data.kind === 'hash') {
      globalThis.postMessage({ digest: sha256BytesSync(event.data.bytes) });
      return;
    }
    const started = performance.now();
    try {
      const stageDurations: Record<string, number> = {};
      const prepared = preparePrinterProgram(event.data.bytes, event.data.kind, (stage, duration) => {
        stageDurations[stage] = duration;
      });
      if (prepared.kind === 'refused') {
        globalThis.postMessage({ ...prepared, stageDurations, preparationDuration: performance.now() - started });
        return;
      }
      const { value } = prepared;
      const arrays: Array<ArrayBufferView<ArrayBuffer>> = [];
      for (const item of Object.values(value.program)) {
        if (ArrayBuffer.isView(item)) {
          arrays.push(item);
        }
      }
      if (value.program.deposition) {
        for (const item of Object.values(value.program.deposition)) {
          if (ArrayBuffer.isView(item)) {
            arrays.push(item);
          }
        }
      }
      for (const chunk of value.beads.chunks) {
        arrays.push(chunk.segments, chunk.positions, chunk.dimensions, chunk.joins, chunk.metrics, chunk.roles);
      }
      arrays.push(value.grouping.groupOf, value.prefix, ...value.grouping.lineIndices);
      for (const column of Object.values(value.eventIndex)) {
        arrays.push(column.times, column.values);
      }
      const result: PrinterPreparationResult = {
        kind: 'ready',
        stageDurations,
        value: { ...value, slicedPlate: undefined },
        preparationDuration: performance.now() - started,
      };
      globalThis.postMessage(result, { transfer: [...new Set(arrays.map((array) => array.buffer))] });
    } catch (error) {
      globalThis.postMessage({
        kind: 'error',
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof ToolpathParseError ? error.code : undefined,
      });
    }
  },
);
