import { createClipper2TsBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-ts.js';
import { createClipper2WasmBackend } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-clipper2-wasm.js';
import { createSectionCapBooleanOperations } from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';
import type {
  CapPolygonBooleanBackend,
  SectionCapBooleanOperations,
} from '#components/geometry/graphics/three/utils/section-cap-polygon-boolean-backend.js';

let cachedOperationsPromise: Promise<SectionCapBooleanOperations> | undefined;

type CreateSectionCapWorkerBooleanOperationsOptions = Readonly<{
  createWasmBackend?: () => Promise<CapPolygonBooleanBackend>;
  createFallbackBackend?: typeof createClipper2TsBackend;
}>;

export const createSectionCapWorkerBooleanOperations = async (
  options: CreateSectionCapWorkerBooleanOperationsOptions = {},
): Promise<SectionCapBooleanOperations> => {
  const createWasmBackend = options.createWasmBackend ?? createClipper2WasmBackend;
  const createFallbackBackend = options.createFallbackBackend ?? createClipper2TsBackend;
  try {
    const wasmBackend = await createWasmBackend();
    return createSectionCapBooleanOperations(wasmBackend);
  } catch (error) {
    const fallbackBackend = createFallbackBackend({
      fallbackFrom: 'clipper2-wasm',
      initError: error instanceof Error ? error.message : 'Unknown clipper2-wasm initialization failure.',
    });
    return createSectionCapBooleanOperations(fallbackBackend);
  }
};

export const getSectionCapWorkerBooleanOperations = async (): Promise<SectionCapBooleanOperations> => {
  cachedOperationsPromise ??= createSectionCapWorkerBooleanOperations();
  return cachedOperationsPromise;
};

export const resetSectionCapWorkerBooleanOperationsForTests = (): void => {
  cachedOperationsPromise = undefined;
};
