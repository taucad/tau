// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import type { Geometry } from '@taucad/types';
import { VerificationOverlay } from '#routes/_index/demo/verification-overlay.js';

// Box edge (metres) the mocked GLTF loader reports; each test sets it before render.
let mockBoxEdgeMetres = 0.1;

vi.mock('three/addons', () => ({
  GLTFLoader: class {
    async parseAsync(): Promise<{ scene: THREE.Object3D }> {
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(mockBoxEdgeMetres, mockBoxEdgeMetres, mockBoxEdgeMetres)));
      return { scene };
    }
  },
}));

const gltfGeometry = { format: 'gltf', content: new Uint8Array(8) } as unknown as Geometry;

describe('VerificationOverlay', () => {
  beforeEach(() => {
    mockBoxEdgeMetres = 0.1;
  });

  it('should show geometry as valid once geometry is present', () => {
    render(<VerificationOverlay geometry={gltfGeometry} />);

    expect(screen.getByText('Geometry valid')).toBeInTheDocument();
  });

  it('should pass the print-bed check for a model that fits (100 mm)', async () => {
    mockBoxEdgeMetres = 0.1; // 100 mm, under the 220 mm bed
    render(<VerificationOverlay geometry={gltfGeometry} />);

    await waitFor(() => {
      expect(screen.getByText(/Fits 220 mm bed \(100 mm\)/)).toBeInTheDocument();
    });
  });

  it('should report the real measured dimension for an oversized model (300 mm)', async () => {
    mockBoxEdgeMetres = 0.3; // 300 mm, over the 220 mm bed
    render(<VerificationOverlay geometry={gltfGeometry} />);

    await waitFor(() => {
      expect(screen.getByText(/Fits 220 mm bed \(300 mm\)/)).toBeInTheDocument();
    });
  });
});
