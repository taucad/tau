import React, { useRef, useLayoutEffect, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { BufferGeometry, EdgesGeometry } from 'three';
import * as THREE from 'three';
import * as r3js from 'replicad-threejs-helper';
import { MatcapMaterial } from '~/components/geometry/graphics/three/matcap-material.js';
import { useColor } from '~/hooks/use-color.js';
import type { Shape3D } from '~/types/cad.types.js';

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

export type ReplicadMeshProperties = {
  readonly faces?: Shape3D['faces'];
  readonly edges?: Shape3D['edges'];
  readonly onFaceClick?: (event: ThreeEvent<MouseEvent>, faceIndex: number) => void;
  readonly selected?: number;
  readonly faceHover?: boolean;
  readonly color?: string;
  readonly opacity?: number;
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
};

export const ReplicadMesh = React.memo(function ({
  faces,
  edges,
  color,
  opacity,
  onFaceClick,
  selected,
  faceHover,
  enableSurfaces = true,
  enableLines = true,
}: ReplicadMeshProperties) {
  const { invalidate } = useThree();
  const colors = useColor();

  const body = useRef(new BufferGeometry());
  const lines = useRef(new BufferGeometry());

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
    if (faces) {
      // Create geometry from OpenSCAD Shape3D faces data
      const positions = new Float32Array(faces.vertices);
      const indices = new Uint32Array(faces.triangles);
      const normals = new Float32Array(faces.normals);

      body.current.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      body.current.setIndex(new THREE.BufferAttribute(indices, 1));
      body.current.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    }

    if (edges?.lines.length) {
      r3js.syncLines(lines.current, edges);
    } else {
      lines.current.clearGroups();
      delete lines.current.userData.edgeGroups;
      lines.current.copy(new EdgesGeometry(body.current, 2));
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
        // Always render the mesh, but control visibility
        // eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter
        visible={enableSurfaces}
        // eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter
        geometry={body.current}
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
      {/* eslint-disable-next-line react/no-unknown-property -- TODO: make Three.js type available for linter */}
      <lineSegments visible={enableLines} geometry={lines.current}>
        <lineBasicMaterial color="#244224" />
      </lineSegments>
    </group>
  );
});
