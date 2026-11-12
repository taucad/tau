export type RequiredWebGpuProfile = 'hardware' | 'software';
export type WebGpuLaunchProfile = 'disabled' | RequiredWebGpuProfile;

export type WebGpuAdapterIdentity = Readonly<{
  architecture: string;
  description: string;
  device: string;
  fallback: boolean | undefined;
  vendor: string;
}>;

export const resolveRequiredWebGpuProfile = (value: string | undefined = 'hardware'): RequiredWebGpuProfile => {
  const profile = value;
  if (profile === 'hardware' || profile === 'software') {
    return profile;
  }
  throw new Error(`TAU_E2E_WEBGPU_PROFILE must be 'software' or 'hardware'; received '${profile}'.`);
};

export const webGpuLaunchArguments = (profile: WebGpuLaunchProfile): readonly string[] => {
  if (profile === 'software') {
    return ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader'];
  }
  if (profile === 'hardware') {
    return ['--enable-unsafe-webgpu'];
  }
  return ['--disable-features=WebGPUService'];
};

export const classifyWebGpuAdapter = (adapter: WebGpuAdapterIdentity): 'ambiguous' | 'hardware' | 'software' => {
  if (adapter.fallback === true) {
    return 'software';
  }
  const identity = [adapter.vendor, adapter.architecture, adapter.device, adapter.description]
    .join(' ')
    .trim()
    .toLowerCase();
  if (identity.length === 0) {
    return 'ambiguous';
  }
  if (/swiftshader|llvmpipe|software|cpu/u.test(identity)) {
    return 'software';
  }
  return 'hardware';
};
