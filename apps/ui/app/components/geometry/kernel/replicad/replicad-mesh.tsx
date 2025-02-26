import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { BufferGeometry } from 'three';
import * as r3js from 'replicad-threejs-helper';
import { MatcapMaterial } from '@/components/geometry/graphics/three/matcap-material';
import { useColor } from '@/hooks/use-color';

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
    if (!function_.current) return null;
    const faceIndex = r3js.getFaceIndex(event.faceIndex, event.object.geometry);
    function_.current(event, faceIndex);
  }, []);
};

interface ReplicadMeshProperties {
  faces?: any; // Using any for now since we don't have the replicad types
  edges?: any; // Using any for now since we don't have the replicad types
  onFaceClick?: (event: ThreeEvent<MouseEvent>, faceIndex: number) => void;
  selected?: number;
  faceHover?: boolean;
}

export const ReplicadMesh = React.memo(function ShapeMeshes({
  faces,
  edges,
  onFaceClick,
  selected,
  faceHover,
}: ReplicadMeshProperties) {
  const { invalidate } = useThree();
  const color = useColor();

  const body = useRef(new BufferGeometry());
  const lines = useRef(new BufferGeometry());

  const onClick = useFaceEvent(onFaceClick);
  const onHover = (event: ThreeEvent<MouseEvent> | undefined) => {
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
        geometry={body.current}
        onClick={onClick}
        onPointerOver={onHover}
        onPointerMove={onHover}
        onPointerLeave={() => onHover(null)}
      >
        <MatcapMaterial color={color.serialized.hex} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments geometry={lines.current}>
        <lineBasicMaterial color="#244224" />
      </lineSegments>
    </group>
  );
});
