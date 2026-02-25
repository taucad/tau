import * as THREE from 'three';
import type { CameraAngle, ScreenshotOptions } from '#screenshot/types.js';
import { applyMatcapToClonedScene, disposeClonedSceneMaterials } from '#materials/gltf-matcap.js';
import { ensureMatcapTextureLoaded } from '#materials/matcap-material.js';
import { defaultStageOptions } from '#react/stage.js';
import { computeViewFittingZoom } from '#utils/camera.utils.js';
import { calculateFovDistanceCompensation } from '#utils/math.utils.js';

const defaultOptions = {
  aspectRatio: 16 / 9,
  zoomLevel: 1.25,
  cameraAngles: [{ phi: undefined, theta: undefined }] as CameraAngle[],
  output: {
    format: 'image/png' as const,
    quality: 0.92,
    isPreview: true,
  },
} satisfies ScreenshotOptions;

/**
 * Capture one or more screenshots of a Three.js scene from the given camera
 * angles. The function creates a temporary off-screen renderer, applies matcap
 * materials for lighting-independent rendering, and returns an array of data
 * URLs — one per camera angle.
 */
export async function captureScreenshot({
  gl,
  scene,
  camera,
  options,
}: {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  options?: ScreenshotOptions;
}): Promise<string[]> {
  if (!gl.domElement.isConnected) {
    throw new Error('Screenshot attempted on disconnected canvas - canvas may have been recreated');
  }

  const config = {
    ...defaultOptions,
    ...options,
    output: {
      ...defaultOptions.output,
      ...options?.output,
    },
  };

  if (config.cameraAngles.length === 0) {
    config.cameraAngles = defaultOptions.cameraAngles;
  }

  const originalHeight = gl.domElement.height;

  const targetAspect = config.aspectRatio;
  let width = Math.round(originalHeight * targetAspect);
  let height = originalHeight;

  if (config.maxResolution) {
    const maxDimension = Math.max(width, height);
    if (maxDimension > config.maxResolution) {
      const scale = config.maxResolution / maxDimension;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  }

  const screenshotCanvas = document.createElement('canvas');
  screenshotCanvas.width = width;
  screenshotCanvas.height = height;

  const screenshotRenderer = new THREE.WebGLRenderer({
    canvas: screenshotCanvas,
    alpha: true,
    antialias: true,
    logarithmicDepthBuffer: true,
  });

  try {
    screenshotRenderer.setSize(width, height, false);

    const useHighDpi = config.cameraAngles.length === 1;
    const pixelRatio = useHighDpi ? gl.getPixelRatio() : 1;
    screenshotRenderer.setPixelRatio(pixelRatio);

    screenshotRenderer.outputColorSpace = gl.outputColorSpace;

    // Matcap materials produce values in displayable range — no filmic
    // tone-mapping curve needed.
    screenshotRenderer.toneMapping = THREE.NoToneMapping;
    screenshotRenderer.toneMappingExposure = 1;

    const dataUrls: string[] = [];

    const screenshotScene = scene.clone();

    if (config.output.isPreview) {
      screenshotScene.traverse((object) => {
        if (object.userData['isPreviewOnly']) {
          object.visible = false;
        }
      });
    }

    // Replace all mesh materials with matcap for lighting-independent rendering.
    const matcapTexture = await ensureMatcapTextureLoaded();
    applyMatcapToClonedScene(screenshotScene, matcapTexture);

    screenshotScene.environment = null;
    screenshotScene.environmentIntensity = 0;

    // Compute bounding-box center and sphere radius so the camera orbits and
    // frames the actual model rather than the world origin.
    const boundingBox = new THREE.Box3().setFromObject(screenshotScene);
    const geometryCenter = new THREE.Vector3();
    const boundingSphere = new THREE.Sphere();
    boundingBox.getCenter(geometryCenter);
    boundingBox.getBoundingSphere(boundingSphere);
    const geometryRadius = boundingSphere.radius > 0 ? boundingSphere.radius : 1000;

    for (const cameraAngle of config.cameraAngles) {
      const screenshotCamera = (camera as THREE.PerspectiveCamera).clone();

      // Fix FOV to 45° for consistent perspective across all screenshots.
      // Compensate zoom so the same visible area is preserved.
      const screenshotFov = 45;
      const zoomCompensation = calculateFovDistanceCompensation(screenshotFov, screenshotCamera.fov, 1);
      screenshotCamera.fov = screenshotFov;
      screenshotCamera.zoom = config.zoomLevel * zoomCompensation;
      screenshotCamera.aspect = config.aspectRatio;

      if (cameraAngle.phi !== undefined && cameraAngle.theta !== undefined) {
        const standardFov = 60;
        const adjustedOffsetRatio =
          defaultStageOptions.offsetRatio * calculateFovDistanceCompensation(standardFov, screenshotFov, 1);
        const distance = geometryRadius * adjustedOffsetRatio;

        const phiRad = (cameraAngle.phi * Math.PI) / 180;
        const thetaRad = (cameraAngle.theta * Math.PI) / 180;

        const upVector = THREE.Object3D.DEFAULT_UP.clone();

        let ox: number;
        let oy: number;
        let oz: number;

        if (upVector.z === 1) {
          ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          oy = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          oz = distance * Math.cos(phiRad);
        } else if (upVector.y === 1) {
          ox = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          oz = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          oy = distance * Math.cos(phiRad);
        } else {
          oy = distance * Math.sin(phiRad) * Math.cos(thetaRad);
          oz = distance * Math.sin(phiRad) * Math.sin(thetaRad);
          ox = distance * Math.cos(phiRad);
        }

        screenshotCamera.position.set(geometryCenter.x + ox, geometryCenter.y + oy, geometryCenter.z + oz);
        screenshotCamera.lookAt(geometryCenter);

        screenshotCamera.zoom = computeViewFittingZoom({
          cameraPosition: screenshotCamera.position,
          target: geometryCenter,
          boundingBox,
          fovDeg: screenshotFov,
          aspectRatio: config.aspectRatio,
        });
      }

      screenshotCamera.updateProjectionMatrix();
      screenshotCamera.updateMatrixWorld(true);

      screenshotRenderer.render(screenshotScene, screenshotCamera);

      // eslint-disable-next-line no-await-in-loop -- sequential processing required for shared canvas
      const blob = await new Promise<Blob | undefined>((resolve) => {
        const mimeType = config.output.format;
        const quality = mimeType === 'image/jpeg' || mimeType === 'image/webp' ? config.output.quality : undefined;

        screenshotCanvas.toBlob(
          (result) => {
            resolve(result ?? undefined);
          },
          mimeType,
          quality,
        );
      });

      if (!blob) {
        throw new Error('Failed to create blob from canvas');
      }

      // eslint-disable-next-line no-await-in-loop -- sequential processing required for shared canvas
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
          resolve(reader.result as string);
        });
        reader.addEventListener('error', reject);
        reader.readAsDataURL(blob);
      });

      dataUrls.push(dataUrl);
    }

    disposeClonedSceneMaterials(screenshotScene);

    return dataUrls;
  } finally {
    screenshotRenderer.dispose();
    screenshotRenderer.forceContextLoss();
    screenshotCanvas.width = 0;
    screenshotCanvas.height = 0;
  }
}
