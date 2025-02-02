import React, { useRef, useLayoutEffect, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { BufferGeometry } from 'three';
import * as replicadThreejsHelper from 'replicad-threejs-helper';

export type ReplicadMeshProps = {
  faces: any;
  edges: any;
};

export default React.memo(function ReplicadMesh({ faces, edges }: ReplicadMeshProps) {
  const { invalidate } = useThree();

  const body = useRef(new BufferGeometry());
  const lines = useRef(new BufferGeometry());

  useLayoutEffect(() => {
    // We use the three helpers to synchronise the buffer geometry with the
    // new data from the parameters
    if (faces) replicadThreejsHelper.syncFaces(body.current, faces);

    if (edges) replicadThreejsHelper.syncLines(lines.current, edges);
    else if (faces) replicadThreejsHelper.syncLinesFromFaces(lines.current, body.current);

    // We have configured the canvas to only refresh when there is a change,
    // the invalidate function is here to tell it to recompute
    invalidate();
  }, [faces, edges, invalidate]);

  useEffect(
    () => () => {
      body.current.dispose();
      lines.current.dispose();
      invalidate();
    },
    [invalidate],
  );

  return (
    <group>
      <mesh geometry={body.current}>
        {/* the offsets are here to avoid z fighting between the mesh and the lines */}
        <meshStandardMaterial color="#5a8296" polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={1} />
      </mesh>
      <lineSegments geometry={lines.current}>
        <lineBasicMaterial color="#3c5a6e" />
      </lineSegments>
    </group>
  );
});
