/**
 * Comment pins in the scene: numbered pins standing on model surfaces, and the Comment tool's click.
 *
 * A pin is drawn at a constant screen size along its surface normal, once through the model (faint) and once against
 * it (solid), so it is never lost behind a part. Its numbered head is a DOM element the host draws; this scene reports
 * where each head is when the camera or the pins change. While the tool is on, a click raycasts the model through the
 * clipping-aware BVH path Measure uses and gives the surface to the host.
 *
 * @module
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { EventManager } from '@react-three/fiber';
import { useActorRef } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import { useCommentPins } from '#cad/comment-pins.jsx';
import type { CommentSurfacePick } from '#cad/comment-pins.jsx';
import { useGraphics, useGraphicsSelector, useModelInteractionSelector, useRenderFrame } from '#hooks/use-graphics.jsx';
import { getGraphicsCameraState } from '#graphics/graphics-camera.js';
import { selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { commentInputMachine } from '#machines/comment-input.machine.js';
import { getModelInteractionUnitState } from '#machines/model-interaction.machine.js';
import { createCommentPointerAdapter } from '#graphics/three/react/comment-pins.adapter.js';
import type { CommentPointerAt, CommentSceneHost } from '#graphics/three/react/comment-pins.adapter.js';
import { isFatLineMesh, raycastFirstVisibleMeshHit } from '#graphics/three/utils/bvh-raycast.js';
import { setRaycasterFromCamera } from '#graphics/three/utils/raycaster-from-camera.js';
import { resolveSectionViewRaycastClip } from '#graphics/three/use-section-view.js';
import { getModelComponentIdInHierarchy } from '#graphics/three/utils/model-component-owner.js';
import { hasSceneTagInHierarchy, sceneTag, sceneTagData } from '#graphics/three/utils/scene-tags.js';
import type { SceneTagKey } from '#graphics/three/utils/scene-tags.js';

type GraphicsActorRef = ActorRefFrom<typeof graphicsMachine>;

/** Screen-space pin geometry, in CSS pixels. */
const stemLength = 26;
const stemRadius = 1;
const footRadius = 5;

/**
 * The mark-up ink and its casing, as the `--markup-ink` token gives them to the DOM. A Three material takes a colour
 * value, and a pin must read the same on every theme and material, so the scene keeps them fixed.
 */
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the scene's copy of the `--markup-ink` token (charter D10).
const markupInk = '#d6249f';
// oxlint-disable-next-line tau-lint/no-hardcoded-color -- the casing that keeps the ink legible on any material.
const markupCasing = '#ffffff';

/** What a click passes through: the tool's own marks, section helpers and presentation batches. */
const unpickableTags = new Set<SceneTagKey>([
  sceneTag.measurementUi,
  sceneTag.sectionViewHelper,
  sceneTag.gltfSurfacePresentation,
]);

const yAxis = new THREE.Vector3(0, 1, 0);
const scratch = {
  point: new THREE.Vector3(),
  head: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  ndc: new THREE.Vector2(),
  raycaster: new THREE.Raycaster(),
};

const selectGraphicsContext = (graphics: GraphicsActorRef) => graphics.getSnapshot().context;

/** World units per CSS pixel at `point` for the camera. */
const worldPerPixel = (camera: THREE.Camera, point: THREE.Vector3, height: number): number => {
  if (camera instanceof THREE.OrthographicCamera) {
    return (camera.top - camera.bottom) / camera.zoom / height;
  }
  if (camera instanceof THREE.PerspectiveCamera) {
    const distance = camera.position.distanceTo(point);
    return (2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) / camera.zoom / height;
  }
  return 1;
};

type PinResources = Readonly<{
  foot: THREE.CylinderGeometry;
  footInk: THREE.CylinderGeometry;
  stemCasing: THREE.CylinderGeometry;
  stem: THREE.CylinderGeometry;
  /** Per pass: drawn through the model (faint), then against it (solid). */
  passes: ReadonlyArray<Readonly<{ casing: THREE.MeshBasicMaterial; ink: THREE.MeshBasicMaterial; order: number }>>;
  dispose: () => void;
}>;

const createPinResources = (opacity: number): PinResources => {
  const material = (color: string, alpha: number, depthTest: boolean): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: alpha, depthTest, depthWrite: false });
  const foot = new THREE.CylinderGeometry(footRadius, footRadius, 0.8, 32);
  const footInk = new THREE.CylinderGeometry(footRadius - 1.5, footRadius - 1.5, 0.8, 32);
  const stemCasing = new THREE.CylinderGeometry(stemRadius + 1, stemRadius + 1, stemLength, 12);
  const stem = new THREE.CylinderGeometry(stemRadius, stemRadius, stemLength, 12);
  const passes = [
    { alpha: 0.28 * opacity, depthTest: false, order: 20 },
    { alpha: opacity, depthTest: true, order: 22 },
  ].map(({ alpha, depthTest, order }) => ({
    casing: material(markupCasing, alpha, depthTest),
    ink: material(markupInk, alpha, depthTest),
    order,
  }));
  return {
    foot,
    footInk,
    stemCasing,
    stem,
    passes,
    dispose() {
      for (const geometry of [foot, footInk, stemCasing, stem]) {
        geometry.dispose();
      }
      for (const pass of passes) {
        pass.casing.dispose();
        pass.ink.dispose();
      }
    },
  };
};

/** One pin's meshes, in pixels along +Y: the group that holds them is scaled to the screen and turned to the normal. */
function PinMeshes({ resources }: { readonly resources: PinResources }): React.JSX.Element {
  return (
    <>
      {resources.passes.map((pass) => (
        <group key={pass.order}>
          {/* Foot: a disc lying in the surface, so the pin reads as planted and shows the surface's tilt. */}
          <mesh
            dispose={null}
            geometry={resources.foot}
            material={pass.casing}
            position={[0, 0.4, 0]}
            renderOrder={pass.order}
          />
          <mesh
            dispose={null}
            geometry={resources.footInk}
            material={pass.ink}
            position={[0, 0.9, 0]}
            renderOrder={pass.order + 1}
          />
          {/* Stem: along the surface normal, cased so it stays legible on any material. */}
          <mesh
            dispose={null}
            geometry={resources.stemCasing}
            material={pass.casing}
            position={[0, stemLength / 2, 0]}
            renderOrder={pass.order}
          />
          <mesh
            dispose={null}
            geometry={resources.stem}
            material={pass.ink}
            position={[0, stemLength / 2, 0]}
            renderOrder={pass.order + 1}
          />
        </group>
      ))}
    </>
  );
}

type SurfaceHit = Readonly<{ point: THREE.Vector3; normal: THREE.Vector3; componentId: string | undefined }>;
type PickResult = Readonly<{ hit?: SurfaceHit; whenReady?: Promise<void> }>;

/**
 * The Comment tool's session for one surface: the comment input and the DOM adapter it invokes.
 *
 * @param props - The surface, the view's graphics actor and the scene's host functions.
 * @returns Nothing: the session renders nothing itself.
 */
function CommentSession({
  surface,
  graphics,
  host,
}: Readonly<{
  surface: HTMLElement;
  graphics: GraphicsActorRef;
  host: Readonly<{ current: CommentSceneHost | undefined }>;
}>): React.ReactNode {
  const logic = useMemo(
    () =>
      commentInputMachine.provide({ actors: { pointer: createCommentPointerAdapter({ surface, graphics, host }) } }),
    [graphics, host, surface],
  );
  useActorRef(logic);
  return null;
}

/**
 * Draws the host's comment pins, and takes clicks while the Comment tool is on.
 *
 * @returns The pins, or nothing when the viewer has no Comment tool.
 */
export function CommentPins(): React.JSX.Element | undefined {
  const comments = useCommentPins();
  const { gl, scene, invalidate } = useThree();
  const getRootState = useThree((state) => state.get);
  const events = useThree((state) => state.events) as EventManager<HTMLElement>;
  // R3F binds pointer events to `eventSource` (the viewer region), which covers the canvas.
  const surface: HTMLElement = events.connected ?? gl.domElement;
  const graphics = useGraphics();
  const renderFrame = useRenderFrame();
  const isActive = useGraphicsSelector((state) => state.context.isCommentActive);
  const geometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const pickableMeshesVersion = useGraphicsSelector((state) => state.context.pickableMeshesVersion);
  const committedSectionCuts = useGraphicsSelector((state) => state.context.committedSectionCuts);
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const unitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const manifest = useModelInteractionSelector((state) =>
    unitId ? getModelInteractionUnitState(state.context, unitId).manifest : undefined,
  );
  const displayRevision = useModelInteractionSelector((state) => state.context.displayRevision);

  const pins = comments?.pins;
  const resources = useMemo(() => ({ pin: createPinResources(1), ghost: createPinResources(0.55) }), []);
  useLayoutEffect(
    () => () => {
      resources.pin.dispose();
      resources.ghost.dispose();
    },
    [resources],
  );

  /** Each pin's place in the render frame: where its group stands and how it is turned. */
  const placed = useMemo(
    () =>
      (pins ?? []).map((pin) => ({
        pin,
        position: toThreeRenderPoint({ renderFrame, pointMeters: [...pin.point] }),
        normal: new THREE.Vector3(...pin.normal).normalize(),
        quaternion: new THREE.Quaternion().setFromUnitVectors(yAxis, new THREE.Vector3(...pin.normal).normalize()),
      })),
    [pins, renderFrame],
  );
  const groups = useRef(new Map<string, THREE.Group>());
  const ghost = useRef<THREE.Group>(null);
  const occluded = useRef(new Map<string, boolean>());

  /** The surface meshes a ray can meet, listed again when the model's meshes change. */
  const meshes = useRef<{ key: string; list: THREE.Mesh[] }>({ key: '', list: [] });
  const pickable = (): THREE.Mesh[] => {
    const key = `${geometryKey}:${pickableMeshesVersion}`;
    if (meshes.current.key !== key) {
      const list: THREE.Mesh[] = [];
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh && !isFatLineMesh(object) && !hasSceneTagInHierarchy(object, unpickableTags)) {
          list.push(object as THREE.Mesh);
        }
      });
      meshes.current = { key, list };
    }
    return meshes.current.list;
  };

  const clipping = (): ReturnType<typeof resolveSectionViewRaycastClip> =>
    resolveSectionViewRaycastClip(selectGraphicsContext(graphics), renderFrame);

  /** The first visible surface under a point of the page. */
  const pickAt = (at: CommentPointerAt): PickResult => {
    const { camera } = getRootState();
    const rect = gl.domElement.getBoundingClientRect();
    scratch.ndc.set(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1);
    const { raycaster } = scratch;
    raycaster.layers.mask = camera.layers.mask;
    setRaycasterFromCamera(raycaster, scratch.ndc, camera);
    const { hit, pending, whenReady } = raycastFirstVisibleMeshHit({
      raycaster,
      meshes: pickable(),
      clipping: clipping(),
    });
    if (pending) {
      // A mesh's pick tree is still building: not known yet, never a miss.
      return whenReady ? { whenReady } : {};
    }
    if (!hit?.face) {
      return {};
    }
    const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    // A back face (inside a section cut) still gets a pin that stands toward the viewer.
    if (normal.dot(raycaster.ray.direction) > 0) {
      normal.negate();
    }
    return { hit: { point: hit.point.clone(), normal, componentId: getModelComponentIdInHierarchy(hit.object) } };
  };

  const toPick = (hit: SurfaceHit): CommentSurfacePick | undefined => {
    const camera = getGraphicsCameraState(graphics);
    if (!camera) {
      return undefined;
    }
    const point = fromThreeRenderPoint({ renderFrame, point: hit.point });
    const label = hit.componentId ? (manifest?.nodesById[hit.componentId]?.name ?? hit.componentId) : undefined;
    return {
      point: [point[0], point[1], point[2]],
      normal: [hit.normal.x, hit.normal.y, hit.normal.z],
      ...(hit.componentId === undefined ? {} : { componentId: hit.componentId }),
      ...(label === undefined ? {} : { componentLabel: label }),
      geometryKey,
      camera,
    };
  };

  const hostRef = useRef<CommentSceneHost | undefined>(undefined);
  const host: CommentSceneHost = {
    hover(at) {
      const group = ghost.current;
      if (!group) {
        return;
      }
      const hit = at === undefined ? undefined : pickAt(at).hit;
      if (hit === undefined) {
        if (group.visible) {
          group.visible = false;
          invalidate();
        }
        return;
      }
      const { camera, size } = getRootState();
      group.position.copy(hit.point);
      group.quaternion.setFromUnitVectors(yAxis, hit.normal);
      group.scale.setScalar(worldPerPixel(camera, hit.point, size.height));
      group.visible = true;
      invalidate();
    },
    click(at) {
      const deliver = (result: PickResult): void => {
        const pick = result.hit === undefined ? undefined : toPick(result.hit);
        if (pick) {
          comments?.onPlace(pick);
        } else {
          comments?.onMiss?.();
        }
      };
      const first = pickAt(at);
      if (first.whenReady === undefined) {
        deliver(first);
        return;
      }
      const { camera } = getRootState();
      const world = camera.matrixWorld.clone();
      const projection = camera.projectionMatrix.clone();
      // async-iife: bootstrap -- a pointer handler cannot await a pick tree still being built off the main thread.
      void (async (): Promise<void> => {
        await first.whenReady;
        const live = getRootState().camera;
        // Moved while it waited: the click's screen position is somewhere else on the model now.
        if (hostRef.current && live.matrixWorld.equals(world) && live.projectionMatrix.equals(projection)) {
          deliver(pickAt(at));
        }
      })();
    },
  };
  useLayoutEffect(() => {
    hostRef.current = host;
    const surface = comments?.heads.surface;
    if (surface) {
      surface.current = {
        pick(at) {
          const { hit } = pickAt(at);
          return hit === undefined ? undefined : toPick(hit);
        },
        hover: host.hover,
      };
    }
    return () => {
      hostRef.current = undefined;
      if (surface) {
        surface.current = undefined;
      }
    };
  });

  /** What the last frame step drew for: the step returns early while every one of these is unchanged. */
  const drawn = useRef({
    camera: undefined as THREE.Camera | undefined,
    world: new THREE.Matrix4(),
    projection: new THREE.Matrix4(),
    width: 0,
    height: 0,
    placed: undefined as typeof placed | undefined,
    sceneKey: '',
    isOcclusionDue: false,
  });
  const cutsKey = useRef({ cuts: committedSectionCuts, version: 0 });
  if (cutsKey.current.cuts !== committedSectionCuts) {
    cutsKey.current = { cuts: committedSectionCuts, version: cutsKey.current.version + 1 };
  }
  const sceneKey = `${geometryKey}:${pickableMeshesVersion}:${displayRevision}:${isSectionViewActive}:${cutsKey.current.version}`;

  useFrame(({ camera, size }) => {
    const heads = comments?.heads;
    if (!heads || placed.length === 0) {
      return;
    }
    const last = drawn.current;
    const isUnchanged =
      last.camera === camera &&
      last.width === size.width &&
      last.height === size.height &&
      last.placed === placed &&
      last.sceneKey === sceneKey &&
      last.world.equals(camera.matrixWorld) &&
      last.projection.equals(camera.projectionMatrix);
    if (isUnchanged && !last.isOcclusionDue) {
      return;
    }
    // Occlusion is a raycast per pin: taken once the camera rests, in the frame after the last one that moved it.
    const isResting = isUnchanged;
    if (isResting) {
      last.isOcclusionDue = false;
      const list = pickable();
      const clip = clipping();
      const { raycaster } = scratch;
      raycaster.layers.mask = camera.layers.mask;
      for (const { pin, position } of placed) {
        scratch.point.copy(position).project(camera);
        scratch.ndc.set(scratch.point.x, scratch.point.y);
        setRaycasterFromCamera(raycaster, scratch.ndc, camera);
        const { hit } = raycastFirstVisibleMeshHit({ raycaster, meshes: list, clipping: clip });
        const distance = raycaster.ray.origin.distanceTo(position);
        occluded.current.set(pin.id, hit !== undefined && hit.distance < distance - Math.max(1e-6, distance * 1e-3));
      }
    } else {
      last.camera = camera;
      last.world.copy(camera.matrixWorld);
      last.projection.copy(camera.projectionMatrix);
      last.width = size.width;
      last.height = size.height;
      last.placed = placed;
      last.sceneKey = sceneKey;
      last.isOcclusionDue = true;
      invalidate();
    }
    for (const { pin, position, normal } of placed) {
      const scale = worldPerPixel(camera, position, size.height);
      groups.current.get(pin.id)?.scale.setScalar(scale);
      // The head: the stem's far end, projected to the viewer surface for the host's DOM element.
      scratch.head
        .copy(position)
        .addScaledVector(normal, stemLength * scale)
        .project(camera);
      heads.place(pin.id, {
        x: ((scratch.head.x + 1) / 2) * size.width,
        y: ((1 - scratch.head.y) / 2) * size.height,
        isOccluded: occluded.current.get(pin.id) ?? false,
        isOffscreen: scratch.head.z > 1 || scratch.head.z < -1,
      });
    }
  });

  if (!comments) {
    return undefined;
  }
  return (
    <>
      {placed.map(({ pin, position, quaternion }) => (
        <group
          key={pin.id}
          ref={(group) => {
            if (group) {
              groups.current.set(pin.id, group);
            } else {
              groups.current.delete(pin.id);
            }
          }}
          position={position}
          quaternion={quaternion}
          userData={sceneTagData(sceneTag.measurementUi)}
        >
          <PinMeshes resources={resources.pin} />
        </group>
      ))}
      <group ref={ghost} visible={false} userData={sceneTagData(sceneTag.measurementUi)}>
        <PinMeshes resources={resources.ghost} />
      </group>
      {isActive ? <CommentSession surface={surface} graphics={graphics} host={hostRef} /> : null}
    </>
  );
}
