import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry } from 'three';
import * as r3js from 'replicad-threejs-helper';
import { MatcapMaterial } from '@/components/geometry/graphics/three/matcap-material';

export const useApplyHighlights = (geometry, highlight) => {
  const { invalidate } = useThree();

  useLayoutEffect(() => {
    let toHighlight = highlight;

    if (!highlight && highlight !== 0) toHighlight = [];
    else if (!Array.isArray(highlight)) toHighlight = [highlight];

    r3js.highlightInGeometry(toHighlight, geometry);
    invalidate();
  }, [geometry, highlight, invalidate]);
};

export const useFaceEvent = (onEvent) => {
  const function_ = useRef(onEvent);
  useLayoutEffect(() => {
    function_.current = onEvent;
  }, [onEvent]);

  return useCallback((event) => {
    if (!function_.current) return null;
    const faceIndex = r3js.getFaceIndex(event.faceIndex, event.object.geometry);
    function_.current(event, faceIndex);
  }, []);
};

export const ReplicadMesh = React.memo(function ShapeMeshes({ faces, edges, onFaceClick, selected, faceHover }) {
  const { invalidate } = useThree();

  const body = useRef(new BufferGeometry());
  const lines = useRef(new BufferGeometry());

  const onClick = useFaceEvent(onFaceClick);
  const onHover = (e) => {
    if (!faceHover) return;
    let toHighlight;
    if (e === null) toHighlight = [];
    else {
      const faceIndex = r3js.getFaceIndex(e.faceIndex, e.object.geometry);
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
        {/* the offsets are here to avoid z fighting between the mesh and the lines */}
        <MatcapMaterial
          color="#d8e9d8"
          attachArray="material"
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={1}
        />
        <MatcapMaterial
          color="#5a8296"
          attachArray="material"
          polygonOffset
          polygonOffsetFactor={2}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={lines.current}>
        <lineBasicMaterial color="#244224" />
      </lineSegments>
    </group>
  );
});
