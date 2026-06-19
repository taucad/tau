import { boundingBoxExpectedSchema } from '#schemas.js';
import type { MeasurementTestRequirement, BoundingBoxExpected } from '#schemas.js';
import type {
  BoundingBoxAxisExtremum,
  BoundingBoxAxisFailure,
  BoundingBoxFailure,
  CheckResult,
  ConnectedComponentsFailure,
  GeometryStats,
  PrimitiveRecord,
  WatertightFailure,
} from '#geometry/types.js';

const defaultTolerance = 0.1;

/**
 * Default AABB-overlap tolerance (mm) for the `connectedComponents` check.
 * Mirrors the schema description so the prompt copy and the runtime stay in
 * lockstep when the default ever changes.
 * @public
 */
export const defaultConnectedToleranceMm = 0.1;

const pickMinExtremum = (
  primitives: readonly PrimitiveRecord[],
  axisIndex: 0 | 1 | 2,
): BoundingBoxAxisExtremum | undefined => {
  if (primitives.length === 0) {
    return undefined;
  }
  let best = primitives[0]!;
  for (const p of primitives) {
    if (p.aabb.min[axisIndex] < best.aabb.min[axisIndex]) {
      best = p;
    }
  }
  return {
    name: best.name,
    aabb: best.aabb,
    value: best.aabb.min[axisIndex],
  };
};

const pickMaxExtremum = (
  primitives: readonly PrimitiveRecord[],
  axisIndex: 0 | 1 | 2,
): BoundingBoxAxisExtremum | undefined => {
  if (primitives.length === 0) {
    return undefined;
  }
  let best = primitives[0]!;
  for (const p of primitives) {
    if (p.aabb.max[axisIndex] > best.aabb.max[axisIndex]) {
      best = p;
    }
  }
  return {
    name: best.name,
    aabb: best.aabb,
    value: best.aabb.max[axisIndex],
  };
};

const renderBoundingBoxFailure = (failure: BoundingBoxFailure): { reason: string; suggestion: string } => {
  const lines: string[] = ['Bounding box mismatch:'];
  const suggestionNames = new Set<string>();

  for (const ax of failure.axisFailures) {
    const minE = ax.minExtremum;
    const maxE = ax.maxExtremum;
    let line = `- ${ax.field}.${ax.axis}: expected ${ax.expected} (±${ax.tolerance}), got ${ax.actual.toFixed(3)}`;
    if (minE && maxE) {
      line += ` — extends from '${minE.name}' (${ax.axis}.min=${minE.value.toFixed(3)}) to '${maxE.name}' (${ax.axis}.max=${maxE.value.toFixed(3)})`;
      suggestionNames.add(minE.name);
      suggestionNames.add(maxE.name);
    }
    lines.push(line);
  }

  const names = [...suggestionNames];
  const suggestion =
    names.length > 0
      ? `Adjust model dimensions or parameters so the scene matches the expected bounding box. Parts contributing to the checked extents: ${names.map((n) => `'${n}'`).join(', ')}.`
      : 'Adjust model dimensions or parameters to match expected bounding box.';

  return {
    reason: lines.join('\n'),
    suggestion,
  };
};

const renderConnectedComponentsFailure = (
  failure: ConnectedComponentsFailure,
): { reason: string; suggestion: string } => {
  const header = `Connected components: expected ${failure.expected}, got ${failure.got} (tolerance: ${failure.toleranceMm}mm)`;
  const clusterLines = failure.clusters.map((c) => {
    const primList = c.primitives.map((p) => p.name).join(', ');
    return `- Cluster ${c.label} (${c.totalVertices} verts): ${primList}`;
  });
  const gapLines =
    failure.gaps.length > 0
      ? failure.gaps.map(
          (g) =>
            `- Clearance ${g.fromLabel}↔${g.toLabel}: ≈${g.gapMm.toFixed(2)}mm along ${g.axis} (nearest primitives '${g.fromPrimitive}' ↔ '${g.toPrimitive}')`,
        )
      : [];
  const reason = [
    header,
    '',
    'Clusters:',
    ...clusterLines,
    ...(gapLines.length > 0 ? ['', 'Spatial gaps:', ...gapLines] : []),
  ].join('\n');

  const raisedTolerance = Math.max(failure.toleranceMm * 10, 1);

  if (failure.got > failure.expected) {
    const byFewestVerts = [...failure.clusters].sort((a, b) => {
      if (a.totalVertices !== b.totalVertices) {
        return a.totalVertices - b.totalVertices;
      }
      return a.label.localeCompare(b.label);
    });
    const smallest = byFewestVerts.at(0);
    const top = byFewestVerts.at(-1);
    const firstGap = failure.gaps.at(0);
    let suggestion = `Got ${failure.got} disjoint chunks at ${failure.toleranceMm}mm tolerance. If parts visibly touch, raise tolerance (e.g. tolerance: ${raisedTolerance}). If parts are intentionally separate, raise expected.count to ${failure.got}. If you want them welded into one solid, fuse them in the kernel and assert watertight on the resulting part.`;
    if (smallest && top && firstGap && smallest !== top) {
      suggestion += ` Smallest cluster is ${smallest.label} ('${smallest.primitives.map((p) => p.name).join(', ')}') — translate it ~${firstGap.gapMm.toFixed(1)}mm along ${firstGap.axis} toward cluster ${top.label} to close the gap between '${firstGap.fromPrimitive}' and '${firstGap.toPrimitive}'.`;
    }
    return { reason, suggestion };
  }

  const suggestion =
    `Got ${failure.got} disjoint chunks (fewer than expected). Either lower expected.count to ` +
    `${failure.got} or split the model so it returns ${failure.expected} top-level shapes.`;

  return { reason, suggestion };
};

const renderWatertightFailure = (failure: WatertightFailure): { reason: string; suggestion: string } => {
  const sorted = [...failure.perPrimitive].sort((a, b) => b.boundaryEdges - a.boundaryEdges);
  const clusterLines = failure.irregularEdgeClusters.map((cluster, index) => {
    const [cx, cy, cz] = cluster.aabb.center;
    const samples = cluster.samples
      .map((sample) => {
        const [sx, sy, sz] = sample.center;
        const primitives =
          sample.primitives.length > 0 ? ` primitives=${sample.primitives.map((name) => `'${name}'`).join(', ')}` : '';
        return `sample≈[${sx.toFixed(4)}, ${sy.toFixed(4)}, ${sz.toFixed(4)}] triangles=${sample.incidentTriangleCount}${primitives}`;
      })
      .join('; ');
    return `- Cluster ${index + 1} (${cluster.kind}, ${cluster.edgeCount} edges, center≈[${cx.toFixed(4)}, ${cy.toFixed(4)}, ${cz.toFixed(4)}]): ${samples}`;
  });
  const lines: string[] = [
    `Mesh is not watertight: ${failure.irregularEdges} irregular edges (open boundary: ${failure.openBoundaryEdges}, non-manifold: ${failure.nonManifoldEdges}, ${(failure.irregularEdgeFraction * 100).toFixed(2)}% of edges)`,
    '',
    'Per-primitive boundary edges:',
    ...sorted.map((p) => {
      const [cx, cy, cz] = p.loopCentroid;
      return `- '${p.name}': ${p.boundaryEdges} edges (boundary centroid ≈[${cx.toFixed(4)}, ${cy.toFixed(4)}, ${cz.toFixed(4)}])`;
    }),
    ...(clusterLines.length > 0 ? ['', 'Irregular edge clusters:', ...clusterLines] : []),
  ];
  const top = sorted.at(0);
  const suggestionPrefix =
    failure.nonManifoldEdges > 0 && failure.openBoundaryEdges === 0
      ? 'The surface has over-adjacent or coincident triangles rather than open holes. Check overlapping boolean operands, duplicate shells, or kernel export canonicalization before GLB writing. '
      : 'The surface has gaps. ';
  const suggestion =
    suggestionPrefix +
    'If you are asserting on an assembled main.ts that returns ' +
    'multiple ShapeConfigs, move this requirement into each lib/<part>.ts entry instead — ' +
    'multi-part assemblies are watertight per part, not as one mesh. Otherwise check for ' +
    'failed boolean ops (use screenshot to inspect) or replace Compound with proper fuse.' +
    (top ? ` Worst offender: '${top.name}' (${top.boundaryEdges} boundary edges).` : '');
  return { reason: lines.join('\n'), suggestion };
};

const checkBoundingBox = (
  requirement: MeasurementTestRequirement,
  stats: GeometryStats,
  tolerance: number,
): CheckResult => {
  if (!stats.boundingBox) {
    return {
      passed: false,
      check: 'invalid',
      reason: 'No bounding box available (model may have no geometry)',
      suggestion: 'Ensure the model produces visible geometry.',
    };
  }

  const parseResult = boundingBoxExpectedSchema.safeParse(requirement.expected);
  if (!parseResult.success) {
    const zodErrors = parseResult.error.issues.map((issue) => issue.message).join('; ');
    return {
      passed: false,
      check: 'invalid',
      reason: `Invalid expected value for boundingBox check: ${zodErrors}`,
      suggestion:
        'Use expected: { size: { x, y, z }, center: { x, y, z } }. ' +
        'Each axis is optional — specify only the axes you want to check.',
    };
  }

  const expected: BoundingBoxExpected = parseResult.data;

  // oxlint-disable-next-line unicorn/explicit-length-check -- false positive, oxlint matched on Set.prototype.size
  if (!expected.size && !expected.center) {
    return {
      passed: false,
      check: 'invalid',
      reason: 'Bounding box check requires at least size or center',
      suggestion: 'Provide size and/or center constraints in the expected parameter.',
    };
  }

  const axisFailures: BoundingBoxAxisFailure[] = [];
  const { primitives } = stats.boundingBox;

  // oxlint-disable-next-line unicorn/explicit-length-check -- false positive check against Set.prototype.entries
  if (expected.size) {
    const axes = ['x', 'y', 'z'] as const;
    const axisIndices = [0, 1, 2] as const;
    for (const axisIndex of axisIndices) {
      const axis = axes[axisIndex];
      const exp = expected.size[axis];
      if (exp === undefined) {
        continue;
      }

      const actual = stats.boundingBox.size[axisIndex];
      if (Math.abs(actual - exp) > tolerance) {
        axisFailures.push({
          axis,
          field: 'size',
          expected: exp,
          actual,
          tolerance,
          minExtremum: pickMinExtremum(primitives, axisIndex),
          maxExtremum: pickMaxExtremum(primitives, axisIndex),
        });
      }
    }
  }

  if (expected.center) {
    const axes = ['x', 'y', 'z'] as const;
    const axisIndices = [0, 1, 2] as const;
    for (const axisIndex of axisIndices) {
      const axis = axes[axisIndex];
      const exp = expected.center[axis];
      if (exp === undefined) {
        continue;
      }

      const actual = stats.boundingBox.center[axisIndex];
      if (Math.abs(actual - exp) > tolerance) {
        axisFailures.push({
          axis,
          field: 'center',
          expected: exp,
          actual,
          tolerance,
          minExtremum: pickMinExtremum(primitives, axisIndex),
          maxExtremum: pickMaxExtremum(primitives, axisIndex),
        });
      }
    }
  }

  if (axisFailures.length > 0) {
    const failure: BoundingBoxFailure = { axisFailures };
    const { reason, suggestion } = renderBoundingBoxFailure(failure);
    return {
      passed: false,
      check: 'boundingBox',
      reason,
      suggestion,
      failure,
    };
  }

  return { passed: true };
};

/**
 * Evaluates a single measurement requirement against geometry stats.
 *
 * @param requirement - The measurement test requirement to evaluate
 * @param stats - The geometry statistics to check against
 * @returns A check result indicating pass/fail with reason and suggestion
 * @public
 */
export const evaluateRequirement = (requirement: MeasurementTestRequirement, stats: GeometryStats): CheckResult => {
  const tolerance = requirement.tolerance ?? defaultTolerance;

  switch (requirement.check) {
    case 'boundingBox': {
      return checkBoundingBox(requirement, stats, tolerance);
    }

    case 'connectedComponents': {
      const expected = (requirement.expected as { count?: number } | undefined)?.count;
      if (expected === undefined) {
        return {
          passed: false,
          check: 'invalid',
          reason: 'Missing expected.count',
          suggestion: 'Add expected: { count: N }',
        };
      }

      const ccTolerance = requirement.tolerance ?? defaultConnectedToleranceMm;
      const analysis = stats.analyseConnectedComponents(ccTolerance);
      const actual = analysis.count;
      if (actual !== expected) {
        const failure: ConnectedComponentsFailure = {
          expected,
          got: actual,
          toleranceMm: ccTolerance,
          clusters: analysis.clusters,
          gaps: analysis.gaps,
        };
        const { reason, suggestion } = renderConnectedComponentsFailure(failure);
        return {
          passed: false,
          check: 'connectedComponents',
          reason,
          suggestion,
          failure,
        };
      }

      return { passed: true };
    }

    case 'watertight': {
      const wt = stats.analyseWatertight();
      if (wt.watertight) {
        return { passed: true };
      }
      const failure: WatertightFailure = {
        irregularEdges: wt.irregularEdges,
        openBoundaryEdges: wt.openBoundaryEdges,
        nonManifoldEdges: wt.nonManifoldEdges,
        irregularEdgeKindCounts: wt.irregularEdgeKindCounts,
        irregularEdgeClusters: wt.irregularEdgeClusters,
        irregularEdgeFraction: wt.irregularEdgeFraction,
        perPrimitive: wt.perPrimitive,
      };
      const { reason, suggestion } = renderWatertightFailure(failure);
      return {
        passed: false,
        check: 'watertight',
        reason,
        suggestion,
        failure,
      };
    }

    default: {
      const _exhaustive: never = requirement.check;
      return {
        passed: false,
        check: 'invalid',
        reason: `Unknown check type: ${String(_exhaustive)}`,
        suggestion: 'Use one of: boundingBox, connectedComponents, watertight',
      };
    }
  }
};
