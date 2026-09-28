import { initOcct } from '@taucad/occt-core';
import { openCascadeWasmUrl } from '@taucad/geospec-engine/native/opencascade/single/wasm-url';
import type { OpenCascadeInstance as GeoSpecNativeStepBackend } from '@taucad/geospec-engine/native/opencascade/single';
import type { XdeOccurrence } from 'geospec/step';

export type ExactRequest = { id: number; stepText: string; nameA: string; nameB: string };
export type ExactResponse =
  | {
      id: number;
      status: 'cad-geometry';
      distanceMeters: number;
      pointAMeters: [number, number, number];
      pointBMeters: [number, number, number];
      source: 'ap242';
    }
  | { id: number; status: 'unavailable'; reason: string };

type NativeResult = { occurrences?: XdeOccurrence[]; error?: string };
type ExtremaResult = { distance?: number; pointA?: number[]; pointB?: number[]; error?: string };

function tauMeters(point: number[]): [number, number, number] {
  if (point.length !== 3 || !point.every((value) => Number.isFinite(value))) {
    throw new Error('AP242 returned an invalid witness.');
  }
  // The exporter writes y-up STEP; the viewer's canonical glTF adapter maps y-up to Tau z-up.
  return [point[0]! / 1000, -point[2]! / 1000, point[1]! / 1000];
}

/** Read one retained AP242 document, match authored occurrence names uniquely, and release its native handle. */
export async function evaluateExactOccurrenceDistance(
  request: ExactRequest,
  initialize: () => Promise<GeoSpecNativeStepBackend> = async () => {
    const module_ = await import('@taucad/geospec-engine/native/opencascade/single');
    return initOcct(openCascadeWasmUrl, module_.default);
  },
): Promise<ExactResponse> {
  try {
    // The only supported writer is Replicad's direct AP242 path. Every emitted
    // length context must be millimetres; OCCT normalizes retained shapes to session mm.
    const lengthUnits = [...request.stepText.matchAll(/SI_UNIT\(([^,]*),\.METRE\.\)/gu)].map((match) => match[1]);
    if (lengthUnits.length === 0 || lengthUnits.some((unit) => unit !== '.MILLI.')) {
      throw new Error('The AP242 source has no verified millimetre length context.');
    }
    const backend = await initialize();
    const reader = backend.GeoSpecXdeReader;
    const native = reader.readText(request.stepText, '{}');
    try {
      if (!native.isSuccess()) {
        throw new Error('The AP242 reader rejected the exported source.');
      }
      const data = JSON.parse(native.resultJson()) as NativeResult;
      if (data.error !== undefined || !Array.isArray(data.occurrences)) {
        throw new Error('The AP242 occurrence table is unavailable.');
      }
      const matchesA = data.occurrences.filter((item) => item.instanceName === request.nameA);
      const matchesB = data.occurrences.filter((item) => item.instanceName === request.nameB);
      if (matchesA.length !== 1 || matchesB.length !== 1 || matchesA[0]!.shapeIndex === matchesB[0]!.shapeIndex) {
        throw new Error('Displayed component names do not identify two unique AP242 occurrences.');
      }
      const extrema = JSON.parse(
        native.extrema(matchesA[0]!.shapeIndex, -1, matchesB[0]!.shapeIndex, -1),
      ) as ExtremaResult;
      if (
        extrema.error !== undefined ||
        !Number.isFinite(extrema.distance) ||
        extrema.distance! < 0 ||
        !Array.isArray(extrema.pointA) ||
        !Array.isArray(extrema.pointB)
      ) {
        throw new Error('Exact AP242 minimum-distance computation failed.');
      }
      return {
        id: request.id,
        status: 'cad-geometry',
        distanceMeters: extrema.distance! / 1000,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stable witness wire field.
        pointAMeters: tauMeters(extrema.pointA),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Stable witness wire field.
        pointBMeters: tauMeters(extrema.pointB),
        source: 'ap242',
      };
    } finally {
      native.delete();
    }
  } catch (error) {
    return {
      id: request.id,
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'Exact AP242 query failed.',
    };
  }
}

if (!('document' in globalThis) && typeof globalThis.postMessage === 'function') {
  globalThis.addEventListener('message', async (event: MessageEvent<ExactRequest>) => {
    const result = await evaluateExactOccurrenceDistance(event.data);
    globalThis.postMessage(result);
  });
}
