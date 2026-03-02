import { Injectable, Logger } from '@nestjs/common';
import { NodeIO } from '@gltf-transform/core';
import { inspect } from '@gltf-transform/functions';
import type {
  TestModelOutput,
  TestFailure,
  TestPass,
  MeasurementTestRequirement,
  BoundingBoxExpected,
} from '@taucad/chat';
import { boundingBoxExpectedSchema } from '@taucad/chat';

const DEFAULT_TOLERANCE = 0.1;

type GeometryStats = {
  vertexCount: number;
  meshCount: number;
  boundingBox?: {
    size: [number, number, number];
    center: [number, number, number];
  };
};

@Injectable()
export class GeometryAnalysisService {
  private readonly logger = new Logger(GeometryAnalysisService.name);

  public async runMeasurementTests(
    glb: Uint8Array,
    requirements: MeasurementTestRequirement[],
  ): Promise<TestModelOutput> {
    this.logger.log(`Running ${requirements.length} measurement tests`);

    let stats: GeometryStats;
    try {
      stats = await this.analyzeGlb(glb);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`GLB analysis failed: ${message}`);
      return {
        failures: requirements.map((r) => ({
          id: r.id,
          requirement: r.description,
          reason: `GLB analysis failed: ${message}`,
          suggestion: 'Ensure the model compiles and produces valid geometry.',
        })),
        passes: [],
        passed: 0,
        total: requirements.length,
      };
    }

    const failures: TestFailure[] = [];
    const passes: TestPass[] = [];

    for (const requirement of requirements) {
      const result = this.evaluateRequirement(requirement, stats);
      if (result.passed) {
        passes.push({ id: requirement.id, requirement: requirement.description });
      } else {
        failures.push({
          id: requirement.id,
          requirement: requirement.description,
          reason: result.reason,
          suggestion: result.suggestion,
        });
      }
    }

    this.logger.log(`Measurement results: ${passes.length} passed, ${failures.length} failed`);

    return {
      failures,
      passes,
      passed: passes.length,
      total: requirements.length,
    };
  }

  private async analyzeGlb(glb: Uint8Array): Promise<GeometryStats> {
    const io = new NodeIO();
    // Node.js Buffers from Socket.IO may have a non-zero byteOffset into a
    // shared pool ArrayBuffer (https://github.com/nodejs/node/issues/2888).
    // gltf-transform's GLB parser creates Uint32Array views at glb.byteOffset,
    // which requires 4-byte alignment. Copying into a fresh Uint8Array
    // guarantees byteOffset === 0.
    //
    // See also: https://github.com/donmccurdy/glTF-Transform/pull/447
    // See also: https://stackoverflow.com/a/31483629
    const aligned = glb.byteOffset % 4 === 0 ? glb : new Uint8Array(glb);
    const document = await io.readBinary(aligned);
    const report = inspect(document);

    const vertexCount = report.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
    const meshCount = report.meshes.properties.length;

    let boundingBox: GeometryStats['boundingBox'];
    if (report.scenes.properties.length > 0) {
      const scene = report.scenes.properties[0]!;
      if (scene.bboxMax.length >= 3 && scene.bboxMin.length >= 3) {
        boundingBox = {
          size: [
            scene.bboxMax[0]! - scene.bboxMin[0]!,
            scene.bboxMax[1]! - scene.bboxMin[1]!,
            scene.bboxMax[2]! - scene.bboxMin[2]!,
          ],
          center: [
            (scene.bboxMax[0]! + scene.bboxMin[0]!) / 2,
            (scene.bboxMax[1]! + scene.bboxMin[1]!) / 2,
            (scene.bboxMax[2]! + scene.bboxMin[2]!) / 2,
          ],
        };
      }
    }

    return { vertexCount, meshCount, boundingBox };
  }

  private evaluateRequirement(
    requirement: MeasurementTestRequirement,
    stats: GeometryStats,
  ): { passed: boolean; reason: string; suggestion: string } {
    const tolerance = requirement.tolerance ?? DEFAULT_TOLERANCE;

    switch (requirement.check) {
      case 'boundingBox': {
        return this.checkBoundingBox(requirement, stats, tolerance);
      }

      case 'meshCount': {
        const expected = (requirement.expected as { count?: number } | undefined)?.count;
        if (expected === undefined) {
          return { passed: false, reason: 'Missing expected.count', suggestion: 'Add expected: { count: N }' };
        }

        if (stats.meshCount !== expected) {
          return {
            passed: false,
            reason: `Mesh count: expected ${expected}, got ${stats.meshCount}`,
            suggestion: `Adjust the model to produce ${expected} mesh(es).`,
          };
        }

        return { passed: true, reason: '', suggestion: '' };
      }

      case 'vertexCount': {
        const expected = (requirement.expected as { count?: number } | undefined)?.count;
        if (expected === undefined) {
          return { passed: false, reason: 'Missing expected.count', suggestion: 'Add expected: { count: N }' };
        }

        if (Math.abs(stats.vertexCount - expected) > tolerance) {
          return {
            passed: false,
            reason: `Vertex count: expected ${expected} (±${tolerance}), got ${stats.vertexCount}`,
            suggestion: `Model has ${stats.vertexCount} vertices, expected ~${expected}.`,
          };
        }

        return { passed: true, reason: '', suggestion: '' };
      }

      default: {
        return {
          passed: false,
          reason: `Unknown check type: ${requirement.check}`,
          suggestion: 'Use one of: boundingBox, meshCount, vertexCount',
        };
      }
    }
  }

  private checkBoundingBox(
    requirement: MeasurementTestRequirement,
    stats: GeometryStats,
    tolerance: number,
  ): { passed: boolean; reason: string; suggestion: string } {
    if (!stats.boundingBox) {
      return {
        passed: false,
        reason: 'No bounding box available (model may have no geometry)',
        suggestion: 'Ensure the model produces visible geometry.',
      };
    }

    const parseResult = boundingBoxExpectedSchema.safeParse(requirement.expected);
    if (!parseResult.success) {
      const zodErrors = parseResult.error.issues.map((issue) => issue.message).join('; ');
      return {
        passed: false,
        reason: `Invalid expected value for boundingBox check: ${zodErrors}`,
        suggestion:
          'Use expected: { size: { x, y, z }, center: { x, y, z } }. ' +
          'Each axis is optional — specify only the axes you want to check.',
      };
    }

    const expected: BoundingBoxExpected = parseResult.data;
    const reasons: string[] = [];

    if (expected.size) {
      const axes = ['x', 'y', 'z'] as const;
      for (const [i, axis] of axes.entries()) {
        const exp = expected.size[axis];
        if (exp === undefined) {
          continue;
        }

        const actual = stats.boundingBox.size[i]!;
        if (Math.abs(actual - exp) > tolerance) {
          reasons.push(`size.${axis}: expected ${exp} (±${tolerance}), got ${actual.toFixed(3)}`);
        }
      }
    }

    if (expected.center) {
      const axes = ['x', 'y', 'z'] as const;
      for (const [i, axis] of axes.entries()) {
        const exp = expected.center[axis];
        if (exp === undefined) {
          continue;
        }

        const actual = stats.boundingBox.center[i]!;
        if (Math.abs(actual - exp) > tolerance) {
          reasons.push(`center.${axis}: expected ${exp} (±${tolerance}), got ${actual.toFixed(3)}`);
        }
      }
    }

    if (reasons.length > 0) {
      return {
        passed: false,
        reason: `Bounding box mismatch: ${reasons.join('; ')}`,
        suggestion: 'Adjust model dimensions or parameters to match expected bounding box.',
      };
    }

    return { passed: true, reason: '', suggestion: '' };
  }
}
