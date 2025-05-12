import { createContext, useContext, useReducer, useRef, useMemo, useCallback } from 'react';
import type { JSX, ReactNode } from 'react';
import type { GridSizes } from '@/components/geometry/graphics/three/grid.js';
import type { ScreenshotOptions } from '@/components/geometry/graphics/three/screenshot.js';

// State type definition
type GraphicsState = {
  gridSizes: GridSizes;
  gridSizesComputed: GridSizes;
  cameraAngle: number;
  isGridSizeLocked: boolean;
  isScreenshotReady: boolean;
};

// Initial state
const defaultInitialState: GraphicsState = {
  gridSizes: { smallSize: 1, largeSize: 10 },
  gridSizesComputed: { smallSize: 1, largeSize: 10 },
  cameraAngle: 60,
  isGridSizeLocked: false,
  isScreenshotReady: false,
};

// Action types
type GraphicsAction =
  | { type: 'UPDATE_GRID_SIZE'; payload: GridSizes }
  | { type: 'SET_CAMERA_ANGLE'; payload: number }
  | { type: 'SET_GRID_SIZE_LOCKED'; payload: boolean }
  | { type: 'SET_SCREENSHOT_READY'; payload: boolean };

// Add explicit return type to ensure complete coverage
function graphicsReducer(state: GraphicsState, action: GraphicsAction): GraphicsState {
  switch (action.type) {
    case 'UPDATE_GRID_SIZE': {
      if (state.isGridSizeLocked) {
        // Don't update the grid sizes if it's locked, just store it for later restoration
        return { ...state, gridSizesComputed: action.payload };
      }

      return { ...state, gridSizes: action.payload, gridSizesComputed: action.payload };
    }

    case 'SET_CAMERA_ANGLE': {
      return { ...state, cameraAngle: action.payload };
    }

    case 'SET_GRID_SIZE_LOCKED': {
      return {
        ...state,
        // Assign the current grid size from gridSizesComputed state
        gridSizes: state.gridSizesComputed,
        isGridSizeLocked: action.payload,
      };
    }

    case 'SET_SCREENSHOT_READY': {
      return { ...state, isScreenshotReady: action.payload };
    }
  }
}

// Type definitions for screenshot functionality
type ScreenshotCapture = (options?: ScreenshotOptions) => string;
type ScreenshotData = {
  capture: ScreenshotCapture;
};

// Create a default screenshot data object
const defaultScreenshotData: ScreenshotData = {
  capture: () => '',
};

// Context type with functions instead of dispatch
type GraphicsContextType = {
  // State
  gridSizes: GridSizes;
  cameraAngle: number;
  isGridSizeLocked: boolean;

  // Methods
  setGridSizes: (sizes: GridSizes) => void;
  setCameraAngle: (angle: number) => void;
  setIsGridSizeLocked: (scale: boolean) => void;

  // Camera reset functionality
  camera: {
    registerReset: (resetFn: () => void) => void;
    reset: () => void;
  };

  // Screenshot capabilities
  screenshot: {
    capture: ScreenshotCapture;
    isReady: boolean;
    registerCapture: (captureMethod: (options?: ScreenshotOptions) => string) => void;
  };
};

// Create context
const GraphicsContext = createContext<GraphicsContextType | undefined>(undefined);

// Provider props type
type GraphicsProviderProps = {
  readonly children: ReactNode;
  readonly defaultCameraAngle?: number;
};

// Provider component
export function GraphicsProvider({ children, defaultCameraAngle }: GraphicsProviderProps): JSX.Element {
  // Create initial state with the provided defaultCameraAngle
  const initialState: GraphicsState = {
    ...defaultInitialState,
    cameraAngle: defaultCameraAngle ?? defaultInitialState.cameraAngle,
  };

  const [state, dispatch] = useReducer(graphicsReducer, initialState);

  // Remove stageRef and add resetCameraFn state
  const resetCameraRef = useRef<(() => void) | undefined>(undefined);

  // Reference to store screenshot methods
  const screenshotRef = useRef<ScreenshotData>(defaultScreenshotData);

  // Method to update grid sizes
  const setGridSizes = (sizes: GridSizes) => {
    dispatch({ type: 'UPDATE_GRID_SIZE', payload: sizes });
  };

  // Camera angle setter
  const setCameraAngle = (angle: number) => {
    dispatch({ type: 'SET_CAMERA_ANGLE', payload: angle });
  };

  // Set fixed scale method
  const setIsGridSizeLocked = (scale: boolean) => {
    dispatch({ type: 'SET_GRID_SIZE_LOCKED', payload: scale });
  };

  // Method to register screenshot capture capability
  const registerScreenshotCapture = useCallback(
    (captureMethod: (options?: ScreenshotOptions) => string) => {
      screenshotRef.current = {
        capture: captureMethod,
      };
      dispatch({ type: 'SET_SCREENSHOT_READY', payload: true });
    },
    [dispatch],
  );

  // Create context value with useMemo for performance
  const value = useMemo(
    () => ({
      // State
      gridSizes: state.gridSizes,
      cameraAngle: state.cameraAngle,
      isGridSizeLocked: state.isGridSizeLocked,

      // Methods
      setGridSizes,
      setCameraAngle,
      setIsGridSizeLocked,

      // Camera reset
      camera: {
        registerReset(resetFn: () => void) {
          resetCameraRef.current = resetFn;
        },
        reset() {
          resetCameraRef.current?.();
        },
      },

      // Screenshot capabilities
      screenshot: {
        capture: screenshotRef.current.capture,
        isReady: state.isScreenshotReady,
        registerCapture: registerScreenshotCapture,
      },
    }),
    [state.gridSizes, state.cameraAngle, state.isGridSizeLocked, state.isScreenshotReady, registerScreenshotCapture],
  );

  return <GraphicsContext.Provider value={value}>{children}</GraphicsContext.Provider>;
}

// Custom hook for using the context
export function useGraphics(): GraphicsContextType {
  const context = useContext(GraphicsContext);
  if (context === undefined) {
    return {
      gridSizes: { smallSize: 1, largeSize: 10 },
      cameraAngle: 60,
      isGridSizeLocked: false,
      /* eslint-disable @typescript-eslint/no-empty-function -- empty state */
      setGridSizes() {},
      setCameraAngle() {},
      setIsGridSizeLocked() {},
      camera: { registerReset() {}, reset() {} },
      screenshot: { capture: () => '', isReady: false, registerCapture() {} },
      /* eslint-enable @typescript-eslint/no-empty-function -- renabling */
    };
  }

  return context;
}
