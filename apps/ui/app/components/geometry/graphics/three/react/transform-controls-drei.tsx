import type { ThreeElement, ThreeElements } from '@react-three/fiber';
import { useThree } from '@react-three/fiber';
import * as React from 'react';
import * as THREE from 'three';
import type { ForwardRefComponent } from '@react-three/drei/helpers/ts-utils.js';
import { TransformControls as TransformControlsImpl } from '#components/geometry/graphics/three/controls/transform-controls.js';

type ControlsProto = {
  enabled: boolean;
};

export type TransformControlsProps = Omit<ThreeElement<typeof TransformControlsImpl>, 'ref' | 'args'> &
  Omit<ThreeElements['group'], 'ref'> & {
    readonly object?: THREE.Object3D | React.RefObject<THREE.Object3D>;
    // eslint-disable-next-line react/boolean-prop-naming -- copied verbatim, keeping the same API intentionally here.
    readonly enabled?: boolean;
    readonly axis?: string | undefined;
    readonly domElement?: HTMLElement;
    readonly mode?: 'translate' | 'rotate' | 'scale';
    readonly translationSnap?: number | undefined;
    readonly rotationSnap?: number | undefined;
    readonly scaleSnap?: number | undefined;
    readonly space?: 'world' | 'local';
    readonly size?: number;
    // eslint-disable-next-line react/boolean-prop-naming -- copied verbatim, keeping the same API intentionally here.
    readonly showX?: boolean;
    // eslint-disable-next-line react/boolean-prop-naming -- copied verbatim, keeping the same API intentionally here.
    readonly showY?: boolean;
    // eslint-disable-next-line react/boolean-prop-naming -- copied verbatim, keeping the same API intentionally here.
    readonly showZ?: boolean;
    readonly children?: React.ReactElement<THREE.Object3D>;
    readonly camera?: THREE.Camera;
    readonly onChange?: (event?: THREE.Event) => void;
    readonly onPointerDown?: (event?: THREE.Event) => void;
    readonly onPointerUp?: (event?: THREE.Event) => void;
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
        onObjectChange,
        object,
        makeDefault,
        camera,
        // Transform
        enabled,
        axis,
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
      const defaultControls = useThree((state) => state.controls) as unknown as ControlsProto | undefined;
      const gl = useThree((state) => state.gl);
      const events = useThree((state) => state.events);
      const defaultCamera = useThree((state) => state.camera);
      const invalidate = useThree((state) => state.invalidate);
      const get = useThree((state) => state.get);
      const set = useThree((state) => state.set);
      const explCamera = camera ?? defaultCamera;
      const explDomElement = (domElement ?? events.connected ?? gl.domElement) as HTMLElement;
      const controls = React.useMemo(
        () => new TransformControlsImpl(explCamera, explDomElement),
        [explCamera, explDomElement],
      );
      const group = React.useRef<THREE.Group>(null!);

      React.useLayoutEffect(() => {
        if (object) {
          controls.attach(object instanceof THREE.Object3D ? object : object.current);
        } else if (group.current instanceof THREE.Object3D) {
          controls.attach(group.current);
        }

        return () => {
          void controls.detach();
        };
      }, [object, children, controls]);

      React.useEffect(() => {
        if (defaultControls) {
          const callback = (event: { value: boolean }) => {
            defaultControls.enabled = !event.value;
          };

          // @ts-expect-error -- adding a new event.
          controls.addEventListener('dragging-changed', callback);
          return () => {
            // @ts-expect-error -- adding a new event.
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
        onObjectChangeRef.current = onObjectChange;
      }, [onObjectChange]);

      React.useEffect(() => {
        const onChange = (event: THREE.Event) => {
          invalidate();
          onChangeRef.current?.(event);
        };

        const onPointerDown = (event: THREE.Event) => onPointerDownRef.current?.(event);
        const onPointerUp = (event: THREE.Event) => onPointerUpRef.current?.(event);
        const onObjectChange = (event: THREE.Event) => onObjectChangeRef.current?.(event);

        // @ts-expect-error -- newly added events
        controls.addEventListener('change', onChange);
        // @ts-expect-error -- newly added events
        controls.addEventListener('pointerDown', onPointerDown);
        // @ts-expect-error -- newly added events
        controls.addEventListener('pointerUp', onPointerUp);
        // @ts-expect-error -- newly added events
        controls.addEventListener('objectChange', onObjectChange);

        return () => {
          // @ts-expect-error -- newly added events
          controls.removeEventListener('change', onChange);
          // @ts-expect-error -- newly added events
          controls.removeEventListener('pointerDown', onPointerDown);
          // @ts-expect-error -- newly added events
          controls.removeEventListener('pointerUp', onPointerUp);
          // @ts-expect-error -- newly added events
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
