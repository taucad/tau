export const gltfEdgeDepthBiasFactor = 0.999;

export const gltfEdgeDepthBiasReferenceTanHalfFov = Math.tan(Math.PI / 6);

export type GltfEdgeDepthBiasOptions = {
  depthBias: number;
  fovDeg: number;
};

export const calculateGltfEdgeAdjustedDepthBias = ({ depthBias, fovDeg }: GltfEdgeDepthBiasOptions): number => {
  const tanHalfFov = Math.tan((fovDeg * Math.PI) / 360);
  const fovScale = tanHalfFov / gltfEdgeDepthBiasReferenceTanHalfFov;

  return depthBias ** fovScale;
};
