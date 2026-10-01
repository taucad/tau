import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mock } from 'vitest-mock-extended';
import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { createFilamentMaterial, createFilamentUniforms } from '#components/printer/printer-filament-material.js';
import { createFilamentNodeMaterial } from '#components/printer/printer-filament-material.node.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';
import { beadJoin, beadProfilePoint, createBeadData } from '#components/printer/printer-bead-data.js';
import { groupToolpath } from '#components/printer/printer-toolpath-groups.js';
import { fixtureProgram } from '#components/printer/testing/toolpath-fixture.js';

const texture = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
describe('filament shape and material contract', () => {
  it('should retain exact bead extents and bounded joins, including decreasing-coordinate bounds', () => {
    expect(beadProfilePoint(0.45, 0.2, 0)[0]).toBeCloseTo(0.225);
    expect(beadProfilePoint(0.1, 0.2, 0)[0]).toBeCloseTo(0.05);
    expect(beadProfilePoint(0.45, 0.2, Math.PI / 2)[1]).toBeCloseTo(0);
    expect(beadProfilePoint(0.45, 0.2, -Math.PI / 2)[1]).toBeCloseTo(-0.2);
    expect(beadJoin([1, 0], [0, 1])).toEqual([1, 1]);
    expect(beadJoin([1, 0], [-1, 0])).toEqual([-1, 0]);
    const program = fixtureProgram({ layers: 2 });
    const data = createBeadData(program, groupToolpath(program).groupOf);
    for (const chunk of data.chunks) {
      for (let i = 0; i < chunk.positions.length; i += 1) {
        const axis = i % 3;
        expect(chunk.positions[i]).toBeGreaterThanOrEqual(chunk.min[axis]!);
        expect(chunk.positions[i]).toBeLessThanOrEqual(chunk.max[axis]!);
      }
    }
  });
  it('should guard generated shader anchors and preserve standard lit opaque depth', () => {
    const material = createFilamentMaterial(createFilamentUniforms(texture));
    const shader = mock<WebGLProgramParametersWithUniforms>({
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {},
    });
    material.onBeforeCompile(shader, mock<WebGLRenderer>());
    expect(shader.vertexShader).toContain('aProfile.z - 1.0');
    expect(shader.vertexShader).toContain('uFraction < 1.0 ? lateral');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= vFilamentColor');
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    const invalid = mock<WebGLProgramParametersWithUniforms>({ vertexShader: '', fragmentShader: '', uniforms: {} });
    expect(() => {
      material.onBeforeCompile(invalid, mock<WebGLRenderer>());
    }).toThrow('Filament shader expects one');
    material.dispose();
  });
  it('should match the stable stripped filament node graph', () => {
    const material = createFilamentNodeMaterial(createFilamentUniforms(texture));
    expect(serialiseStrippedTslGraph(material.toJSON())).toMatchSnapshot();
    material.dispose();
  });
});
