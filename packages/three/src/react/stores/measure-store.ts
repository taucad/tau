import { createStore } from 'zustand/vanilla';

type Measurement = {
  id: string;
  startPoint: [number, number, number];
  endPoint: [number, number, number];
  distance: number;
  name: string;
  isPinned: boolean;
};

type MeasureUnits = {
  factor: number;
  symbol: string;
};

type MeasureStoreOptions = {
  snapDistance?: number;
  units?: MeasureUnits;
};

type MeasureState = {
  isActive: boolean;
  measurements: Measurement[];
  currentStart: [number, number, number] | undefined;
  snapDistance: number;
  hoveredMeasurementId: string | undefined;
  units: MeasureUnits;
  setActive: (active: boolean) => void;
  startMeasurement: (point: [number, number, number]) => void;
  completeMeasurement: (endPoint: [number, number, number]) => void;
  cancelMeasurement: () => void;
  clearMeasurement: (id: string) => void;
  clearAll: () => void;
  clearUnpinned: () => void;
  togglePinned: (id: string) => void;
  setHoveredMeasurement: (id: string | undefined) => void;
  setMeasurementName: (id: string, name: string) => void;
  setUnits: (units: MeasureUnits) => void;
  setSnapDistance: (distance: number) => void;
};

function computeDistance(start: [number, number, number], end: [number, number, number]): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function createMeasureStore(options?: MeasureStoreOptions) {
  return createStore<MeasureState>((set) => ({
    isActive: false,
    measurements: [],
    currentStart: undefined,
    snapDistance: options?.snapDistance ?? 0.1,
    hoveredMeasurementId: undefined,
    units: options?.units ?? { factor: 1, symbol: 'mm' },
    setActive: (active) => { set({ isActive: active }); },
    startMeasurement: (point) => { set({ currentStart: point }); },
    completeMeasurement: (endPoint) => {
      set((state) => {
        if (!state.currentStart) {
          return state;
        }

        const measurement: Measurement = {
          id: crypto.randomUUID(),
          startPoint: state.currentStart,
          endPoint,
          distance: computeDistance(state.currentStart, endPoint),
          name: `Measurement ${String(state.measurements.length + 1)}`,
          isPinned: false,
        };

        return {
          measurements: [...state.measurements, measurement],
          currentStart: undefined,
        };
      });
    },
    cancelMeasurement: () => { set({ currentStart: undefined }); },
    clearMeasurement: (id) => {
      set((state) => ({
        measurements: state.measurements.filter((m) => m.id !== id),
      }));
    },
    clearAll: () => { set({ measurements: [], currentStart: undefined }); },
    clearUnpinned: () => {
      set((state) => ({
        measurements: state.measurements.filter((m) => m.isPinned),
      }));
    },
    togglePinned: (id) => {
      set((state) => ({
        measurements: state.measurements.map((m) =>
          m.id === id ? { ...m, isPinned: !m.isPinned } : m,
        ),
      }));
    },
    setHoveredMeasurement: (id) => { set({ hoveredMeasurementId: id }); },
    setMeasurementName: (id, name) => {
      set((state) => ({
        measurements: state.measurements.map((m) =>
          m.id === id ? { ...m, name } : m,
        ),
      }));
    },
    setUnits: (units) => { set({ units }); },
    setSnapDistance: (distance) => { set({ snapDistance: distance }); },
  }));
}

export type { Measurement, MeasureUnits, MeasureStoreOptions, MeasureState };
export type MeasureStore = ReturnType<typeof createMeasureStore>;
