import type { ThreeElement, ThreeElements } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';
import type { ForwardRefComponent } from '@react-three/drei/helpers/ts-utils.js';
import type {
  TransformControlsAxis,
  TransformControlsMode,
} from '#components/geometry/graphics/three/controls/transform-controls.js';
import {
  TransformControls as TransformControlsImpl,
  isTransformControlsAxis,
} from '#components/geometry/graphics/three/controls/transform-controls.js';
import { useCameraRetarget, useCameraRig } from '#hooks/use-graphics.js';

type ControlsProto = {
  enabled: boolean;
};

function isTransformControlsDomElement(value: unknown): value is HTMLElement {
  return (
    typeof value === 'object' &&
    value !== null &&
    'addEventListener' in value &&
    typeof value.addEventListener === 'function' &&
    'removeEventListener' in value &&
    typeof value.removeEventListener === 'function' &&
    'ownerDocument' in value
  );
}

export type TransformControlsProps = Omit<ThreeElement<typeof TransformControlsImpl>, 'ref' | 'args' | 'object'> &
  Omit<ThreeElements['group'], 'ref'> & {
    readonly object?: THREE.Object3D | React.RefObject<THREE.Object3D | undefined>;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
    readonly enabled?: boolean;
    readonly axis?: TransformControlsAxis | undefined;
    readonly highlightAxis?: string | undefined;
    readonly domElement?: HTMLElement;
    readonly mode?: TransformControlsMode;
    readonly translationSnap?: number | undefined;
    readonly rotationSnap?: number | undefined;
    readonly scaleSnap?: number | undefined;
    readonly space?: 'world' | 'local';
    readonly size?: number;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
    readonly showX?: boolean;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
    readonly showY?: boolean;
    // oxlint-disable-next-line react-js/boolean-prop-naming -- third-party component prop
    readonly showZ?: boolean;
    readonly children?: React.ReactElement<THREE.Object3D>;
    readonly camera?: THREE.Camera;
    readonly onChange?: (event?: THREE.Event) => void;
    readonly onPointerDown?: (event?: THREE.Event) => void;
    readonly onPointerUp?: (event?: THREE.Event) => void;
    readonly onAxisChange?: (axis: TransformControlsAxis | undefined, event?: THREE.Event) => void;
    readonly onObjectChange?: (event?: THREE.Event) => void;
    readonly makeDefault?: boolean;
  };

export const TransformControls: ForwardRefComponent<TransformControlsProps, TransformControlsImpl> =
  /* @__PURE__ */ React.forwardRef<TransformControlsImpl, TransformControlsProps>(
    (
      {
        children,
        domElement,
        onChange,
        onPointerDown,
        onPointerUp,
        onAxisChange,
        onObjectChange,
        object,
        makeDefault,
        camera,
        // Transform
        enabled,
        axis,
        highlightAxis,
        mode,
        translationSnap,
        rotationSnap,
        scaleSnap,
        space,
        size,
        showX,
        showY,
        showZ,
        ...props
      },
      ref,
    ) => {
      const rawControls = useThree((state) => state.controls);
      const defaultControls = rawControls && 'enabled' in rawControls ? (rawControls as ControlsProto) : undefined;
      const gl = useThree((state) => state.gl);
      const events = useThree((state) => state.events);
      const invalidate = useThree((state) => state.invalidate);
      const get = useThree((state) => state.get);
      const set = useThree((state) => state.set);
      const cameraRig = useCameraRig();
      const explCamera = camera ?? cameraRig.activeCamera;
      const explDomElement =
        domElement ?? (isTransformControlsDomElement(events.connected) ? events.connected : gl.domElement);
      const initialCameraRef = React.useRef(explCamera);
      const controls = React.useMemo(
        () => new TransformControlsImpl(initialCameraRef.current, explDomElement),
        [explDomElement],
      );
      const retargetCamera = React.useCallback(
        (activeCamera: THREE.Camera): void => {
          controls.camera = camera ?? activeCamera;
        },
        [camera, controls],
      );
      useCameraRetarget(retargetCamera);
      const group = React.useRef<THREE.Group>(null!);

      React.useLayoutEffect(() => {
        const target = object instanceof THREE.Object3D ? object : object?.current;
        if (target instanceof THREE.Object3D) {
          controls.attach(target);
        } else if (group.current instanceof THREE.Object3D) {
          controls.attach(group.current);
        }

        return () => {
          void controls.detach();
        };
      }, [object, children, controls]);

      React.useEffect(() => {
        if (defaultControls) {
          const callback = (event: { value: unknown }) => {
            if (typeof event.value === 'boolean') {
              defaultControls.enabled = !event.value;
            }
          };

          controls.addEventListener('dragging-changed', callback);
          return () => {
            controls.removeEventListener('dragging-changed', callback);
          };
        }

        return () => {
          // No-op when makeDefault=false.
        };
      }, [controls, defaultControls]);

      const onChangeRef = React.useRef<((event?: THREE.Event) => void) | undefined>(undefined);
      const onPointerDownRef = React.useRef<((event?: THREE.Event) => void) | undefined>(undefined);
      const onPointerUpRef = React.useRef<((event?: THREE.Event) => void) | undefined>(undefined);
      const onAxisChangeRef = React.useRef<
        ((axis: TransformControlsAxis | undefined, event?: THREE.Event) => void) | undefined
      >(undefined);
      const onObjectChangeRef = React.useRef<((event?: THREE.Event) => void) | undefined>(undefined);

      React.useLayoutEffect(() => {
        onChangeRef.current = onChange;
      }, [onChange]);
      React.useLayoutEffect(() => {
        onPointerDownRef.current = onPointerDown;
      }, [onPointerDown]);
      React.useLayoutEffect(() => {
        onPointerUpRef.current = onPointerUp;
      }, [onPointerUp]);
      React.useLayoutEffect(() => {
        onAxisChangeRef.current = onAxisChange;
      }, [onAxisChange]);
      React.useLayoutEffect(() => {
        onObjectChangeRef.current = onObjectChange;
      }, [onObjectChange]);

      React.useLayoutEffect(() => {
        controls.highlightAxis = highlightAxis;
      }, [controls, highlightAxis]);

      React.useEffect(() => {
        const onChange = (event: THREE.Event) => {
          invalidate();
          onChangeRef.current?.(event);
        };

        const onPointerDown = (event: THREE.Event) => onPointerDownRef.current?.(event);
        const onPointerUp = (event: THREE.Event) => onPointerUpRef.current?.(event);
        const onAxisChange = (event: THREE.Event & { value: unknown }) => {
          const axis =
            typeof event.value === 'string' && isTransformControlsAxis(event.value) ? event.value : undefined;
          onAxisChangeRef.current?.(axis, event);
        };
        const onObjectChange = (event: THREE.Event) => onObjectChangeRef.current?.(event);

        controls.addEventListener('change', onChange);
        controls.addEventListener('pointerDown', onPointerDown);
        controls.addEventListener('pointerUp', onPointerUp);
        controls.addEventListener('axis-changed', onAxisChange);
        controls.addEventListener('objectChange', onObjectChange);

        return () => {
          controls.removeEventListener('change', onChange);
          controls.removeEventListener('pointerDown', onPointerDown);
          controls.removeEventListener('pointerUp', onPointerUp);
          controls.removeEventListener('axis-changed', onAxisChange);
          controls.removeEventListener('objectChange', onObjectChange);
        };
      }, [invalidate, controls]);

      React.useEffect(() => {
        if (makeDefault) {
          const old = get().controls;
          set({ controls });
          return () => {
            set({ controls: old });
          };
        }

        return () => {
          // No-op when makeDefault=false.
        };
      }, [makeDefault, controls, get, set]);

      return (
        <>
          <primitive
            ref={ref}
            object={controls}
            enabled={enabled}
            axis={axis}
            highlightAxis={highlightAxis}
            mode={mode}
            translationSnap={translationSnap}
            rotationSnap={rotationSnap}
            scaleSnap={scaleSnap}
            space={space}
            size={size}
            showX={showX}
            showY={showY}
            showZ={showZ}
          />
          <group ref={group} {...props}>
            {children}
          </group>
        </>
      );
    },
  );
