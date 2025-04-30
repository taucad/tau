import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, Vector3 } from 'three';
import * as r3js from 'replicad-threejs-helper';
import { Line } from '@react-three/drei';
import { MatcapMaterial } from '@/components/geometry/graphics/three/matcap-material.js';
import { useColor } from '@/hooks/use-color.js';

export const useApplyHighlights = (geometry: BufferGeometry, highlight: number | number[]) => {
  const { invalidate } = useThree();

  useLayoutEffect(() => {
    let toHighlight = highlight;

    if (!highlight && highlight !== 0) toHighlight = [];
    else if (!Array.isArray(highlight)) toHighlight = [highlight];

    r3js.highlightInGeometry(toHighlight, geometry);
    invalidate();
  }, [geometry, highlight, invalidate]);
};

export const useFaceEvent = (onEvent: (event: ThreeEvent<MouseEvent>, faceIndex: number) => void) => {
  const function_ = useRef(onEvent);
  useLayoutEffect(() => {
    function_.current = onEvent;
  }, [onEvent]);

  return useCallback((event: ThreeEvent<MouseEvent>) => {
    if (!function_.current) return;
    const faceIndex = r3js.getFaceIndex(event.faceIndex, event.object.geometry);
    function_.current(event, faceIndex);
  }, []);
};

type ReplicadMeshProperties = {
  readonly faces?: any; // Using any for now since we don't have the replicad types
  readonly edges?: any; // Using any for now since we don't have the replicad types
  readonly onFaceClick?: (event: ThreeEvent<MouseEvent>, faceIndex: number) => void;
  readonly selected?: number;
  readonly faceHover?: boolean;
  readonly color?: string;
  readonly opacity?: number;
};

export const ReplicadMesh = React.memo(function ({
  faces,
  edges,
  color,
  opacity,
  onFaceClick,
  selected,
  faceHover,
}: ReplicadMeshProperties) {
  const { invalidate } = useThree();
  const colors = useColor();

  const body = useRef(new BufferGeometry());
  const lines = useRef(new BufferGeometry());
  const linePoints = useRef<Vector3[]>([]);

  const onClick = useFaceEvent(onFaceClick);
  const onHover = (event?: ThreeEvent<MouseEvent>) => {
    if (!faceHover) return;
    let toHighlight;
    if (event === undefined) toHighlight = [];
    else {
      const faceIndex = r3js.getFaceIndex(event.faceIndex, event.object.geometry);
      toHighlight = [faceIndex];
    }

    r3js.highlightInGeometry(toHighlight, body.current);
    invalidate();
  };

  useLayoutEffect(() => {
    if (!faceHover && body.current) r3js.highlightInGeometry([], body.current);
  }, [faceHover]);

  useLayoutEffect(() => {
    r3js.highlightInGeometry(selected || selected === 0 ? [selected] : [], body.current);
    invalidate();
  }, [selected, invalidate]);

  useLayoutEffect(() => {
    if (faces) r3js.syncFaces(body.current, faces);

    if (edges) r3js.syncLines(lines.current, edges);
    else if (faces) r3js.syncLinesFromFaces(lines.current, body.current);

    // Convert buffer geometry positions to Vector3 array for Line component
    if (lines.current.attributes.position) {
      const positions = lines.current.attributes.position.array;
      const newPoints: Vector3[] = [];

      // Process position array into Vector3 points
      for (let i = 0; i < positions.length; i += 3) {
        newPoints.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
      }

      // Update points reference
      linePoints.current = newPoints;
    }

    invalidate();
  }, [faces, edges, invalidate]);

  useLayoutEffect(
    () => () => {
      body.current.dispose();
      lines.current.dispose();
      invalidate();
    },
    [invalidate],
  );

  return (
    <group>
      <mesh
        // eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter
        geometry={body.current}
        // eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter
        renderOrder={1}
        onClick={onClick}
        onPointerOver={onHover}
        onPointerMove={onHover}
        onPointerLeave={onHover}
      >
        <MatcapMaterial
          polygonOffset
          color={color ?? colors.serialized.hex}
          opacity={opacity ?? 1}
          transparent={opacity !== 1}
          // The offsets are here to avoid z fighting between the mesh and the lines
          polygonOffsetFactor={2}
          polygonOffsetUnits={1}
        />
      </mesh>
      <Line
        segments
        points={linePoints.current}
        color="#244224"
        lineWidth={1.5}
        // Render order higher than the mesh to avoid z fighting
        // TODO: refine the line rendering to ensure lines are always drawn on top of the mesh. Some angles look bad.
        renderOrder={2}
      />
    </group>
  );
});
