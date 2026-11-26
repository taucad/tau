/**
 * SPIKE (chat pointers design): comment pins anchored to model surfaces.
 *
 * Proves the viewer half of the design: a click raycasts the model through the same BVH path Measure uses, the pin
 * stands along the surface normal, keeps a constant screen size, follows the camera, and reports where its head sits
 * so a DOM button can be the accessible, crisp numbered head. Not production code: state lives in the spike store.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { addAfterEffect, useFrame, useThree } from '@react-three/fiber';
import type { EventManager } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import { commentPinsStore, pinsInScope, useCommentPins } from '#cad/comment-pins.store.js';
import type { CommentPin, CommentPinView, CommentSurfacePick } from '#cad/comment-pins.store.js';
import { useGraphics, useGraphicsSelector, useModelInteractionSelector, useRenderFrame } from '#hooks/use-graphics.jsx';
import { selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { raycastFirstVisibleMeshHit, isFatLineMesh } from '#graphics/three/utils/bvh-raycast.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';
import { resolveSectionViewRaycastClip } from '#graphics/three/use-section-view.js';
import { getModelComponentIdInHierarchy } from '#graphics/three/utils/model-component-owner.js';
import { getGltfOccurrenceLayers } from '#graphics/three/utils/gltf-surface-batches.js';
import { sceneTag, sceneTagData, hasSceneTagInHierarchy } from '#graphics/three/utils/scene-tags.js';
import type { SceneTagKey } from '#graphics/three/utils/scene-tags.js';

/** Screen-space pin geometry, in CSS pixels. */
const stemLengthPx = 26;
const stemRadiusPx = 1;
const baseRadiusPx = 5;
/** A press that moves farther than this is an orbit, not a pin. */
const clickSlopPx = 4;

const blockingTags = new Set<SceneTagKey>([
  sceneTag.measurementUi,
  sceneTag.sectionViewHelper,
  sceneTag.gltfSurfacePresentation,
]);
const up = new THREE.Vector3(0, 1, 0);

type SurfaceHit = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  componentId: string | undefined;
};

/** World units per CSS pixel at `point` for the active camera. */
function worldPerPixel(camera: THREE.Camera, point: THREE.Vector3, heightPx: number): number {
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / heightPx;
  }
  const perspective = camera as THREE.PerspectiveCamera;
  const distance = camera.position.distanceTo(point);
  return (2 * distance * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)) / perspective.zoom / heightPx;
}

/** The vertical field of view in degrees with the camera's zoom folded in. */
function effectiveFieldOfView(camera: THREE.PerspectiveCamera): number {
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / camera.zoom));
}

function PinMarker({
  pin,
  number,
  variant,
}: {
  readonly pin: Pick<CommentPin, 'id' | 'renderPoint' | 'renderNormal'>;
  readonly number: number;
  readonly variant: 'draft' | 'ghost' | 'history';
}): React.JSX.Element {
  const groupRef = useRef<THREE.Group>(null);
  const size = useThree((state) => state.size);
  const point = useMemo(() => new THREE.Vector3(...pin.renderPoint), [pin.renderPoint]);
  const normal = useMemo(() => new THREE.Vector3(...pin.renderNormal).normalize(), [pin.renderNormal]);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(up, normal), [normal]);
  const scratch = useMemo(() => ({ head: new THREE.Vector3(), ray: new THREE.Raycaster() }), []);
  const opacity = variant === 'draft' ? 1 : 0.55;

  useFrame(({ camera, scene }) => {
    const group = groupRef.current;
    if (!group) {
      return;
    }
    const scale = worldPerPixel(camera, point, size.height);
    group.scale.setScalar(scale);
    if (variant === 'ghost') {
      return;
    }
    // The head: the stem's far end, projected to the viewer surface for the DOM button.
    scratch.head.copy(point).addScaledVector(normal, stemLengthPx * scale);
    const projected = scratch.head.clone().project(camera);
    // Occlusion: something nearer than the surface point along the eye ray hides the pin's foot.
    const toPoint = point.clone().project(camera);
    setRaycasterFromCamera(scratch.ray, new THREE.Vector2(toPoint.x, toPoint.y), camera);
    const meshes: THREE.Mesh[] = [];
    scene.traverseVisible((object) => {
      if (object instanceof THREE.Mesh && !isFatLineMesh(object) && getModelComponentIdInHierarchy(object)) {
        meshes.push(object as THREE.Mesh);
      }
    });
    const { hit } = raycastFirstVisibleMeshHit({ raycaster: scratch.ray, meshes });
    const distance = scratch.ray.ray.origin.distanceTo(point);
    const isOccluded = hit !== undefined && hit.distance < distance - Math.max(1e-6, distance * 1e-4);
    commentPinsStore.placeHead(pin.id, {
      x: ((projected.x + 1) / 2) * size.width,
      y: ((1 - projected.y) / 2) * size.height,
      footX: ((toPoint.x + 1) / 2) * size.width,
      footY: ((1 - toPoint.y) / 2) * size.height,
      isOccluded,
      isBehindCamera: projected.z > 1 || projected.z < -1,
    });
    void number;
  });

  // Two passes: a solid one the model can hide, and a faint one drawn through it so a pin is never lost.
  const passes = [
    { key: 'through', depthTest: false, alpha: 0.28 * opacity, renderOrder: 20 },
    { key: 'solid', depthTest: true, alpha: opacity, renderOrder: 21 },
  ] as const;
  return (
    <group ref={groupRef} position={point} quaternion={quaternion} userData={sceneTagData(sceneTag.measurementUi)}>
      {passes.map((pass) => (
        <group key={pass.key} renderOrder={pass.renderOrder}>
          {/* Foot: a disc lying in the surface, so the pin reads as planted and shows the surface's tilt. */}
          <mesh position={[0, 0.4, 0]} renderOrder={pass.renderOrder}>
            <cylinderGeometry args={[baseRadiusPx, baseRadiusPx, 0.8, 32]} />
            {/* oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material colour; charter maps to the markup token */}
            <meshBasicMaterial
              transparent
              color='#ffffff'
              opacity={pass.alpha}
              depthTest={pass.depthTest}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.9, 0]} renderOrder={pass.renderOrder + 1}>
            <cylinderGeometry args={[baseRadiusPx - 1.5, baseRadiusPx - 1.5, 0.8, 32]} />
            {/* oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material colour */}
            <meshBasicMaterial
              transparent
              color='#d6249f'
              opacity={pass.alpha}
              depthTest={pass.depthTest}
              depthWrite={false}
            />
          </mesh>
          {/* Stem: along the surface normal. White casing under the ink keeps it legible on any material. */}
          <mesh position={[0, stemLengthPx / 2, 0]} renderOrder={pass.renderOrder}>
            <cylinderGeometry args={[stemRadiusPx + 1, stemRadiusPx + 1, stemLengthPx, 12]} />
            {/* oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material colour */}
            <meshBasicMaterial
              transparent
              color='#ffffff'
              opacity={pass.alpha}
              depthTest={pass.depthTest}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, stemLengthPx / 2, 0]} renderOrder={pass.renderOrder + 1}>
            <cylinderGeometry args={[stemRadiusPx, stemRadiusPx, stemLengthPx, 12]} />
            {/* oxlint-disable-next-line tau-lint/no-hardcoded-color -- Three.js material colour */}
            <meshBasicMaterial
              transparent
              color='#d6249f'
              opacity={pass.alpha}
              depthTest={pass.depthTest}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * SPIKE bridge: lets a host capture the live canvas and pick along a ray, standing in for the nanoraster capture and
 * the capture-camera lift the charter specifies.
 *
 * @returns Nothing.
 */
export function CommentSceneBridge(): undefined {
  const { camera, gl, scene, size, invalidate } = useThree();
  const bridgeGeometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const controls = useThree((state) => state.controls);
  const renderFrame = useRenderFrame();
  const graphicsActor = useGraphics();
  const unitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const manifest = useModelInteractionSelector((state) =>
    unitId ? getModelInteractionUnitState(state.context, unitId).manifest : undefined,
  );
  useEffect(() => {
    const toPhysical = (point: THREE.Vector3): [number, number, number] =>
      fromThreeRenderPoint({ renderFrame, point }) as [number, number, number];
    const view = (): CommentPinView & { aspect: number } => {
      const target = new THREE.Vector3();
      if (controls instanceof CameraControlsImpl) {
        controls.getTarget(target);
      }
      const isOrthographic = camera instanceof THREE.OrthographicCamera;
      return {
        position: toPhysical(camera.position),
        target: toPhysical(target),
        up: [camera.up.x, camera.up.y, camera.up.z],
        projection: isOrthographic ? 'orthographic' : 'perspective',
        vertical: isOrthographic
          ? ((camera.top - camera.bottom) / camera.zoom) * renderFrame.metersPerRenderUnit
          : effectiveFieldOfView(camera as THREE.PerspectiveCamera),
        aspect: size.width / size.height,
      };
    };
    commentPinsStore.bridge = {
      view,
      async capture(from) {
        const hidden: THREE.Object3D[] = [];
        scene.traverse((object) => {
          if (object.visible && object.userData[sceneTag.measurementUi]) {
            hidden.push(object);
            object.visible = false;
          }
        });
        const saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
        if (from) {
          camera.position.copy(toThreeRenderPoint({ renderFrame, pointMeters: from.position }));
          camera.up.set(...from.up);
          camera.lookAt(toThreeRenderPoint({ renderFrame, pointMeters: from.target }));
          camera.updateMatrixWorld(true);
        }
        const captured = from ? { ...from, aspect: size.width / size.height } : view();
        // The viewer's own frame, read back right after it is drawn, over an opaque backdrop.
        const dataUrl = await new Promise<string>((resolve) => {
          const stop = addAfterEffect(() => {
            stop();
            const flat = document.createElement('canvas');
            flat.width = gl.domElement.width;
            flat.height = gl.domElement.height;
            const context = flat.getContext('2d')!;
            context.fillStyle = document.documentElement.classList.contains('dark') ? '#171717' : '#ffffff';
            context.fillRect(0, 0, flat.width, flat.height);
            context.drawImage(gl.domElement, 0, 0);
            resolve(flat.toDataURL('image/png'));
          });
          invalidate();
        });
        camera.position.copy(saved.position);
        camera.quaternion.copy(saved.quaternion);
        camera.updateMatrixWorld(true);
        for (const object of hidden) {
          object.visible = true;
        }
        invalidate();
        return { dataUrl, width: gl.domElement.width, height: gl.domElement.height, view: captured };
      },
      pickRay(origin, direction) {
        return pickWith(
          new THREE.Raycaster(
            toThreeRenderPoint({ renderFrame, pointMeters: origin }),
            new THREE.Vector3(...direction).normalize(),
          ),
        );
      },
      pickScreen(x, y) {
        const raycaster = new THREE.Raycaster();
        setRaycasterFromCamera(
          raycaster,
          new THREE.Vector2((x / size.width) * 2 - 1, -(y / size.height) * 2 + 1),
          camera,
        );
        return pickWith(raycaster);
      },
    };
    function pickWith(raycaster: THREE.Raycaster): CommentSurfacePick | undefined {
      {
        const meshes: THREE.Mesh[] = [];
        scene.traverseVisible((object) => {
          if (
            object instanceof THREE.Mesh &&
            !isFatLineMesh(object) &&
            !hasSceneTagInHierarchy(object, blockingTags) &&
            object.userData['measurementFeatures']?.kind !== 'line'
          ) {
            meshes.push(object as THREE.Mesh);
          }
        });
        const clipping = resolveSectionViewRaycastClip(graphicsActor.getSnapshot().context, renderFrame);
        const { hit } = raycastFirstVisibleMeshHit({ raycaster, meshes, clipping });
        if (!hit) {
          return undefined;
        }
        const componentId = getModelComponentIdInHierarchy(hit.object);
        const normal = hit.face
          ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
          : raycaster.ray.direction.clone().negate();
        if (normal.dot(raycaster.ray.direction) > 0) {
          normal.negate();
        }
        return {
          point: toPhysical(hit.point),
          normal: [normal.x, normal.y, normal.z],
          renderPoint: [hit.point.x, hit.point.y, hit.point.z],
          geometryKey: bridgeGeometryKey ?? '',
          componentId,
          componentLabel: componentId ? (manifest?.nodesById[componentId]?.name ?? componentId) : undefined,
        };
      }
    }
    return () => {
      commentPinsStore.bridge = undefined;
    };
  }, [bridgeGeometryKey, camera, controls, gl, graphicsActor, invalidate, manifest, renderFrame, scene, size]);
  return undefined;
}

/**
 * The comment tool's scene half: places pins on click while the tool is on, and draws every pin while any exist.
 *
 * @returns The pins.
 */
export function CommentPins(): React.JSX.Element {
  const { camera, gl, scene, invalidate, size } = useThree();
  const controls = useThree((state) => state.controls);
  const events = useThree((state) => state.events) as EventManager<HTMLElement>;
  const pointerTarget: HTMLElement = events.connected ?? gl.domElement;
  const graphicsActor = useGraphics();
  const renderFrame = useRenderFrame();
  const geometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const unitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const manifest = useModelInteractionSelector((state) =>
    unitId ? getModelInteractionUnitState(state.context, unitId).manifest : undefined,
  );
  const isActive = useCommentPins((state) => state.isActive);
  const scope = useCommentPins((state) => state.scope);
  const allPins = useCommentPins((state) => state.pins);
  const allHistoryPins = useCommentPins((state) => state.historyPins);
  // Only the pins of the model this viewer shows are drawn; an earlier message replaces the draft while it shows.
  const pins = useMemo(() => pinsInScope(allPins, scope), [allPins, scope]);
  const historyPins = useMemo(() => pinsInScope(allHistoryPins, scope), [allHistoryPins, scope]);
  const isHistoryShown = allHistoryPins.length > 0;
  const movingPinId = useCommentPins((state) => state.movingPinId);
  const [ghost, setGhost] = useState<SurfaceHit>();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  const pick = useCallback(
    (clientX: number, clientY: number): SurfaceHit | undefined => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      setRaycasterFromCamera(raycaster, ndc, camera);
      const meshes: THREE.Mesh[] = [];
      scene.traverseVisible((object) => {
        if (
          object instanceof THREE.Mesh &&
          !isFatLineMesh(object) &&
          getGltfOccurrenceLayers(object).test(camera.layers) &&
          !hasSceneTagInHierarchy(object, blockingTags) &&
          object.userData['measurementFeatures']?.kind !== 'line'
        ) {
          meshes.push(object as THREE.Mesh);
        }
      });
      const clipping = resolveSectionViewRaycastClip(graphicsActor.getSnapshot().context, renderFrame);
      const { hit } = raycastFirstVisibleMeshHit({ raycaster, meshes, clipping });
      if (!hit?.face) {
        return undefined;
      }
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
      // A back face (inside a section cut) still gets a pin that stands toward the viewer.
      if (normal.dot(raycaster.ray.direction) > 0) {
        normal.negate();
      }
      return { point: hit.point.clone(), normal, componentId: getModelComponentIdInHierarchy(hit.object) };
    },
    [camera, gl, graphicsActor, raycaster, renderFrame, scene],
  );

  const readView = useCallback((): CommentPinView => {
    const target = new THREE.Vector3();
    if (controls instanceof CameraControlsImpl) {
      controls.getTarget(target);
    }
    const toPhysical = (point: THREE.Vector3): [number, number, number] =>
      fromThreeRenderPoint({ renderFrame, point }) as [number, number, number];
    const isOrthographic = camera instanceof THREE.OrthographicCamera;
    return {
      position: toPhysical(camera.position),
      target: toPhysical(target),
      up: [camera.up.x, camera.up.y, camera.up.z],
      projection: isOrthographic ? 'orthographic' : 'perspective',
      vertical: isOrthographic
        ? ((camera.top - camera.bottom) / camera.zoom) * renderFrame.metersPerRenderUnit
        : effectiveFieldOfView(camera as THREE.PerspectiveCamera),
    };
  }, [camera, controls, renderFrame]);

  // Placing: a primary press that ends where it began is a pin; a drag stays an orbit.
  useEffect(() => {
    if (!isActive && !movingPinId) {
      setGhost(undefined);
      return undefined;
    }
    let press: { x: number; y: number; id: number } | undefined;
    // Pin heads, comment cards and the bar sit over the same surface: a press on them is theirs.
    const isOverUi = (event: PointerEvent): boolean =>
      event.target instanceof Element && event.target.closest('[data-comment-ui]') !== null;
    const onDown = (event: PointerEvent): void => {
      if (event.button === 0 && !isOverUi(event)) {
        press = { x: event.clientX, y: event.clientY, id: event.pointerId };
      }
    };
    const onMove = (event: PointerEvent): void => {
      if (event.pointerType === 'mouse' && event.buttons === 0) {
        setGhost(isOverUi(event) ? undefined : pick(event.clientX, event.clientY));
        invalidate();
      }
    };
    const onUp = (event: PointerEvent): void => {
      const start = press;
      press = undefined;
      if (!start || start.id !== event.pointerId) {
        return;
      }
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > clickSlopPx) {
        return;
      }
      const hit = pick(event.clientX, event.clientY);
      if (!hit) {
        // A click off the model closes the open card; a move in progress keeps waiting for a surface.
        if (!movingPinId) {
          commentPinsStore.openPin(undefined);
        }
        return;
      }
      const toTuple = (vector: THREE.Vector3): [number, number, number] => [vector.x, vector.y, vector.z];
      if (movingPinId) {
        commentPinsStore.movePin(
          movingPinId,
          {
            point: fromThreeRenderPoint({ renderFrame, point: hit.point }) as [number, number, number],
            normal: toTuple(hit.normal),
            renderPoint: toTuple(hit.point),
            renderNormal: toTuple(hit.normal),
            componentId: hit.componentId,
            componentLabel: hit.componentId
              ? (manifest?.nodesById[hit.componentId]?.name ?? hit.componentId)
              : undefined,
            geometryKey,
          },
          readView(),
        );
        commentPinsStore.setMoving(undefined);
        commentPinsStore.openPin(undefined);
        setGhost(undefined);
        invalidate();
        return;
      }
      commentPinsStore.addPin({
        id: `pin_${Math.random().toString(36).slice(2, 10)}`,
        comment: '',
        point: fromThreeRenderPoint({ renderFrame, point: hit.point }) as [number, number, number],
        normal: toTuple(hit.normal),
        renderPoint: toTuple(hit.point),
        renderNormal: toTuple(hit.normal),
        componentId: hit.componentId,
        componentLabel: hit.componentId ? (manifest?.nodesById[hit.componentId]?.name ?? hit.componentId) : undefined,
        geometryKey,
        view: readView(),
      });
      setGhost(undefined);
      invalidate();
    };
    const onLeave = (): void => {
      setGhost(undefined);
      invalidate();
    };
    pointerTarget.addEventListener('pointerdown', onDown);
    pointerTarget.addEventListener('pointermove', onMove);
    pointerTarget.addEventListener('pointerup', onUp);
    pointerTarget.addEventListener('pointerleave', onLeave);
    const previousCursor = pointerTarget.style.cursor;
    pointerTarget.style.cursor = 'crosshair';
    return () => {
      pointerTarget.removeEventListener('pointerdown', onDown);
      pointerTarget.removeEventListener('pointermove', onMove);
      pointerTarget.removeEventListener('pointerup', onUp);
      pointerTarget.removeEventListener('pointerleave', onLeave);
      pointerTarget.style.cursor = previousCursor;
    };
  }, [geometryKey, invalidate, isActive, manifest, movingPinId, pick, pointerTarget, readView]);

  // Returning to a pin's recorded view.
  useEffect(
    () =>
      commentPinsStore.onViewRequest((view) => {
        if (!(controls instanceof CameraControlsImpl)) {
          return;
        }
        const position = toThreeRenderPoint({ renderFrame, pointMeters: view.position });
        const target = toThreeRenderPoint({ renderFrame, pointMeters: view.target });
        void controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, true);
        invalidate();
      }),
    [controls, invalidate, renderFrame],
  );

  useEffect(() => {
    invalidate();
  }, [invalidate, pins, historyPins, size]);

  return (
    <>
      {/* An earlier message's pins replace the draft's while they are shown: one set of numbers at a time. */}
      {(isHistoryShown ? [] : pins).map((pin, index) => (
        <PinMarker key={pin.id} pin={pin} number={index + 1} variant='draft' />
      ))}
      {historyPins.map((pin, index) => (
        <PinMarker key={pin.id} pin={pin} number={index + 1} variant='history' />
      ))}
      {ghost && (isActive || movingPinId) ? (
        <PinMarker
          pin={{
            id: 'ghost',
            renderPoint: [ghost.point.x, ghost.point.y, ghost.point.z],
            renderNormal: [ghost.normal.x, ghost.normal.y, ghost.normal.z],
          }}
          number={pins.length + 1}
          variant='ghost'
        />
      ) : null}
    </>
  );
}
