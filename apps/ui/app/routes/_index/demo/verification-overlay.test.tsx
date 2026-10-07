// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import type { Artifact } from '@taucad/runtime';
import { VerificationOverlay } from '#routes/_index/demo/verification-overlay.js';

// Box edge (metres) the mocked GLTF loader reports; each test sets it before render.
let mockBoxEdgeMetres = 0.1;
let parsedBuffer: ArrayBuffer | undefined;

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the `GLTFLoader` export name.
  GLTFLoader: class {
    public async parseAsync(buffer: ArrayBuffer): Promise<{ scene: THREE.Object3D }> {
      parsedBuffer = buffer;
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(mockBoxEdgeMetres, mockBoxEdgeMetres, mockBoxEdgeMetres)));
      return { scene };
    }
  },
}));

const gltfArtifact: Artifact = { mimeType: 'model/gltf-binary', content: new Uint8Array(8) };

describe('VerificationOverlay', () => {
  beforeEach(() => {
    mockBoxEdgeMetres = 0.1;
    parsedBuffer = undefined;
  });

  it('should parse only the GLB bytes in a subarray artifact', async () => {
    const content = new Uint8Array([99, 1, 2, 3, 88]).subarray(1, 4);
    render(<VerificationOverlay artifact={{ mimeType: 'model/gltf-binary', content }} />);
    await waitFor(() => {
      expect(parsedBuffer).toBeDefined();
    });
    expect(parsedBuffer).toEqual(new Uint8Array([1, 2, 3]).buffer);
  });

  it('should show geometry as valid once geometry is present', async () => {
    render(<VerificationOverlay artifact={gltfArtifact} />);

    expect(screen.getByText('Geometry valid')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Fits 220 mm bed \(100 mm\)/)).toBeInTheDocument();
    });
  });

  it('should pass the print-bed check for a model that fits (100 mm)', async () => {
    mockBoxEdgeMetres = 0.1; // 100 mm, under the 220 mm bed
    render(<VerificationOverlay artifact={gltfArtifact} />);

    await waitFor(() => {
      expect(screen.getByText(/Fits 220 mm bed \(100 mm\)/)).toBeInTheDocument();
    });
  });

  it('should report the real measured dimension for an oversized model (300 mm)', async () => {
    mockBoxEdgeMetres = 0.3; // 300 mm, over the 220 mm bed
    render(<VerificationOverlay artifact={gltfArtifact} />);

    await waitFor(() => {
      expect(screen.getByText(/Fits 220 mm bed \(300 mm\)/)).toBeInTheDocument();
    });
  });
});
