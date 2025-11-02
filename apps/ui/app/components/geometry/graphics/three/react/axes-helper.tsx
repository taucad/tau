import * as THREE from 'three';
import { Line } from '@react-three/drei';
import React, { Fragment } from 'react';

type CustomAxesHelperProps = {
  /**
   * The size of the axes
   * @default 5000
   */
  readonly size?: number;
  /**
   * The color of the X axis
   * @default 'red'
   */
  readonly xAxisColor?: string;
  /**
   * The color of the Y axis
   * @default 'green'
   */
  readonly yAxisColor?: string;
  /**
   * The color of the Z axis
   * @default 'blue'
   */
  readonly zAxisColor?: string;
  /**
   * The thickness of the axes
   * @default 5
   */
  readonly thickness?: number;
  /**
   * The thickness of the axes when hovered
   * @default 2
   */
  readonly hoverThickness?: number;
};

export function AxesHelper({
  size = 50_000,
  xAxisColor = 'rgb(125, 56, 50)',
  yAxisColor = 'rgb(64, 115, 63)',
  zAxisColor = 'rgb(37, 78, 136)',
  thickness = 1.25,
  hoverThickness = 2,
}: CustomAxesHelperProps): React.JSX.Element {
  const [hoveredAxis, setHoveredAxis] = React.useState<'x' | 'y' | 'z' | undefined>(undefined);

  const axes = React.useMemo(
    () =>
      [
        {
          id: 'x',
          getPoints: () => [
            hoveredAxis === 'x' ? new THREE.Vector3(-size, 0, 0) : new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(size, 0, 0),
          ],
          color: xAxisColor,
        },
        {
          id: 'y',
          getPoints: () => [
            hoveredAxis === 'y' ? new THREE.Vector3(0, -size, 0) : new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, size, 0),
          ],
          color: yAxisColor,
        },
        {
          id: 'z',
          getPoints: () => [
            hoveredAxis === 'z' ? new THREE.Vector3(0, 0, -size) : new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, size),
          ],
          color: zAxisColor,
        },
      ] as const,
    [hoveredAxis, size, xAxisColor, yAxisColor, zAxisColor],
  );

  return (
    <group userData={{ isPreviewOnly: true }}>
      {axes.map((axis) => (
        <Fragment key={axis.id}>
          <Line
            points={axis.getPoints()}
            opacity={0.6}
            // Large render order to ensure the axes are placed on top of all other objects
            renderOrder={Infinity}
            color={axis.color}
            lineWidth={hoveredAxis === axis.id ? hoverThickness : thickness}
          />
          <Line
            transparent
            depthTest={false}
            points={axis.getPoints()}
            opacity={0}
            lineWidth={thickness * 8}
            onPointerOver={() => {
              setHoveredAxis(axis.id);
            }}
            onPointerOut={() => {
              setHoveredAxis(undefined);
            }}
          />
        </Fragment>
      ))}
    </group>
  );
}
