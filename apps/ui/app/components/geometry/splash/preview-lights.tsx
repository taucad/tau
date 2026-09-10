import { Environment, Lightformer } from '@react-three/drei';

type PreviewLightsProperties = {
  /**
   * The accent color for the point light.
   * @default '#14b8a6' (primary/teal)
   */
  readonly accentColor?: string;
};

const environmentResolution = 256;
const environmentKeyIntensity = 3;
const environmentFillIntensity = 1;

/**
 * Premium lighting setup for preview/showcase scenarios.
 *
 * Features:
 * - Brighter ambient light for overall illumination
 * - Front key light for visibility
 * - Top-right fill light with shadows
 * - Back-left rim light for depth
 * - Accent point light with primary color
 * - Environment map for realistic reflections
 */
export function PreviewLights({
  // oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js light color
  accentColor = '#14b8a6',
}: PreviewLightsProperties): React.JSX.Element {
  return (
    <>
      {/* Brighter ambient for overall illumination */}
      <ambientLight intensity={0.6} />

      {/* Front light - key light for visibility */}
      <directionalLight intensity={1.2} position={[0, 0, 5]} />

      {/* Top-right fill light with shadows */}
      <directionalLight castShadow intensity={0.8} position={[5, 5, 5]} />

      {/* Back-left rim light for depth */}
      <directionalLight intensity={0.4} position={[-3, -3, 2]} />

      {/* Accent light with primary color */}
      <pointLight color={accentColor} intensity={0.4} position={[0, 0, 3]} />

      {/* Procedural environment keeps reflections available without a network-fetched HDR preset. */}
      <Environment resolution={environmentResolution}>
        <Lightformer
          form='rect'
          intensity={environmentKeyIntensity}
          position={[8, 10, 10]}
          rotation={[Math.PI / 4, -Math.PI / 4, 0]}
          scale={[16, 16, 1]}
        />
        <Lightformer
          form='rect'
          intensity={environmentFillIntensity}
          position={[-8, -4, 8]}
          rotation={[-Math.PI / 6, Math.PI / 3, 0]}
          scale={[12, 12, 1]}
        />
      </Environment>
    </>
  );
}
