import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { GraphicsBackendPreference } from '#graphics/graphics-settings.js';

/**
 * Developer and experimental switches the viewer reads. Each defaults to off.
 *
 * @public
 */
export type ViewerFeatures = {
  /** Diagnostic overlays, test bridges and console detail for renderer development. */
  readonly tauDebug: boolean;
  /** Mount the WebGPU inspector overlay on WebGPU canvases. */
  readonly webGpuInspector: boolean;
  /** Capture shader compilation stacks on WebGPU canvases. */
  readonly webGpuShaderStacks: boolean;
};

/**
 * What the embedding application tells the viewer about its surroundings: the
 * colour scheme and accent it draws with, the graphics API it prefers and the
 * switches it enables. The viewer reads nothing from cookies, URLs or app
 * stores; an embedder maps its own theme and settings onto this value.
 *
 * @public
 */
export type ViewerEnvironment = {
  /** Light or dark rendering of grid, edges, lights and gizmo. */
  readonly colorScheme: 'light' | 'dark';
  /** Stronger grid and gizmo contrast for high-contrast themes. */
  readonly isHighContrast: boolean;
  /** The accent colour of the gizmo's active faces, as a CSS hex colour. */
  readonly accentColor: string;
  /** The graphics API to use when the device supports it; WebGL otherwise. */
  readonly graphicsBackend: GraphicsBackendPreference;
  /** Developer and experimental switches. */
  readonly features: ViewerFeatures;
  /**
   * Whether the canvas shows its render-loop FPS readout; on unless an
   * embedder that prints no status text (an MCP App card) turns it off.
   */
  readonly showRenderFps?: boolean | undefined;
  /**
   * Whether each WebGL frame stays in the canvas after it is shown, so the
   * embedder can read the live view (an MCP App's capture for the agent).
   * Off by default: keeping the buffer costs a copy per frame.
   */
  readonly readableCanvas?: boolean | undefined;
  /**
   * Debug-only component mounted inside the stage while `features.tauDebug` is
   * on; an application test bridge uses it to drive and observe the section view.
   */
  readonly debugStageBridge?: React.ComponentType<{ readonly isGeometryFramed: boolean }> | undefined;
};

/**
 * The environment a viewer uses when no {@link ViewerEnvironmentProvider} is
 * mounted: light, standard contrast, Tau's default accent, WebGL, no switches.
 *
 * @public
 */
export const defaultViewerEnvironment: ViewerEnvironment = {
  colorScheme: 'light',
  isHighContrast: false,
  accentColor: '#00987c',
  graphicsBackend: 'webgl',
  features: { tauDebug: false, webGpuInspector: false, webGpuShaderStacks: false },
};

const ViewerEnvironmentContext = createContext<ViewerEnvironment>(defaultViewerEnvironment);

/**
 * Provide the viewer's environment to every viewer below it.
 *
 * @param props - The environment and the viewer subtree.
 * @returns The provider.
 *
 * @public
 *
 * @example <caption>Follow a host's dark theme</caption>
 * ```tsx
 * import { ViewerEnvironmentProvider, defaultViewerEnvironment } from '@taucad/viewer/environment/viewer-environment';
 *
 * export const DarkViewer = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
 *   <ViewerEnvironmentProvider value={{ ...defaultViewerEnvironment, colorScheme: 'dark' }}>
 *     {children}
 *   </ViewerEnvironmentProvider>
 * );
 * ```
 */
export function ViewerEnvironmentProvider({
  value,
  children,
}: {
  readonly value: ViewerEnvironment;
  readonly children: ReactNode;
}): React.JSX.Element {
  return <ViewerEnvironmentContext.Provider value={value}>{children}</ViewerEnvironmentContext.Provider>;
}

/**
 * Read the nearest viewer environment, or {@link defaultViewerEnvironment}.
 *
 * @returns The environment.
 *
 * @public
 */
export function useViewerEnvironment(): ViewerEnvironment {
  return useContext(ViewerEnvironmentContext);
}

/**
 * Read one viewer switch.
 *
 * @param feature - The switch to read.
 * @returns Whether the switch is on.
 *
 * @public
 */
export function useViewerFeature(feature: keyof ViewerFeatures): boolean {
  return useContext(ViewerEnvironmentContext).features[feature];
}
