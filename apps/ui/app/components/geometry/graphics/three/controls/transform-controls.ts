/* eslint-disable @typescript-eslint/no-unsafe-call -- TODO: fix types here */
/* eslint-disable max-lines -- This is a port of the original transform-controls.ts file */
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- TODO: fix types here */
/* eslint-disable @typescript-eslint/naming-convention -- This is a port of the original transform-controls.ts file  */
/* eslint-disable new-cap -- This is a port of the original transform-controls.ts file  */
/* eslint-disable @typescript-eslint/class-literal-property-style -- This is a port of the original transform-controls.ts file   */
/* eslint-disable max-depth -- This is a port of the original transform-controls.ts file */
/* eslint-disable complexity -- This is a port of the original transform-controls.ts file */
import type { OrthographicCamera, PerspectiveCamera, Intersection, Camera, Vector2 } from 'three';
import {
  Material,
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  MeshMatcapMaterial,
  LineDashedMaterial,
} from 'three';
import arrowSvg from '#components/geometry/graphics/three/icons/translation-arrow.svg?raw';
import doubleArrowSvg from '#components/geometry/graphics/three/icons/translation-double-arrow.svg?raw';
import { SvgGeometry } from '#components/geometry/graphics/three/geometries/svg-geometry.js';
import { matcapMaterial } from '#components/geometry/graphics/three/materials/matcap-material.js';
import { FontGeometry } from '#components/geometry/graphics/three/geometries/font-geometry.js';
import { RoundedRectangleGeometry } from '#components/geometry/graphics/three/geometries/rounded-rectangle-geometry.js';
import { CircleGeometry } from '#components/geometry/graphics/three/geometries/circle-geometry.js';

export type TransformControlsPointerObject = {
  x: number;
  y: number;
  button: number;
};

class TransformControls<TCamera extends Camera = Camera> extends Object3D {
  public readonly isTransformControls = true;

  public override visible = false;

  private domElement: HTMLElement | undefined;

  private readonly raycaster = new Raycaster();

  private gizmo: TransformControlsGizmo;
  private plane: TransformControlsPlane;

  private readonly tempVector = new Vector3();
  private readonly tempVector2 = new Vector3();
  private readonly tempQuaternion = new Quaternion();
  private readonly unit = {
    X: new Vector3(1, 0, 0),
    Y: new Vector3(0, 1, 0),
    Z: new Vector3(0, 0, 1),
  };

  private readonly pointStart = new Vector3();
  private readonly pointEnd = new Vector3();
  private readonly offset = new Vector3();
  private readonly rotationAxis = new Vector3();
  private readonly startNorm = new Vector3();
  private readonly endNorm = new Vector3();
  private rotationAngle = 0;

  private readonly cameraPosition = new Vector3();
  private readonly cameraQuaternion = new Quaternion();
  private readonly cameraScale = new Vector3();

  private readonly parentPosition = new Vector3();
  private readonly parentQuaternion = new Quaternion();
  private readonly parentQuaternionInv = new Quaternion();
  private readonly parentScale = new Vector3();

  private readonly worldPositionStart = new Vector3();
  private readonly worldQuaternionStart = new Quaternion();
  private readonly worldScaleStart = new Vector3();

  private readonly worldPosition = new Vector3();
  private readonly worldQuaternion = new Quaternion();
  private readonly worldQuaternionInv = new Quaternion();
  private readonly worldScale = new Vector3();

  private readonly eye = new Vector3();

  private readonly positionStart = new Vector3();
  private readonly quaternionStart = new Quaternion();
  private readonly scaleStart = new Vector3();

  private readonly camera: TCamera;
  private object: Object3D | undefined;
  private readonly enabled: boolean = true;
  private axis: string | undefined = undefined;
  private mode: 'translate' | 'rotate' | 'scale' = 'translate';
  private translationSnap: number | undefined = undefined;
  private rotationSnap: number | undefined = undefined;
  private scaleSnap: number | undefined = undefined;
  private space = 'world';
  private size = 1;
  private dragging = false;
  private readonly showX = true;
  private readonly showY = true;
  private readonly showZ = true;

  // Events
  private readonly changeEvent = { type: 'change' };
  private readonly mouseDownEvent = { type: 'mouseDown', mode: this.mode };
  private readonly mouseUpEvent = { type: 'mouseUp', mode: this.mode };
  private readonly objectChangeEvent = { type: 'objectChange' };

  public constructor(camera: TCamera, domElement: HTMLElement | undefined) {
    super();

    this.domElement = domElement;
    this.camera = camera;

    this.gizmo = new TransformControlsGizmo();
    this.add(this.gizmo);

    this.plane = new TransformControlsPlane();
    this.add(this.plane);

    // Defined getter, setter and store for a property
    const defineProperty = <TValue>(propName: string, defaultValue: TValue): void => {
      let propValue = defaultValue;

      Object.defineProperty(this, propName, {
        get() {
          return propValue ?? defaultValue;
        },

        set(value) {
          if (propValue !== value) {
            propValue = value;
            this.plane[propName] = value;
            this.gizmo[propName] = value;

            this.dispatchEvent({ type: propName + '-changed', value });
            this.dispatchEvent(this.changeEvent);
          }
        },
      });

      // @ts-expect-error -- custom controls event, needs augmentation
      this[propName] = defaultValue;
      // @ts-expect-error -- custom controls event, needs augmentation
      this.plane[propName] = defaultValue;
      // @ts-expect-error -- custom controls event, needs augmentation
      this.gizmo[propName] = defaultValue;
    };

    defineProperty('camera', this.camera);
    defineProperty('object', this.object);
    defineProperty('enabled', this.enabled);
    defineProperty('axis', this.axis);
    defineProperty('mode', this.mode);
    defineProperty('translationSnap', this.translationSnap);
    defineProperty('rotationSnap', this.rotationSnap);
    defineProperty('scaleSnap', this.scaleSnap);
    defineProperty('space', this.space);
    defineProperty('size', this.size);
    defineProperty('dragging', this.dragging);
    defineProperty('showX', this.showX);
    defineProperty('showY', this.showY);
    defineProperty('showZ', this.showZ);
    defineProperty('worldPosition', this.worldPosition);
    defineProperty('worldPositionStart', this.worldPositionStart);
    defineProperty('worldQuaternion', this.worldQuaternion);
    defineProperty('worldQuaternionStart', this.worldQuaternionStart);
    defineProperty('cameraPosition', this.cameraPosition);
    defineProperty('cameraQuaternion', this.cameraQuaternion);
    defineProperty('pointStart', this.pointStart);
    defineProperty('pointEnd', this.pointEnd);
    defineProperty('rotationAxis', this.rotationAxis);
    defineProperty('rotationAngle', this.rotationAngle);
    defineProperty('eye', this.eye);

    // Connect events
    if (domElement !== undefined) {
      this.connect(domElement);
    }
  }

  // Set current object
  public override attach = (object: Object3D): this => {
    this.object = object;
    this.visible = true;

    return this;
  };

  // Detatch from object
  public detach = (): this => {
    this.object = undefined;
    this.visible = false;
    this.axis = undefined;

    return this;
  };

  // Reset
  public reset = (): this => {
    if (!this.enabled) {
      return this;
    }

    if (this.dragging && this.object !== undefined) {
      this.object.position.copy(this.positionStart);
      this.object.quaternion.copy(this.quaternionStart);
      this.object.scale.copy(this.scaleStart);
      // @ts-expect-error -- custom controls event, needs augmentation
      this.dispatchEvent(this.changeEvent);
      // @ts-expect-error -- custom controls event, needs augmentation
      this.dispatchEvent(this.objectChangeEvent);
      this.pointStart.copy(this.pointEnd);
    }

    return this;
  };

  public override updateMatrixWorld = (): void => {
    if (this.object !== undefined) {
      this.object.updateMatrixWorld();

      if (this.object.parent === null) {
        console.error('TransformControls: The attached 3D object must be a part of the scene graph.');
      } else {
        this.object.parent.matrixWorld.decompose(this.parentPosition, this.parentQuaternion, this.parentScale);
      }

      this.object.matrixWorld.decompose(this.worldPosition, this.worldQuaternion, this.worldScale);

      this.parentQuaternionInv.copy(this.parentQuaternion).invert();
      this.worldQuaternionInv.copy(this.worldQuaternion).invert();
    }

    this.camera.updateMatrixWorld();
    this.camera.matrixWorld.decompose(this.cameraPosition, this.cameraQuaternion, this.cameraScale);

    this.eye.copy(this.cameraPosition).sub(this.worldPosition).normalize();

    super.updateMatrixWorld();
  };

  public getMode = (): TransformControls['mode'] => this.mode;

  public setMode = (mode: TransformControls['mode']): void => {
    this.mode = mode;
  };

  public setTranslationSnap = (translationSnap: number): void => {
    this.translationSnap = translationSnap;
  };

  public setRotationSnap = (rotationSnap: number): void => {
    this.rotationSnap = rotationSnap;
  };

  public setScaleSnap = (scaleSnap: number): void => {
    this.scaleSnap = scaleSnap;
  };

  public setSize = (size: number): void => {
    this.size = size;
  };

  public setSpace = (space: string): void => {
    this.space = space;
  };

  public update = (): void => {
    console.warn(
      'THREE.TransformControls: update function has no more functionality and therefore has been deprecated.',
    );
  };

  public connect = (domElement: HTMLElement): void => {
    if ((domElement as unknown) === document) {
      console.error(
        'THREE.OrbitControls: "document" should not be used as the target "domElement". Please use "renderer.domElement" instead.',
      );
    }

    this.domElement = domElement;

    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerHover);
    this.domElement.ownerDocument.addEventListener('pointerup', this.onPointerUp);
  };

  public dispose = (): void => {
    this.domElement?.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement?.removeEventListener('pointermove', this.onPointerHover);
    this.domElement?.ownerDocument.removeEventListener('pointermove', this.onPointerMove);
    this.domElement?.ownerDocument.removeEventListener('pointerup', this.onPointerUp);

    this.traverse((child) => {
      const mesh = child as Mesh<BufferGeometry, Material>;
      if (mesh.geometry instanceof BufferGeometry) {
        mesh.geometry.dispose();
      }

      if (mesh.material instanceof Material) {
        mesh.material.dispose();
      }
    });
  };

  private readonly intersectObjectWithRay = (
    object: Object3D,
    raycaster: Raycaster,
    includeInvisible?: boolean,
  ): false | Intersection => {
    const allIntersections = raycaster.intersectObject(object, true);

    for (const allIntersection of allIntersections) {
      if (allIntersection.object.visible || includeInvisible) {
        return allIntersection;
      }
    }

    return false;
  };

  private readonly pointerHover = (pointer: TransformControlsPointerObject): void => {
    if (this.object === undefined || this.dragging) {
      return;
    }

    this.raycaster.setFromCamera(pointer as unknown as Vector2, this.camera);

    const intersect = this.intersectObjectWithRay(this.gizmo.picker[this.mode], this.raycaster);

    this.axis = intersect ? intersect.object.name : undefined;
  };

  private readonly pointerDown = (pointer: TransformControlsPointerObject): void => {
    if (this.object === undefined || this.dragging || pointer.button !== 0) {
      return;
    }

    if (this.axis !== undefined) {
      this.raycaster.setFromCamera(pointer as unknown as Vector2, this.camera);

      const planeIntersect = this.intersectObjectWithRay(this.plane, this.raycaster, true);

      if (planeIntersect) {
        let { space } = this;

        if (this.mode === 'scale') {
          space = 'local';
        } else if (this.axis === 'E' || this.axis === 'XYZE' || this.axis === 'XYZ') {
          space = 'world';
        }

        if (space === 'local' && this.mode === 'rotate') {
          const snap = this.rotationSnap;

          if (this.axis === 'X' && snap) {
            this.object.rotation.x = Math.round(this.object.rotation.x / snap) * snap;
          }

          if (this.axis === 'Y' && snap) {
            this.object.rotation.y = Math.round(this.object.rotation.y / snap) * snap;
          }

          if (this.axis === 'Z' && snap) {
            this.object.rotation.z = Math.round(this.object.rotation.z / snap) * snap;
          }
        }

        this.object.updateMatrixWorld();

        if (this.object.parent) {
          this.object.parent.updateMatrixWorld();
        }

        this.positionStart.copy(this.object.position);
        this.quaternionStart.copy(this.object.quaternion);
        this.scaleStart.copy(this.object.scale);

        this.object.matrixWorld.decompose(this.worldPositionStart, this.worldQuaternionStart, this.worldScaleStart);

        this.pointStart.copy(planeIntersect.point).sub(this.worldPositionStart);
      }

      this.dragging = true;
      this.mouseDownEvent.mode = this.mode;
      // @ts-expect-error -- custom controls event, needs augmentation
      this.dispatchEvent(this.mouseDownEvent);
    }
  };

  private readonly pointerMove = (pointer: TransformControlsPointerObject): void => {
    const { axis } = this;
    const { mode } = this;
    const { object } = this;
    let { space } = this;

    if (mode === 'scale') {
      space = 'local';
    } else if (axis === 'E' || axis === 'XYZE' || axis === 'XYZ') {
      space = 'world';
    }

    if (object === undefined || axis === undefined || !this.dragging || pointer.button !== -1) {
      return;
    }

    this.raycaster.setFromCamera(pointer as unknown as Vector2, this.camera);

    const planeIntersect = this.intersectObjectWithRay(this.plane, this.raycaster, true);

    if (!planeIntersect) {
      return;
    }

    this.pointEnd.copy(planeIntersect.point).sub(this.worldPositionStart);

    switch (mode) {
      case 'translate': {
        // Apply translate

        this.offset.copy(this.pointEnd).sub(this.pointStart);

        if (space === 'local' && axis !== 'XYZ') {
          this.offset.applyQuaternion(this.worldQuaternionInv);
        }

        if (!axis.includes('X')) {
          this.offset.x = 0;
        }

        if (!axis.includes('Y')) {
          this.offset.y = 0;
        }

        if (!axis.includes('Z')) {
          this.offset.z = 0;
        }

        if (space === 'local' && axis !== 'XYZ') {
          this.offset.applyQuaternion(this.quaternionStart).divide(this.parentScale);
        } else {
          this.offset.applyQuaternion(this.parentQuaternionInv).divide(this.parentScale);
        }

        object.position.copy(this.offset).add(this.positionStart);

        // Apply translation snap

        if (this.translationSnap) {
          if (space === 'local') {
            object.position.applyQuaternion(this.tempQuaternion.copy(this.quaternionStart).invert());

            if (axis.search('X') !== -1) {
              object.position.x = Math.round(object.position.x / this.translationSnap) * this.translationSnap;
            }

            if (axis.search('Y') !== -1) {
              object.position.y = Math.round(object.position.y / this.translationSnap) * this.translationSnap;
            }

            if (axis.search('Z') !== -1) {
              object.position.z = Math.round(object.position.z / this.translationSnap) * this.translationSnap;
            }

            object.position.applyQuaternion(this.quaternionStart);
          }

          if (space === 'world') {
            if (object.parent) {
              object.position.add(this.tempVector.setFromMatrixPosition(object.parent.matrixWorld));
            }

            if (axis.search('X') !== -1) {
              object.position.x = Math.round(object.position.x / this.translationSnap) * this.translationSnap;
            }

            if (axis.search('Y') !== -1) {
              object.position.y = Math.round(object.position.y / this.translationSnap) * this.translationSnap;
            }

            if (axis.search('Z') !== -1) {
              object.position.z = Math.round(object.position.z / this.translationSnap) * this.translationSnap;
            }

            if (object.parent) {
              object.position.sub(this.tempVector.setFromMatrixPosition(object.parent.matrixWorld));
            }
          }
        }

        break;
      }

      case 'scale': {
        if (axis.search('XYZ') === -1) {
          this.tempVector.copy(this.pointStart);
          this.tempVector2.copy(this.pointEnd);

          this.tempVector.applyQuaternion(this.worldQuaternionInv);
          this.tempVector2.applyQuaternion(this.worldQuaternionInv);

          this.tempVector2.divide(this.tempVector);

          if (axis.search('X') === -1) {
            this.tempVector2.x = 1;
          }

          if (axis.search('Y') === -1) {
            this.tempVector2.y = 1;
          }

          if (axis.search('Z') === -1) {
            this.tempVector2.z = 1;
          }
        } else {
          let d = this.pointEnd.length() / this.pointStart.length();

          if (this.pointEnd.dot(this.pointStart) < 0) {
            d *= -1;
          }

          this.tempVector2.set(d, d, d);
        }

        // Apply scale

        object.scale.copy(this.scaleStart).multiply(this.tempVector2);

        if (this.scaleSnap && this.object) {
          if (axis.search('X') !== -1) {
            this.object.scale.x = Math.round(object.scale.x / this.scaleSnap) * this.scaleSnap || this.scaleSnap;
          }

          if (axis.search('Y') !== -1) {
            object.scale.y = Math.round(object.scale.y / this.scaleSnap) * this.scaleSnap || this.scaleSnap;
          }

          if (axis.search('Z') !== -1) {
            object.scale.z = Math.round(object.scale.z / this.scaleSnap) * this.scaleSnap || this.scaleSnap;
          }
        }

        break;
      }

      case 'rotate': {
        this.offset.copy(this.pointEnd).sub(this.pointStart);

        const ROTATION_SPEED =
          20 / this.worldPosition.distanceTo(this.tempVector.setFromMatrixPosition(this.camera.matrixWorld));

        switch (axis) {
          case 'E': {
            this.rotationAxis.copy(this.eye);
            this.rotationAngle = this.pointEnd.angleTo(this.pointStart);

            this.startNorm.copy(this.pointStart).normalize();
            this.endNorm.copy(this.pointEnd).normalize();

            this.rotationAngle *= this.endNorm.cross(this.startNorm).dot(this.eye) < 0 ? 1 : -1;

            break;
          }

          case 'XYZE': {
            this.rotationAxis.copy(this.offset).cross(this.eye).normalize();
            this.rotationAngle =
              this.offset.dot(this.tempVector.copy(this.rotationAxis).cross(this.eye)) * ROTATION_SPEED;

            break;
          }

          case 'X':
          case 'Y':
          case 'Z': {
            this.rotationAxis.copy(this.unit[axis]);

            this.tempVector.copy(this.unit[axis]);

            if (space === 'local') {
              this.tempVector.applyQuaternion(this.worldQuaternion);
            }

            this.rotationAngle = this.offset.dot(this.tempVector.cross(this.eye).normalize()) * ROTATION_SPEED;

            break;
          }
          // No default
        }

        // Apply rotation snap

        if (this.rotationSnap) {
          this.rotationAngle = Math.round(this.rotationAngle / this.rotationSnap) * this.rotationSnap;
        }

        // Apply rotate
        if (space === 'local' && axis !== 'E' && axis !== 'XYZE') {
          object.quaternion.copy(this.quaternionStart);
          object.quaternion
            .multiply(this.tempQuaternion.setFromAxisAngle(this.rotationAxis, this.rotationAngle))
            .normalize();
        } else {
          this.rotationAxis.applyQuaternion(this.parentQuaternionInv);
          object.quaternion.copy(this.tempQuaternion.setFromAxisAngle(this.rotationAxis, this.rotationAngle));
          object.quaternion.multiply(this.quaternionStart).normalize();
        }

        break;
      }
      // No default
    }

    // @ts-expect-error -- custom controls event, needs augmentation
    this.dispatchEvent(this.changeEvent);
    // @ts-expect-error -- custom controls event, needs augmentation
    this.dispatchEvent(this.objectChangeEvent);
  };

  private readonly pointerUp = (pointer: TransformControlsPointerObject): void => {
    if (pointer.button !== 0) {
      return;
    }

    if (this.dragging && this.axis !== undefined) {
      this.mouseUpEvent.mode = this.mode;
      // @ts-expect-error -- custom controls event, needs augmentation
      this.dispatchEvent(this.mouseUpEvent);
    }

    this.dragging = false;
    this.axis = undefined;
  };

  private readonly getPointer = (event: Event): TransformControlsPointerObject => {
    if (this.domElement?.ownerDocument.pointerLockElement) {
      return {
        x: 0,
        y: 0,
        button: (event as MouseEvent).button,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- type guard
    const pointer = (event as TouchEvent).changedTouches
      ? (event as TouchEvent).changedTouches[0]!
      : (event as MouseEvent);

    const rect = this.domElement!.getBoundingClientRect();

    return {
      x: ((pointer.clientX - rect.left) / rect.width) * 2 - 1,
      y: (-(pointer.clientY - rect.top) / rect.height) * 2 + 1,
      button: (event as MouseEvent).button,
    };
  };

  private readonly onPointerHover = (event: Event): void => {
    if (!this.enabled) {
      return;
    }

    switch ((event as PointerEvent).pointerType) {
      case 'mouse':
      case 'pen': {
        this.pointerHover(this.getPointer(event));
        break;
      }
    }
  };

  private readonly onPointerDown = (event: Event): void => {
    if (!this.enabled || !this.domElement) {
      return;
    }

    this.domElement.style.touchAction = 'none'; // Disable touch scroll
    this.domElement.ownerDocument.addEventListener('pointermove', this.onPointerMove);
    this.pointerHover(this.getPointer(event));
    this.pointerDown(this.getPointer(event));
  };

  private readonly onPointerMove = (event: Event): void => {
    if (!this.enabled) {
      return;
    }

    this.pointerMove(this.getPointer(event));
  };

  private readonly onPointerUp = (event: Event): void => {
    if (!this.enabled || !this.domElement) {
      return;
    }

    this.domElement.style.touchAction = '';
    this.domElement.ownerDocument.removeEventListener('pointermove', this.onPointerMove);

    this.pointerUp(this.getPointer(event));
  };
}

type TransformControlsGizmoPrivateGizmos = {
  ['translate']: Object3D;
  ['scale']: Object3D;
  ['rotate']: Object3D;
  ['visible']: boolean;
};

class TransformControlsGizmo extends Object3D {
  public override type = 'TransformControlsGizmo';
  public isTransformControlsGizmo = true;
  public picker: TransformControlsGizmoPrivateGizmos;

  private readonly tempVector = new Vector3(0, 0, 0);
  private readonly tempEuler = new Euler();
  private readonly alignVector = new Vector3(0, 1, 0);
  private readonly zeroVector = new Vector3(0, 0, 0);
  private readonly lookAtMatrix = new Matrix4();
  private readonly tempQuaternion = new Quaternion();
  private readonly tempQuaternion2 = new Quaternion();
  private readonly identityQuaternion = new Quaternion();

  private readonly unitX = new Vector3(1, 0, 0);
  private readonly unitY = new Vector3(0, 1, 0);
  private readonly unitZ = new Vector3(0, 0, 1);

  private readonly gizmo: TransformControlsGizmoPrivateGizmos;
  private readonly helper: TransformControlsGizmoPrivateGizmos;

  // These are set from parent class TransformControls
  private readonly rotationAxis = new Vector3();

  private readonly cameraPosition = new Vector3();

  private readonly worldPositionStart = new Vector3();
  private readonly worldQuaternionStart = new Quaternion();

  private readonly worldPosition = new Vector3();
  private readonly worldQuaternion = new Quaternion();

  private readonly eye = new Vector3();

  private readonly camera: PerspectiveCamera | OrthographicCamera = undefined!;
  private readonly enabled: boolean = true;
  private readonly axis: string | undefined = undefined;
  private readonly mode: 'translate' | 'rotate' | 'scale' = 'translate';
  private readonly space: 'world' | 'local' = 'world';
  private readonly size = 1;
  private readonly dragging: boolean = false;
  private readonly showX: boolean = true;
  private readonly showY: boolean = true;
  private readonly showZ: boolean = true;

  public constructor() {
    super();

    const matcapTexture = matcapMaterial();

    const gizmoMaterial = new MeshMatcapMaterial({
      matcap: matcapTexture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      side: DoubleSide,
      fog: false,
      toneMapped: false,
    });

    const gizmoLineMaterial = new LineBasicMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      linewidth: 1,
      fog: false,
      toneMapped: false,
    });

    // Helper dotted line configuration (inline defaults)
    const helperDashSize = 2;
    const helperGapSize = 1.5;

    const helperLineDashedMaterial = new LineDashedMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      linewidth: 1,
      fog: false,
      toneMapped: false,
      dashSize: helperDashSize,
      gapSize: helperGapSize,
      color: 0x00_00_00,
    });

    // Const gizmoLineDashed = new LineDashedMaterial({
    //   depthTest: false,
    //   depthWrite: false,
    //   transparent: true,
    //   linewidth: 1,
    //   fog: false,
    //   toneMapped: false,
    //   dashSize: 1,
    //   gapSize: 1,
    //   color: 0x00_00_00,
    // });

    // Make unique material for each axis/color

    const matInvisible = gizmoMaterial.clone();
    matInvisible.opacity = 0.15;

    const matHelper = gizmoMaterial.clone();
    matHelper.color.set(0x00_00_00);
    matHelper.opacity = 0.5;

    const matHelperWhite = gizmoMaterial.clone();
    matHelperWhite.color.set(0xff_ff_ff);

    const matHelperBlack = gizmoMaterial.clone();
    matHelperBlack.color.set(0x00_00_00);

    const matRed = gizmoMaterial.clone();
    matRed.color.set(0xef_44_44);

    const matGreen = gizmoMaterial.clone();
    matGreen.color.set(0x22_c5_5e);

    const matBlue = gizmoMaterial.clone();
    matBlue.color.set(0x3b_82_f6);

    const matWhiteTransparent = gizmoMaterial.clone();
    matWhiteTransparent.opacity = 0.25;

    const matYellowTransparent = matWhiteTransparent.clone();
    matYellowTransparent.color.set(0xff_ff_00);

    const matCyanTransparent = matWhiteTransparent.clone();
    matCyanTransparent.color.set(0x00_ff_ff);

    const matMagentaTransparent = matWhiteTransparent.clone();
    matMagentaTransparent.color.set(0xff_00_ff);

    const matYellow = gizmoMaterial.clone();
    matYellow.color.set(0xff_ff_00);

    const matLineRed = gizmoLineMaterial.clone();
    matLineRed.color.set(0xef_44_44);

    const matLineGreen = gizmoLineMaterial.clone();
    matLineGreen.color.set(0x22_c5_5e);

    const matLineBlue = gizmoLineMaterial.clone();
    matLineBlue.color.set(0x3b_82_f6);

    const matLineCyan = gizmoLineMaterial.clone();
    matLineCyan.color.set(0x00_ff_ff);

    const matLineMagenta = gizmoLineMaterial.clone();
    matLineMagenta.color.set(0xff_00_ff);

    const matLineYellow = gizmoLineMaterial.clone();
    matLineYellow.color.set(0xff_ff_00);

    const matLineGray = gizmoLineMaterial.clone();
    matLineGray.color.set(0x78_78_78);

    const matLineYellowTransparent = matLineYellow.clone();
    matLineYellowTransparent.opacity = 0.25;

    // Reusable geometry

    const arrowDepth = 100;
    const textDepth = 25;
    const boxDepth = 200;

    const scaleHandleGeometry = new BoxGeometry(0.125, 0.125, 0.125);

    const arrowGeometry = SvgGeometry({ svg: arrowSvg, depth: arrowDepth });
    const doubleArrowGeometry = SvgGeometry({ svg: doubleArrowSvg, depth: arrowDepth });

    const fontGeometryTranslation = FontGeometry({ text: '24 mm', depth: textDepth, size: 300 });
    const fontGeometryRotationX = FontGeometry({ text: '45°', depth: textDepth, size: 400 });
    const fontGeometryRotationY = FontGeometry({ text: '15°', depth: textDepth, size: 400 });
    const fontGeometryRotationZ = FontGeometry({ text: '67°', depth: textDepth, size: 400 });
    const roundedBoxGeometry = RoundedRectangleGeometry({
      width: 1500,
      height: 700,
      radius: 200,
      smoothness: 16,
      depth: 100,
    });

    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 0, 0], 3));

    // Special geometry for transform helper. If scaled with position vector it spans from [0,0,0] to position

    const TranslateHelperGeometry = (): BufferGeometry => {
      const geometry = new BufferGeometry();

      geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 1, 1, 1], 3));

      return geometry;
    };

    // Gizmo definitions - custom hierarchy definitions for setupGizmo() function

    const gizmoTranslationScaleFactor = 0.000_25;
    const pickerTranslationScaleFactor = 0.000_25;

    const gizmoTranslationScale = [
      gizmoTranslationScaleFactor,
      gizmoTranslationScaleFactor,
      gizmoTranslationScaleFactor,
    ];
    const pickerTranslationScale = [
      pickerTranslationScaleFactor,
      pickerTranslationScaleFactor,
      pickerTranslationScaleFactor,
    ];
    const gizmoMeshOffset = 0.3;
    const gizmoMeshTranslationTextOffset = 0.7;

    // Rotation text and box offsets
    const gizmoRotationScaleFactor = 0.000_15;
    const gizmoRotationScaleFactorZ = gizmoTranslationScaleFactor;
    const pickerRotationScaleFactor = 0.0003;
    const gizmoMeshRotationTextOffset = 1.2;
    const gizmoTextBoxOffset = ((boxDepth + textDepth) / 2) * gizmoRotationScaleFactor;
    const gizmoRotationScale = [gizmoRotationScaleFactor, gizmoRotationScaleFactor, gizmoRotationScaleFactorZ];
    const pickerRotationScale = [
      //
      pickerRotationScaleFactor,
      pickerRotationScaleFactor,
      pickerRotationScaleFactor,
    ];

    // Order is:
    // 1. The Object3D to render
    // 2. The position of the object
    // 3. The rotation of the object
    // 4. The scale of the object
    // 5. The name of the object
    const gizmoTranslate = {
      X: [
        [
          new Mesh(arrowGeometry, matRed),
          [gizmoMeshOffset, 0, 0],
          [Math.PI / 2, 0, -Math.PI / 2],
          gizmoTranslationScale,
          'fwd-handle',
        ],
        [
          new Mesh(arrowGeometry, matRed),
          [-gizmoMeshOffset, 0, 0],
          [Math.PI / 2, 0, Math.PI / 2],
          gizmoTranslationScale,
          'bwd-handle',
        ],
        [
          new Mesh(fontGeometryTranslation, matHelper),
          [gizmoMeshTranslationTextOffset, gizmoTextBoxOffset, 0],
          [Math.PI / 2, Math.PI, Math.PI],
          gizmoTranslationScale,
          'fwd-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [gizmoMeshTranslationTextOffset, 0, 0],
          [Math.PI / 2, 0, 0],
          gizmoTranslationScale,
          'fwd-label',
        ],
        [
          new Mesh(fontGeometryTranslation, matHelperBlack),
          [-gizmoMeshTranslationTextOffset, gizmoTextBoxOffset, 0],
          [Math.PI / 2, 0, Math.PI],
          gizmoTranslationScale,
          'bwd-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [-gizmoMeshTranslationTextOffset, 0, 0],
          [Math.PI / 2, 0, Math.PI],
          gizmoTranslationScale,
          'bwd-label',
        ],
      ],
      Y: [
        [new Mesh(arrowGeometry, matGreen), [0, gizmoMeshOffset, 0], undefined, gizmoTranslationScale, 'fwd-handle'],
        [
          new Mesh(arrowGeometry, matGreen),
          [0, -gizmoMeshOffset, 0],
          [Math.PI, 0, 0],
          gizmoTranslationScale,
          'bwd-handle',
        ],
        [
          new Mesh(fontGeometryTranslation, matHelper),
          [0, gizmoMeshTranslationTextOffset, gizmoTextBoxOffset],
          [0, 0, Math.PI / 2],
          gizmoTranslationScale,
          'fwd-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [0, gizmoMeshTranslationTextOffset, 0],
          [0, 0, Math.PI / 2],
          gizmoTranslationScale,
          'fwd-label',
        ],
        [
          new Mesh(fontGeometryTranslation, matHelper),
          [0, -gizmoMeshTranslationTextOffset, gizmoTextBoxOffset],
          [Math.PI, 0, Math.PI / 2],
          gizmoTranslationScale,
          'bwd-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [0, -gizmoMeshTranslationTextOffset, 0],
          [0, 0, Math.PI / 2],
          gizmoTranslationScale,
          'bwd-label',
        ],
      ],
      Z: [
        [
          new Mesh(arrowGeometry, matBlue),
          [0, 0, gizmoMeshOffset],
          [Math.PI / 2, 0, 0],
          gizmoTranslationScale,
          'fwd-handle',
        ],
        [
          new Mesh(arrowGeometry, matBlue),
          [0, 0, -gizmoMeshOffset],
          [-Math.PI / 2, 0, 0],
          gizmoTranslationScale,
          'bwd-handle',
        ],
        [
          new Mesh(fontGeometryTranslation, matHelper),
          [0, gizmoTextBoxOffset, gizmoMeshTranslationTextOffset],
          [Math.PI / 2, Math.PI, 0],
          gizmoTranslationScale,
          'fwd-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [0, 0, gizmoMeshTranslationTextOffset],
          [-Math.PI / 2, 0, 0],
          gizmoTranslationScale,
          'fwd-label',
        ],
        [
          new Mesh(fontGeometryTranslation, matHelperBlack),
          [0, gizmoTextBoxOffset, -gizmoMeshTranslationTextOffset],
          [Math.PI / 2, 0, Math.PI],
          gizmoTranslationScale,
          'bwd-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [0, 0, -gizmoMeshTranslationTextOffset],
          [Math.PI / 2, 0, Math.PI],
          gizmoTranslationScale,
          'bwd-label',
        ],
      ],
      XYZ: [[new Mesh(new OctahedronGeometry(0.1, 0), matWhiteTransparent.clone()), [0, 0, 0], [0, 0, 0]]],
      XY: [
        [new Mesh(new PlaneGeometry(0.295, 0.295), matYellowTransparent.clone()), [0.15, 0.15, 0]],
        [new Line(lineGeometry, matLineYellow), [0.18, 0.3, 0], undefined, [0.125, 1, 1]],
        [new Line(lineGeometry, matLineYellow), [0.3, 0.18, 0], [0, 0, Math.PI / 2], [0.125, 1, 1]],
      ],
      YZ: [
        [new Mesh(new PlaneGeometry(0.295, 0.295), matCyanTransparent.clone()), [0, 0.15, 0.15], [0, Math.PI / 2, 0]],
        [new Line(lineGeometry, matLineCyan), [0, 0.18, 0.3], [0, 0, Math.PI / 2], [0.125, 1, 1]],
        [new Line(lineGeometry, matLineCyan), [0, 0.3, 0.18], [0, -Math.PI / 2, 0], [0.125, 1, 1]],
      ],
      XZ: [
        [
          new Mesh(new PlaneGeometry(0.295, 0.295), matMagentaTransparent.clone()),
          [0.15, 0, 0.15],
          [-Math.PI / 2, 0, 0],
        ],
        [new Line(lineGeometry, matLineMagenta), [0.18, 0, 0.3], undefined, [0.125, 1, 1]],
        [new Line(lineGeometry, matLineMagenta), [0.3, 0, 0.18], [0, -Math.PI / 2, 0], [0.125, 1, 1]],
      ],
    };

    const pickerTranslate = {
      X: [
        [
          new Mesh(arrowGeometry, matInvisible),
          [gizmoMeshOffset, 0, 0],
          [Math.PI / 2, 0, -Math.PI / 2],
          pickerTranslationScale,
          'fwd-picker',
        ],
        [
          new Mesh(arrowGeometry, matInvisible),
          [-gizmoMeshOffset, 0, 0],
          [0, 0, Math.PI / 2],
          pickerTranslationScale,
          'bwd-picker',
        ],
      ],
      Y: [
        [new Mesh(arrowGeometry, matGreen), [0, gizmoMeshOffset, 0], undefined, pickerTranslationScale, 'fwd-picker'],
        [
          new Mesh(arrowGeometry, matGreen),
          [0, -gizmoMeshOffset, 0],
          [Math.PI, 0, 0],
          pickerTranslationScale,
          'bwd-picker',
        ],
      ],
      Z: [
        [
          new Mesh(arrowGeometry, matBlue),
          [0, 0, gizmoMeshOffset],
          [Math.PI / 2, 0, 0],
          pickerTranslationScale,
          'fwd-picker',
        ],
        [
          new Mesh(arrowGeometry, matBlue),
          [0, 0, -gizmoMeshOffset],
          [-Math.PI / 2, 0, 0],
          pickerTranslationScale,
          'bwd-picker',
        ],
      ],
      XYZ: [[new Mesh(new OctahedronGeometry(0.2, 0), matInvisible)]],
      XY: [[new Mesh(new PlaneGeometry(0.4, 0.4), matInvisible), [0.2, 0.2, 0]]],
      YZ: [[new Mesh(new PlaneGeometry(0.4, 0.4), matInvisible), [0, 0.2, 0.2], [0, Math.PI / 2, 0]]],
      XZ: [[new Mesh(new PlaneGeometry(0.4, 0.4), matInvisible), [0.2, 0, 0.2], [-Math.PI / 2, 0, 0]]],
    };

    // Dashed translate helper line
    const helperTranslateDeltaLine = new Line(TranslateHelperGeometry(), helperLineDashedMaterial.clone());
    helperTranslateDeltaLine.computeLineDistances();

    const helperTranslate = {
      START: [[new Mesh(new OctahedronGeometry(0.02, 2), matHelper), undefined, undefined, undefined, 'helper']],
      END: [[new Mesh(new OctahedronGeometry(0.02, 2), matHelper), undefined, undefined, undefined, 'helper']],
      DELTA: [[helperTranslateDeltaLine, undefined, undefined, undefined, 'helper']],
    };

    const gizmoRotate = {
      X: [
        [new Line(CircleGeometry({ radius: 1, arc: 0.1, arcOffset: (Math.PI / 4) * 1.625 }), matLineRed)],
        [new Mesh(doubleArrowGeometry, matRed), [0, 0, 1], [0, Math.PI / 2, Math.PI / 2], gizmoRotationScale],
        [
          new Mesh(fontGeometryRotationX, matHelper),
          [gizmoTextBoxOffset, 0, gizmoMeshRotationTextOffset],
          [Math.PI / 2, Math.PI / 2, 0],
          gizmoRotationScale,
          'rotation-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [0, 0, gizmoMeshRotationTextOffset],
          [Math.PI / 2, Math.PI / 2, 0],
          gizmoRotationScale,
          'rotation-label',
        ],
      ],
      Y: [
        [
          new Line(CircleGeometry({ radius: 1, arc: 0.1, arcOffset: (Math.PI / 4) * 1.625 }), matLineGreen),
          undefined,
          [0, 0, -Math.PI / 2],
        ],
        [new Mesh(doubleArrowGeometry, matGreen), [0, 0, 1], [Math.PI / 2, 0, 0], gizmoRotationScale],
        [
          new Mesh(fontGeometryRotationY, matHelper),
          [0, -gizmoTextBoxOffset, gizmoMeshRotationTextOffset],
          [Math.PI / 2, 0, 0],
          gizmoRotationScale,
          'rotation-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [0, 0, gizmoMeshRotationTextOffset],
          [Math.PI / 2, 0, 0],
          gizmoRotationScale,
          'rotation-label',
        ],
      ],
      Z: [
        [
          new Line(CircleGeometry({ radius: 1, arc: 0.1, arcOffset: (Math.PI / 4) * 1.625 }), matLineBlue),
          undefined,
          [0, Math.PI / 2, 0],
        ],
        [new Mesh(doubleArrowGeometry, matBlue), [1, 0, 0], [0, 0, -Math.PI / 2], gizmoRotationScale],
        [
          new Mesh(fontGeometryRotationZ, matHelper),
          [gizmoMeshRotationTextOffset, 0, gizmoTextBoxOffset],
          [0, 0, Math.PI / 2],
          gizmoRotationScale,
          'rotation-label',
        ],
        [
          new Mesh(roundedBoxGeometry, matHelperWhite),
          [gizmoMeshRotationTextOffset, 0, 0],
          [0, 0, Math.PI / 2],
          gizmoRotationScale,
          'rotation-label',
        ],
      ],
      E: [
        [new Line(CircleGeometry({ radius: 1.25, arc: 1 }), matLineYellowTransparent), undefined, [0, Math.PI / 2, 0]],
        [
          new Mesh(new CylinderGeometry(0.03, 0, 0.15, 4, 1, false), matLineYellowTransparent),
          [1.17, 0, 0],
          [0, 0, -Math.PI / 2],
          [1, 1, 0.001],
        ],
        [
          new Mesh(new CylinderGeometry(0.03, 0, 0.15, 4, 1, false), matLineYellowTransparent),
          [-1.17, 0, 0],
          [0, 0, Math.PI / 2],
          [1, 1, 0.001],
        ],
        [
          new Mesh(new CylinderGeometry(0.03, 0, 0.15, 4, 1, false), matLineYellowTransparent),
          [0, -1.17, 0],
          [Math.PI, 0, 0],
          [1, 1, 0.001],
        ],
        [
          new Mesh(new CylinderGeometry(0.03, 0, 0.15, 4, 1, false), matLineYellowTransparent),
          [0, 1.17, 0],
          [0, 0, 0],
          [1, 1, 0.001],
        ],
      ],
      XYZE: [[new Line(CircleGeometry({ radius: 1, arc: 1 }), matLineGray), undefined, [0, Math.PI / 2, 0]]],
    };

    // Dashed rotate helper long axis
    const helperRotateAxisLine = new Line(lineGeometry, helperLineDashedMaterial.clone());
    helperRotateAxisLine.computeLineDistances();

    const helperRotate = {
      AXIS: [[helperRotateAxisLine, [-1e3, 0, 0], undefined, [1e6, 1, 1], 'helper']],
    };

    const pickerRotate = {
      X: [[new Mesh(doubleArrowGeometry, matRed), [0, 0, 1], [0, Math.PI / 2, Math.PI / 2], pickerRotationScale]],
      Y: [[new Mesh(doubleArrowGeometry, matGreen), [0, 0, 1], [Math.PI / 2, 0, 0], pickerRotationScale]],
      Z: [[new Mesh(doubleArrowGeometry, matBlue), [1, 0, 0], [0, 0, -Math.PI / 2], pickerRotationScale]],
      // X: [[new Mesh(new TorusGeometry(1, 0.1, 4, 24), matInvisible), [0, 0, 0], [0, -Math.PI / 2, -Math.PI / 2]]],
      // Y: [[new Mesh(new TorusGeometry(1, 0.1, 4, 24), matInvisible), [0, 0, 0], [Math.PI / 2, 0, 0]]],
      // Z: [[new Mesh(new TorusGeometry(1, 0.1, 4, 24), matInvisible), [0, 0, 0], [0, 0, -Math.PI / 2]]],
      E: [[new Mesh(new TorusGeometry(1.25, 0.1, 2, 24), matInvisible)]],
      XYZE: [[new Mesh(new SphereGeometry(0.7, 10, 8), matInvisible)]],
    };

    const gizmoScale = {
      X: [
        [new Mesh(scaleHandleGeometry, matRed), [0.8, 0, 0], [0, 0, -Math.PI / 2]],
        [new Line(lineGeometry, matLineRed), undefined, undefined, [0.8, 1, 1]],
      ],
      Y: [
        [new Mesh(scaleHandleGeometry, matGreen), [0, 0.8, 0]],
        [new Line(lineGeometry, matLineGreen), undefined, [0, 0, Math.PI / 2], [0.8, 1, 1]],
      ],
      Z: [
        [new Mesh(scaleHandleGeometry, matBlue), [0, 0, 0.8], [Math.PI / 2, 0, 0]],
        [new Line(lineGeometry, matLineBlue), undefined, [0, -Math.PI / 2, 0], [0.8, 1, 1]],
      ],
      XY: [
        [new Mesh(scaleHandleGeometry, matYellowTransparent), [0.85, 0.85, 0], undefined, [2, 2, 0.2]],
        [new Line(lineGeometry, matLineYellow), [0.855, 0.98, 0], undefined, [0.125, 1, 1]],
        [new Line(lineGeometry, matLineYellow), [0.98, 0.855, 0], [0, 0, Math.PI / 2], [0.125, 1, 1]],
      ],
      YZ: [
        [new Mesh(scaleHandleGeometry, matCyanTransparent), [0, 0.85, 0.85], undefined, [0.2, 2, 2]],
        [new Line(lineGeometry, matLineCyan), [0, 0.855, 0.98], [0, 0, Math.PI / 2], [0.125, 1, 1]],
        [new Line(lineGeometry, matLineCyan), [0, 0.98, 0.855], [0, -Math.PI / 2, 0], [0.125, 1, 1]],
      ],
      XZ: [
        [new Mesh(scaleHandleGeometry, matMagentaTransparent), [0.85, 0, 0.85], undefined, [2, 0.2, 2]],
        [new Line(lineGeometry, matLineMagenta), [0.855, 0, 0.98], undefined, [0.125, 1, 1]],
        [new Line(lineGeometry, matLineMagenta), [0.98, 0, 0.855], [0, -Math.PI / 2, 0], [0.125, 1, 1]],
      ],
      XYZX: [[new Mesh(new BoxGeometry(0.125, 0.125, 0.125), matWhiteTransparent.clone()), [1.1, 0, 0]]],
      XYZY: [[new Mesh(new BoxGeometry(0.125, 0.125, 0.125), matWhiteTransparent.clone()), [0, 1.1, 0]]],
      XYZZ: [[new Mesh(new BoxGeometry(0.125, 0.125, 0.125), matWhiteTransparent.clone()), [0, 0, 1.1]]],
    };

    const pickerScale = {
      X: [[new Mesh(new CylinderGeometry(0.2, 0, 0.8, 4, 1, false), matInvisible), [0.5, 0, 0], [0, 0, -Math.PI / 2]]],
      Y: [[new Mesh(new CylinderGeometry(0.2, 0, 0.8, 4, 1, false), matInvisible), [0, 0.5, 0]]],
      Z: [[new Mesh(new CylinderGeometry(0.2, 0, 0.8, 4, 1, false), matInvisible), [0, 0, 0.5], [Math.PI / 2, 0, 0]]],
      XY: [[new Mesh(scaleHandleGeometry, matInvisible), [0.85, 0.85, 0], undefined, [3, 3, 0.2]]],
      YZ: [[new Mesh(scaleHandleGeometry, matInvisible), [0, 0.85, 0.85], undefined, [0.2, 3, 3]]],
      XZ: [[new Mesh(scaleHandleGeometry, matInvisible), [0.85, 0, 0.85], undefined, [3, 0.2, 3]]],
      XYZX: [[new Mesh(new BoxGeometry(0.2, 0.2, 0.2), matInvisible), [1.1, 0, 0]]],
      XYZY: [[new Mesh(new BoxGeometry(0.2, 0.2, 0.2), matInvisible), [0, 1.1, 0]]],
      XYZZ: [[new Mesh(new BoxGeometry(0.2, 0.2, 0.2), matInvisible), [0, 0, 1.1]]],
    };

    // Dashed scale helpers for X/Y/Z
    const helperScaleXLine = new Line(lineGeometry, helperLineDashedMaterial.clone());
    helperScaleXLine.computeLineDistances();
    const helperScaleYLine = new Line(lineGeometry, helperLineDashedMaterial.clone());
    helperScaleYLine.computeLineDistances();
    const helperScaleZLine = new Line(lineGeometry, helperLineDashedMaterial.clone());
    helperScaleZLine.computeLineDistances();

    const helperScale = {
      X: [[helperScaleXLine, [-1e3, 0, 0], undefined, [1e6, 1, 1], 'helper']],
      Y: [[helperScaleYLine, [0, -1e3, 0], [0, 0, Math.PI / 2], [1e6, 1, 1], 'helper']],
      Z: [[helperScaleZLine, [0, 0, -1e3], [0, -Math.PI / 2, 0], [1e6, 1, 1], 'helper']],
    };

    // Creates an Object3D with gizmos described in custom hierarchy definition.
    // this is nearly impossible to Type so i'm leaving it
    const setupGizmo = (
      gizmoMap: Record<
        string,
        Array<[Mesh, number[] | undefined, number[] | undefined, number[] | undefined, string | undefined]>
      >,
    ): Object3D => {
      const gizmo = new Object3D();

      // eslint-disable-next-line guard-for-in -- TODO
      for (const name in gizmoMap) {
        for (let i = gizmoMap[name]!.length; i--; ) {
          const object = gizmoMap[name]![i]![0].clone();
          const position = gizmoMap[name]![i]![1];
          const rotation = gizmoMap[name]![i]![2];
          const scale = gizmoMap[name]![i]![3];
          const tag = gizmoMap[name]![i]![4];

          // Name and tag properties are essential for picking and updating logic.
          object.name = name;
          // @ts-expect-error --  TODO: augment types or replace mechanism altogether
          object.tag = tag;

          if (position) {
            object.position.set(position[0]!, position[1]!, position[2]!);
          }

          if (rotation) {
            object.rotation.set(rotation[0]!, rotation[1]!, rotation[2]!);
          }

          if (scale) {
            object.scale.set(scale[0]!, scale[1]!, scale[2]!);
          }

          object.updateMatrix();

          const temporaryGeometry = object.geometry.clone();
          temporaryGeometry.applyMatrix4(object.matrix);
          object.geometry = temporaryGeometry;
          if (object instanceof Line) {
            // Ensure dashed materials render correctly after baking transforms
            object.computeLineDistances();
          }

          object.renderOrder = Infinity;

          object.position.set(0, 0, 0);
          object.rotation.set(0, 0, 0);
          object.scale.set(1, 1, 1);

          gizmo.add(object);
        }
      }

      return gizmo;
    };

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- TODO: fix typings
    this.gizmo = {} as TransformControlsGizmoPrivateGizmos;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- TODO: fix typings
    this.picker = {} as TransformControlsGizmoPrivateGizmos;
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- TODO: fix typings
    this.helper = {} as TransformControlsGizmoPrivateGizmos;

    // @ts-expect-error -- fix typings
    this.add((this.gizmo.translate = setupGizmo(gizmoTranslate)));
    // @ts-expect-error -- fix typings
    this.add((this.gizmo.rotate = setupGizmo(gizmoRotate)));
    // @ts-expect-error -- fix typings
    this.add((this.gizmo.scale = setupGizmo(gizmoScale)));
    // @ts-expect-error -- fix typings
    this.add((this.picker.translate = setupGizmo(pickerTranslate)));
    // @ts-expect-error -- fix typings
    this.add((this.picker.rotate = setupGizmo(pickerRotate)));
    // @ts-expect-error -- fix typings
    this.add((this.picker.scale = setupGizmo(pickerScale)));
    // @ts-expect-error -- fix typings
    this.add((this.helper.translate = setupGizmo(helperTranslate)));
    // @ts-expect-error -- fix typings
    this.add((this.helper.rotate = setupGizmo(helperRotate)));
    // @ts-expect-error -- fix typings
    this.add((this.helper.scale = setupGizmo(helperScale)));

    // Pickers should be hidden always

    this.picker.translate.visible = false;
    this.picker.rotate.visible = false;
    this.picker.scale.visible = false;
  }

  // UpdateMatrixWorld will update transformations and appearance of individual handles
  public override updateMatrixWorld = (): void => {
    let { space } = this;

    if (this.mode === 'scale') {
      space = 'local'; // Scale always oriented to local rotation
    }

    const quaternion = space === 'local' ? this.worldQuaternion : this.identityQuaternion;

    // Show only gizmos for current transform mode

    this.gizmo.translate.visible = this.mode === 'translate';
    this.gizmo.rotate.visible = this.mode === 'rotate';
    this.gizmo.scale.visible = this.mode === 'scale';

    this.helper.translate.visible = this.mode === 'translate';
    this.helper.rotate.visible = this.mode === 'rotate';
    this.helper.scale.visible = this.mode === 'scale';

    const handles: Array<Object3D & { tag?: string }> = [
      ...this.picker[this.mode].children,
      ...this.gizmo[this.mode].children,
      ...this.helper[this.mode].children,
    ];

    for (const handle of handles) {
      // Hide aligned to camera

      handle.visible = true;
      handle.rotation.set(0, 0, 0);
      handle.position.copy(this.worldPosition);

      let factor;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- camera is possible perspective or orthographic
      if ((this.camera as OrthographicCamera).isOrthographicCamera) {
        factor =
          ((this.camera as OrthographicCamera).top - (this.camera as OrthographicCamera).bottom) /
          (this.camera as OrthographicCamera).zoom;
      } else {
        factor =
          this.worldPosition.distanceTo(this.cameraPosition) *
          Math.min((1.9 * Math.tan((Math.PI * (this.camera as PerspectiveCamera).fov) / 360)) / this.camera.zoom, 7);
      }

      handle.scale.set(1, 1, 1).multiplyScalar((factor * this.size) / 7);

      // TODO: simplify helpers and consider decoupling from gizmo

      if (handle.tag === 'helper') {
        handle.visible = false;

        switch (handle.name) {
          case 'AXIS': {
            handle.position.copy(this.worldPositionStart);
            handle.visible = Boolean(this.axis);

            if (this.axis === 'X') {
              this.tempQuaternion.setFromEuler(this.tempEuler.set(0, 0, 0));
              handle.quaternion.copy(quaternion).multiply(this.tempQuaternion);

              if (Math.abs(this.alignVector.copy(this.unitX).applyQuaternion(quaternion).dot(this.eye)) > 0.9) {
                handle.visible = false;
              }
            }

            if (this.axis === 'Y') {
              this.tempQuaternion.setFromEuler(this.tempEuler.set(0, 0, Math.PI / 2));
              handle.quaternion.copy(quaternion).multiply(this.tempQuaternion);

              if (Math.abs(this.alignVector.copy(this.unitY).applyQuaternion(quaternion).dot(this.eye)) > 0.9) {
                handle.visible = false;
              }
            }

            if (this.axis === 'Z') {
              this.tempQuaternion.setFromEuler(this.tempEuler.set(0, Math.PI / 2, 0));
              handle.quaternion.copy(quaternion).multiply(this.tempQuaternion);

              if (Math.abs(this.alignVector.copy(this.unitZ).applyQuaternion(quaternion).dot(this.eye)) > 0.9) {
                handle.visible = false;
              }
            }

            // Keep dash size constant for the long rotation helper regardless of camera-based gizmo scaling
            if (handle.visible) {
              const dashedMaterial = (handle as Line).material as LineDashedMaterial;
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ensure existence
              if (dashedMaterial && typeof dashedMaterial.scale === 'number') {
                dashedMaterial.scale = handle.scale.x;
              }
            }

            if (this.axis === 'XYZE') {
              this.tempQuaternion.setFromEuler(this.tempEuler.set(0, Math.PI / 2, 0));
              this.alignVector.copy(this.rotationAxis);
              handle.quaternion.setFromRotationMatrix(
                this.lookAtMatrix.lookAt(this.zeroVector, this.alignVector, this.unitY),
              );
              handle.quaternion.multiply(this.tempQuaternion);
              handle.visible = this.dragging;
            }

            if (this.axis === 'E') {
              handle.visible = false;
            }

            break;
          }

          case 'START': {
            handle.position.copy(this.worldPositionStart);
            handle.visible = this.dragging;

            break;
          }

          case 'END': {
            handle.position.copy(this.worldPosition);
            handle.visible = this.dragging;

            break;
          }

          case 'DELTA': {
            handle.position.copy(this.worldPositionStart);
            handle.quaternion.copy(this.worldQuaternionStart);
            this.tempVector
              .set(1e-10, 1e-10, 1e-10)
              .add(this.worldPositionStart)
              .sub(this.worldPosition)
              .multiplyScalar(-1);
            this.tempVector.applyQuaternion(this.worldQuaternionStart.clone().invert());
            handle.scale.copy(this.tempVector);
            // Keep dash size constant in world units: adjust material scale by geometric stretch
            // Base line geometry for translate helper is from (0,0,0) to (1,1,1), whose length is sqrt(3)
            const baseLength = Math.sqrt(3);
            const worldLength = this.tempVector.length();
            const scaleFactor = worldLength / baseLength || 1;
            const dashedMaterial = (handle as Line).material as LineDashedMaterial;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ensure the cast worked
            if (dashedMaterial && typeof dashedMaterial.scale === 'number') {
              dashedMaterial.scale = scaleFactor;
            }

            handle.visible = this.dragging;

            break;
          }

          default: {
            handle.quaternion.copy(quaternion);

            if (this.dragging) {
              handle.position.copy(this.worldPositionStart);
            } else {
              handle.position.copy(this.worldPosition);
            }

            if (this.axis) {
              handle.visible = this.axis.search(handle.name) !== -1;
            }
          }
        }

        // If updating helper, skip rest of the loop
        continue;
      }

      // Align handles to current local or world rotation

      handle.quaternion.copy(quaternion);

      if (this.mode === 'translate' || this.mode === 'scale') {
        // Ensure translation arrows face the user by twisting around their axis using the camera orientation
        if (this.mode === 'translate') {
          const isAxisArrow =
            (handle.tag?.includes('fwd') ?? handle.tag?.includes('bwd')) &&
            (handle.name === 'X' || handle.name === 'Y' || handle.name === 'Z');
          if (isAxisArrow) {
            // Calculate the camera rotation relative to the handle axis
            const handleAxis = handle.name === 'X' ? this.unitX : handle.name === 'Y' ? this.unitY : this.unitZ;
            const handleAxisWorld = this.alignVector.copy(handleAxis).applyQuaternion(quaternion).normalize();

            // Project the camera direction (eye vector) onto the plane perpendicular to the handle axis
            // This gives us the direction towards the camera, constrained to rotation around the axis
            const eyeProjected = this.tempVector
              .copy(this.eye)
              .addScaledVector(handleAxisWorld, -this.eye.dot(handleAxisWorld))
              .normalize();

            // Get a reference "up" vector perpendicular to the handle axis
            // We use the current handle's local Y-axis as the reference
            const referenceAxis = handle.name === 'X' ? this.unitY : handle.name === 'Y' ? this.unitZ : this.unitY;
            const handleUpWorld = new Vector3().copy(referenceAxis).applyQuaternion(quaternion).normalize();

            // Project the reference up vector onto the same plane
            const upProjected = handleUpWorld
              .addScaledVector(handleAxisWorld, -handleUpWorld.dot(handleAxisWorld))
              .normalize();

            // Calculate the signed angle between the projected vectors
            const cosAngle = upProjected.dot(eyeProjected);
            const crossProduct = new Vector3().crossVectors(upProjected, eyeProjected);
            const sinAngle = crossProduct.dot(handleAxisWorld);
            const cameraRotationRelative = Math.atan2(sinAngle, cosAngle);

            handle.rotateOnAxis(handleAxis, cameraRotationRelative);
          }
        }
        // Hide translate and scale axis facing the camera

        const AXIS_HIDE_TRESHOLD = 1;
        const PLANE_HIDE_TRESHOLD = 0.2;
        const AXIS_FLIP_TRESHOLD = 0;

        if (
          (handle.name === 'X' || handle.name === 'XYZX') &&
          Math.abs(this.alignVector.copy(this.unitX).applyQuaternion(quaternion).dot(this.eye)) > AXIS_HIDE_TRESHOLD
        ) {
          handle.scale.set(1e-10, 1e-10, 1e-10);
          handle.visible = false;
        }

        if (
          (handle.name === 'Y' || handle.name === 'XYZY') &&
          Math.abs(this.alignVector.copy(this.unitY).applyQuaternion(quaternion).dot(this.eye)) > AXIS_HIDE_TRESHOLD
        ) {
          handle.scale.set(1e-10, 1e-10, 1e-10);
          handle.visible = false;
        }

        if (
          (handle.name === 'Z' || handle.name === 'XYZZ') &&
          Math.abs(this.alignVector.copy(this.unitZ).applyQuaternion(quaternion).dot(this.eye)) > AXIS_HIDE_TRESHOLD
        ) {
          handle.scale.set(1e-10, 1e-10, 1e-10);
          handle.visible = false;
        }

        if (
          handle.name === 'XY' &&
          Math.abs(this.alignVector.copy(this.unitZ).applyQuaternion(quaternion).dot(this.eye)) < PLANE_HIDE_TRESHOLD
        ) {
          handle.scale.set(1e-10, 1e-10, 1e-10);
          handle.visible = false;
        }

        if (
          handle.name === 'YZ' &&
          Math.abs(this.alignVector.copy(this.unitX).applyQuaternion(quaternion).dot(this.eye)) < PLANE_HIDE_TRESHOLD
        ) {
          handle.scale.set(1e-10, 1e-10, 1e-10);
          handle.visible = false;
        }

        if (
          handle.name === 'XZ' &&
          Math.abs(this.alignVector.copy(this.unitY).applyQuaternion(quaternion).dot(this.eye)) < PLANE_HIDE_TRESHOLD
        ) {
          handle.scale.set(1e-10, 1e-10, 1e-10);
          handle.visible = false;
        }

        // Flip translate and scale axis ocluded behind another axis

        if (handle.name.search('X') !== -1) {
          if (this.alignVector.copy(this.unitX).applyQuaternion(quaternion).dot(this.eye) < AXIS_FLIP_TRESHOLD) {
            if (handle.tag?.includes('fwd')) {
              handle.visible = false;
            } else {
              handle.scale.x *= -1;
            }
          } else if (handle.tag?.includes('bwd')) {
            handle.visible = false;
          }
        }

        if (handle.name.search('Y') !== -1) {
          if (this.alignVector.copy(this.unitY).applyQuaternion(quaternion).dot(this.eye) < AXIS_FLIP_TRESHOLD) {
            if (handle.tag?.includes('fwd')) {
              handle.visible = false;
            } else {
              handle.scale.y *= -1;
            }
          } else if (handle.tag?.includes('bwd')) {
            handle.visible = false;
          }
        }

        if (handle.name.search('Z') !== -1) {
          if (this.alignVector.copy(this.unitZ).applyQuaternion(quaternion).dot(this.eye) < AXIS_FLIP_TRESHOLD) {
            if (handle.tag?.includes('fwd')) {
              handle.visible = false;
            } else {
              handle.scale.z *= -1;
            }
          } else if (handle.tag?.includes('bwd')) {
            handle.visible = false;
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhausive check
      } else if (this.mode === 'rotate') {
        // Align handles to current local or world rotation

        this.tempQuaternion2.copy(quaternion);
        this.alignVector.copy(this.eye).applyQuaternion(this.tempQuaternion.copy(quaternion).invert());

        if (handle.name.search('E') !== -1) {
          handle.quaternion.setFromRotationMatrix(this.lookAtMatrix.lookAt(this.eye, this.zeroVector, this.unitY));
        }

        // Const isLabel = handle.tag?.includes('label');
        // // Calculate the camera rotation relative to the handle axis
        // const handleAxis = handle.name === 'X' ? this.unitX : handle.name === 'Y' ? this.unitY : this.unitZ;
        // const handleAxisWorld = this.alignVector.copy(handleAxis).applyQuaternion(quaternion).normalize();

        // // Project the camera direction (eye vector) onto the plane perpendicular to the handle axis
        // // This gives us the direction towards the camera, constrained to rotation around the axis
        // const eyeProjected = this.tempVector
        //   .copy(this.eye)
        //   .addScaledVector(handleAxisWorld, this.eye.dot(handleAxisWorld))
        //   .normalize();

        // // Get a reference "up" vector perpendicular to the handle axis
        // // We use the current handle's local Y-axis as the reference
        // const referenceAxis = handle.name === 'X' ? this.unitY : handle.name === 'Y' ? this.unitZ : this.unitY;
        // const handleUpWorld = new Vector3().copy(referenceAxis).applyQuaternion(quaternion).normalize();

        // // Project the reference up vector onto the same plane
        // const upProjected = handleUpWorld
        //   .addScaledVector(handleAxisWorld, handleUpWorld.dot(handleAxisWorld))
        //   .normalize();

        // // Calculate the signed angle between the projected vectors
        // const cosAngle = upProjected.dot(eyeProjected);
        // const crossProduct = new Vector3().crossVectors(upProjected, eyeProjected);
        // const sinAngle = crossProduct.dot(handleAxisWorld);
        // const cameraRotationRelative = Math.atan2(sinAngle, cosAngle);

        // if (isLabel) {
        //   handle.rotateOnAxis(handleAxis, cameraRotationRelative);
        // }

        if (handle.name === 'X') {
          this.tempQuaternion.setFromAxisAngle(this.unitX, Math.atan2(-this.alignVector.y, this.alignVector.z));
          this.tempQuaternion.multiplyQuaternions(this.tempQuaternion2, this.tempQuaternion);
          handle.quaternion.copy(this.tempQuaternion);
        }

        if (handle.name === 'Y') {
          this.tempQuaternion.setFromAxisAngle(this.unitY, Math.atan2(this.alignVector.x, this.alignVector.z));
          this.tempQuaternion.multiplyQuaternions(this.tempQuaternion2, this.tempQuaternion);
          handle.quaternion.copy(this.tempQuaternion);
        }

        if (handle.name === 'Z') {
          this.tempQuaternion.setFromAxisAngle(this.unitZ, Math.atan2(this.alignVector.y, this.alignVector.x));
          this.tempQuaternion.multiplyQuaternions(this.tempQuaternion2, this.tempQuaternion);
          handle.quaternion.copy(this.tempQuaternion);
        }
      }

      // Hide disabled axes
      handle.visible &&= !handle.name.includes('X') || this.showX;
      handle.visible &&= !handle.name.includes('Y') || this.showY;
      handle.visible &&= !handle.name.includes('Z') || this.showZ;
      handle.visible &&= !handle.name.includes('E') || (this.showX && this.showY && this.showZ);

      // Highlight selected axis
      if (!handle.tag?.includes('label')) {
        // @ts-expect-error -- TODO
        handle.material.tempOpacity ??= handle.material.opacity;
        // @ts-expect-error -- TODO
        handle.material.tempColor ??= handle.material.color.clone();
        // @ts-expect-error -- TODO
        handle.material.color.copy(handle.material.tempColor);
        // @ts-expect-error -- TODO
        handle.material.opacity = handle.material.tempOpacity;

        if (!this.enabled) {
          // @ts-expect-error -- TODO
          handle.material.opacity *= 0.5;
          // @ts-expect-error -- TODO
          handle.material.color.lerp(new Color(1, 1, 1), 0.5);
        } else if (this.axis) {
          if (handle.name === this.axis) {
            // @ts-expect-error -- TODO
            handle.material.opacity = 1;
            // @ts-expect-error -- TODO
            handle.material.color.lerp(new Color(1, 1, 1), 0.5);
          } else if ([...this.axis].includes(handle.name)) {
            // @ts-expect-error -- TODO
            handle.material.opacity = 1;
            // @ts-expect-error -- TODO
            handle.material.color.lerp(new Color(1, 1, 1), 0.5);
          } else {
            // @ts-expect-error -- TODO
            handle.material.opacity *= 0.25;
            // @ts-expect-error -- TODO
            handle.material.color.lerp(new Color(1, 1, 1), 0.5);
          }
        }
      }
    }

    super.updateMatrixWorld();
  };
}

class TransformControlsPlane extends Mesh<PlaneGeometry, MeshBasicMaterial> {
  public override type = 'TransformControlsPlane';
  public isTransformControlsPlane = true;

  private readonly unitX = new Vector3(1, 0, 0);
  private readonly unitY = new Vector3(0, 1, 0);
  private readonly unitZ = new Vector3(0, 0, 1);

  private readonly tempVector = new Vector3();
  private readonly dirVector = new Vector3();
  private readonly alignVector = new Vector3();
  private readonly tempMatrix = new Matrix4();
  private readonly identityQuaternion = new Quaternion();

  // These are set from parent class TransformControls
  private readonly cameraQuaternion = new Quaternion();

  private readonly worldPosition = new Vector3();
  private readonly worldQuaternion = new Quaternion();

  private readonly eye = new Vector3();

  private readonly axis: string | undefined = undefined;
  private readonly mode: 'translate' | 'rotate' | 'scale' = 'translate';
  private readonly space: 'world' | 'local' = 'world';

  public constructor() {
    super(
      new PlaneGeometry(100_000, 100_000, 2, 2),
      new MeshBasicMaterial({
        visible: false,
        wireframe: true,
        side: DoubleSide,
        transparent: true,
        opacity: 0.1,
        toneMapped: false,
      }),
    );
  }

  public override updateMatrixWorld = (): void => {
    let { space } = this;

    this.position.copy(this.worldPosition);

    if (this.mode === 'scale') {
      space = 'local';
    } // Scale always oriented to local rotation

    this.unitX.set(1, 0, 0).applyQuaternion(space === 'local' ? this.worldQuaternion : this.identityQuaternion);
    this.unitY.set(0, 1, 0).applyQuaternion(space === 'local' ? this.worldQuaternion : this.identityQuaternion);
    this.unitZ.set(0, 0, 1).applyQuaternion(space === 'local' ? this.worldQuaternion : this.identityQuaternion);

    // Align the plane for current transform mode, axis and space.

    this.alignVector.copy(this.unitY);

    switch (this.mode) {
      case 'translate':
      case 'scale': {
        switch (this.axis) {
          case 'X': {
            this.alignVector.copy(this.eye).cross(this.unitX);
            this.dirVector.copy(this.unitX).cross(this.alignVector);
            break;
          }

          case 'Y': {
            this.alignVector.copy(this.eye).cross(this.unitY);
            this.dirVector.copy(this.unitY).cross(this.alignVector);
            break;
          }

          case 'Z': {
            this.alignVector.copy(this.eye).cross(this.unitZ);
            this.dirVector.copy(this.unitZ).cross(this.alignVector);
            break;
          }

          case 'XY': {
            this.dirVector.copy(this.unitZ);
            break;
          }

          case 'YZ': {
            this.dirVector.copy(this.unitX);
            break;
          }

          case 'XZ': {
            this.alignVector.copy(this.unitZ);
            this.dirVector.copy(this.unitY);
            break;
          }

          case 'XYZ':
          case 'E': {
            this.dirVector.set(0, 0, 0);
            break;
          }
        }

        break;
      }

      // eslint-disable-next-line unicorn/no-useless-switch-case -- exhaustive check
      case 'rotate':
      default: {
        // Special case for rotate
        this.dirVector.set(0, 0, 0);
      }
    }

    if (this.dirVector.length() === 0) {
      // If in rotate mode, make the plane parallel to camera
      this.quaternion.copy(this.cameraQuaternion);
    } else {
      this.tempMatrix.lookAt(this.tempVector.set(0, 0, 0), this.dirVector, this.alignVector);

      this.quaternion.setFromRotationMatrix(this.tempMatrix);
    }

    super.updateMatrixWorld();
  };
}

export { TransformControls, TransformControlsGizmo, TransformControlsPlane };
