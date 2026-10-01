import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  attribute,
  float,
  Fn as tslFunction,
  If as tslIf,
  mix,
  normalize,
  normalLocal,
  transformNormalToView,
  texture,
  uniform,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { FilamentUniforms } from '#components/printer/printer-filament-material.js';

/** Portable compact profile expansion with standard Three.js lighting and depth. */
export const createFilamentNodeMaterial = (handles: FilamentUniforms): MeshStandardNodeMaterial => {
  const mode = uniform(handles.mode.value);
  const fraction = uniform(handles.fraction.value);
  const layer = uniform(handles.layer.value);
  const emphasis = uniform(handles.emphasis.value);
  const maximum = uniform(handles.maximum.value);
  const low = uniform(handles.low.value);
  const high = uniform(handles.high.value);
  for (const [node, handle] of [
    [mode, handles.mode],
    [fraction, handles.fraction],
    [layer, handles.layer],
    [emphasis, handles.emphasis],
    [maximum, handles.maximum],
  ] as const) {
    Object.defineProperty(node, 'value', {
      get: () => handle.value,
      set: (value: number) => {
        handle.value = value;
      },
    });
  }
  const start = attribute<'vec3'>('aStart', 'vec3');
  const end = attribute<'vec3'>('aEnd', 'vec3');
  const dimensions = attribute<'vec4'>('aDimensions', 'vec4');
  const joins = attribute<'vec4'>('aJoins', 'vec4');
  const profile = attribute<'vec4'>('aProfile', 'vec4');
  const metrics = attribute<'vec2'>('aMetrics', 'vec2');
  const role = attribute<'float'>('aRole', 'float');
  const axis = normalize(end.xy.sub(start.xy));
  const lateral = vec2(axis.y.negate(), axis.x);
  const material = new MeshStandardNodeMaterial({
    roughness: 0.68,
    metalness: 0,
    depthWrite: true,
    depthTest: true,
    transparent: false,
  });
  material.positionNode = tslFunction(() => {
    const radius = dimensions.y.mul(0.5);
    const across = profile.w
      .mul(dimensions.x.sub(dimensions.y).max(0))
      .mul(0.5)
      .add(profile.y.mul(dimensions.x.min(dimensions.y)).mul(0.5));
    const finish = joins.zw.toVar();
    tslIf(fraction.lessThan(1), () => {
      finish.assign(lateral);
    });
    return mix(start, end, profile.x.mul(fraction)).add(
      vec3(mix(joins.xy, finish, profile.x).mul(across), profile.z.sub(1).mul(radius)),
    );
  })();
  const horizontal: Node<'vec2'> = lateral
    .mul(normalLocal.x)
    .mul(dimensions.y.div(dimensions.x.min(dimensions.y)))
    .add(axis.mul(normalLocal.z));
  const objectNormal = vec3(horizontal.x, horizontal.y, normalLocal.y);
  const interpolatedNormal: Node<'vec3'> = varying<'vec3'>(objectNormal);
  const surfaceNormal: Node<'vec3'> = normalize(interpolatedNormal);
  material.normalNode = transformNormalToView(surfaceNormal);
  material.colorNode = varying<'vec3'>(
    tslFunction(() => {
      const row = float(0).toVar();
      tslIf(mode.greaterThan(0.5), () => {
        row.assign(role.add(1));
      });
      const color = texture(
        handles.palette.value,
        vec2(dimensions.w.add(0.5).div(64), row.add(0.5).div(16)),
      ).rgb.toVar();
      tslIf(mode.greaterThan(1.5), () => {
        const value = dimensions.x.toVar();
        tslIf(mode.greaterThan(2.5), () => {
          value.assign(metrics.x);
        });
        tslIf(mode.greaterThan(3.5), () => {
          value.assign(metrics.y);
        });
        color.assign(mix(low, high, value.div(maximum.max(0.000001)).clamp(0, 1)));
      });
      tslIf(dimensions.z.sub(layer).abs().lessThan(0.5), () => {
        color.assign(mix(color, vec3(1), emphasis));
      });
      return color;
    })(),
  );
  return material;
};
