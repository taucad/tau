export const gltfEdgeDepthBiasFactor = 0.999;

export const gltfEdgeDepthBiasReferenceTanHalfFov = Math.tan(Math.PI / 6);

/** View-space edge pull reached by the perspective bias as FOV tends to zero. */
export const gltfEdgeOrthographicDepthBiasCoefficient =
  -Math.log(gltfEdgeDepthBiasFactor) / gltfEdgeDepthBiasReferenceTanHalfFov;

export type GltfEdgeDepthBiasOptions = {
  depthBias: number;
  fovDeg: number;
};

export const calculateGltfEdgeAdjustedDepthBias = ({ depthBias, fovDeg }: GltfEdgeDepthBiasOptions): number => {
  const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
  const fovScale = tanHalfFov / gltfEdgeDepthBiasReferenceTanHalfFov;

  return depthBias ** fovScale;
};
