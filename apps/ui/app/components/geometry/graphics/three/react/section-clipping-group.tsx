import * as React from 'react';
import type * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { SectionPiece } from '#components/geometry/graphics/section-cuts.js';
import { installSectionClipUnder } from '#components/geometry/graphics/three/react/section-view.utils.js';
import { getSectionClip, writeSectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import type { SectionClip } from '#components/geometry/graphics/three/materials/section-clip.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

export type SectionClippingGroupProperties = Readonly<{
  /** The pieces to remove, in the render frame; empty when nothing is cut. */
  pieces: readonly SectionPiece[];
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  children: React.ReactNode;
}>;

/** This viewer's section clip, shared by the model and the emphasis overlay. */
export function useSectionClip(): SectionClip {
  const scene = useThree((state) => state.scene);
  const backend = useThreeGraphicsBackend();
  return React.useMemo(() => getSectionClip(scene, backend), [backend, scene]);
}

/**
 * The section clip around the model: writes the pieces into the clip's uniforms. A cut step writes uniforms only; no
 * material, program or array changes.
 *
 * The model compiles the clip into its materials as it loads, before its pipelines warm up. When the children change,
 * this group compiles it into whatever they hold that lacks it.
 */
export function SectionClippingGroup({ pieces, innerRef, children }: SectionClippingGroupProperties): React.ReactNode {
  const clip = useSectionClip();
  const invalidate = useThree((state) => state.invalidate);
  const writtenRef = React.useRef<Readonly<{ clip: SectionClip; pieces: readonly SectionPiece[] }> | undefined>(
    undefined,
  );

  React.useLayoutEffect(() => {
    if (!innerRef.current || children === undefined || children === null) {
      return;
    }
    installSectionClipUnder(innerRef.current, clip);
  }, [children, clip, innerRef]);

  // Pieces are immutable values, so their identity is their key.
  useFrame(() => {
    if (writtenRef.current?.clip === clip && writtenRef.current.pieces === pieces) {
      return;
    }
    writeSectionClip(clip, pieces);
    writtenRef.current = { clip, pieces };
  });

  // A changed list is written as it commits and a frame is asked for, so a demand loop that is idle, as when Section
  // turns off, still draws it. The frame loop's write then finds it written.
  React.useLayoutEffect(() => {
    writeSectionClip(clip, pieces);
    writtenRef.current = { clip, pieces };
    invalidate();
  }, [clip, invalidate, pieces]);

  return children;
}
