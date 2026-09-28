import { describe, it, expectGeo } from 'geospec';
import { loadModel } from 'geospec/model';

// Requirements precede geometry. All sizes are mm in each part's local frame.
const parts = [
  ['camera-front', { y: 31, z: 31 }],
  ['camera-rear', { x: 15.35, y: 34.8, z: 31 }],
  ['optical-dome', { x: 9.1, y: 12.2, z: 12.2 }],
  ['lens-retainer', { x: 3, y: 15.2, z: 15.2 }],
  ['camera-pcb', { x: 1.2, y: 13, z: 13 }],
  ['pitch-yoke', { x: 30.3, y: 45.6, z: 11.6 }],
  ['fixed-mount', { x: 9, y: 20, z: 3 }],
  ['bearing', { x: 8, y: 8, z: 3 }],
  ['shoulder-axle', { x: 4.2, y: 4.2, z: 8.9 }],
  ['actuator-body', { x: 8.8, y: 8.8, z: 4 }],
  ['actuator-shaft', { x: 2.9, y: 2.9, z: 4.6 }],
  ['shell-screw', { x: 3.6, y: 3.6, z: 11.6613 }],
  ['shell-nut', { x: 3.63731, y: 4.2, z: 1.5 }],
  ['mount-screw', { x: 3.6, y: 3.6, z: 9.6613 }],
  ['threaded-insert', { x: 3.2, y: 3.2, z: 4 }],
] as const;

describe('gimbal individual manufactured and purchased parts', () => {
  for (const [name, size] of parts) {
    const file = `parts/gimbal/${name}.ts`;
    it(`${name}: controlled local manufacturing envelope`, async () => {
      expectGeo(await loadModel({ file })).toHaveBoundingBox({
        size,
        tolerance: 0.06,
      });
    });
    it(`${name}: one closed printable or purchased solid`, async () => {
      const model = await loadModel({ file });
      expectGeo(model).toBeWatertight();
      expectGeo(model).toHaveConnectedComponents({ count: 1 });
    });
    it(`${name}: native closed valid STEP BRep`, async () => {
      const model = await loadModel({ file, format: 'step' });
      expectGeo(model).toBeValidBrep({
        closedShells: true,
        sameParameter: true,
      });
      expectGeo(model).toHaveTopologyCounts({ solids: 1 });
    });
  }

  it('rear housing: machined pitch spindle bores', async () => {
    expectGeo(
      await loadModel({ file: 'parts/gimbal/camera-rear.ts', format: 'step' }),
    ).toHaveCylindricalFace({ radius: 1.55, axis: 'y', tolerance: 0.001 });
  });
  it('front housing: camera port and two shell screw bores', async () => {
    const model = await loadModel({
      file: 'parts/gimbal/camera-front.ts',
      format: 'step',
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 7.8,
      axis: 'x',
      tolerance: 0.001,
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 1.1,
      axis: 'x',
      tolerance: 0.001,
    });
  });
  it('bearing: 3 mm through spindle bore', async () => {
    expectGeo(
      await loadModel({ file: 'parts/gimbal/bearing.ts', format: 'step' }),
    ).toHaveCircularHole({
      diameter: 3,
      axis: 'z',
      through: true,
      tolerance: 0.001,
    });
  });
  it('mount: two attachment clearance holes and central drive clearance', async () => {
    const model = await loadModel({
      file: 'parts/gimbal/fixed-mount.ts',
      format: 'step',
    });
    expectGeo(model).toHaveCircularHole({
      diameter: 2.2,
      axis: 'z',
      center: { x: 28.2, y: -7 },
      through: true,
      tolerance: 0.01,
    });
    expectGeo(model).toHaveCircularHole({
      diameter: 2.2,
      axis: 'z',
      center: { x: 28.2, y: 7 },
      through: true,
      tolerance: 0.01,
    });
    expectGeo(model).toHaveCircularHole({
      diameter: 3.2,
      axis: 'z',
      through: true,
      tolerance: 0.01,
    });
  });
  it('yoke: perpendicular pitch and yaw bearing seats', async () => {
    const model = await loadModel({
      file: 'parts/gimbal/pitch-yoke.ts',
      format: 'step',
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 4.15,
      axis: 'y',
      tolerance: 0.001,
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 4.15,
      axis: 'z',
      tolerance: 0.001,
    });
    expectGeo(model).toHaveCylindricalFace({
      radius: 4.55,
      axis: 'y',
      tolerance: 0.001,
    });
  });
});

describe('two axis gimbal assembly', () => {
  it('neutral: named parts and millimetres survive exact STEP assembly representation', async () => {
    const model = await loadModel({
      file: 'assemblies/gimbal.ts',
      format: 'step',
    });
    expectGeo(model).toHaveStepUnits({ unit: 'mm' });
    expectGeo(model).toBeValidBrep({ closedShells: true });
    expectGeo(model).toHaveProductStructure({
      names: [
        'GIM_camera_front_PA12',
        'GIM_camera_rear_PA12',
        'GIM_optical_dome_VENDOR_ENVELOPE',
        'GIM_pitch_yoke_PA12',
        'GIM_fixed_mount_PA12',
        'GIM_pitch_bearing_3x8x3',
        'GIM_yaw_bearing_3x8x3',
        'GIM_pitch_shoulder_axle',
        'GIM_mount_insert_M2_left',
        'GIM_mount_insert_M2_right',
      ],
    });
  });
  it('camera cartridge: nine closed separate component solids', async () => {
    const model = await loadModel({ file: 'assemblies/camera-cartridge.ts' });
    expectGeo(model).toBeWatertight();
    // Nested fasteners/optics overlap component AABBs; occurrence evidence counts parts.
    const step = await loadModel({
      file: 'assemblies/camera-cartridge.ts',
      format: 'step',
    });
    expectGeo(step).toHaveTopologyCounts({ solids: 9 });
    expectGeo(step).toBeValidBrep();
    expectGeo(step).toHaveNoComponentInterference({ tolerance: 0.001 });
    expectGeo(model).toHaveNoComponentInterference();
  });
  it('neutral: controlled front camera and mount location', async () => {
    expectGeo(
      await loadModel({ file: 'assemblies/gimbal.ts' }),
    ).toHaveBoundingBox({
      min: { x: -114.3, y: -22.8 },
      max: { x: -63.5, y: 22.8 },
      tolerance: 0.06,
    });
  });
  it('neutral: every component is closed and assembly has 22 discrete units', async () => {
    const model = await loadModel({ file: 'assemblies/gimbal.ts' });
    expectGeo(model).toBeWatertight();
    expectGeo(
      await loadModel({ file: 'assemblies/gimbal.ts', format: 'step' }),
    ).toHaveTopologyCounts({ solids: 22 });
  });
  it('neutral: no unintended component interference', async () => {
    expectGeo(
      await loadModel({ file: 'assemblies/gimbal.ts' }),
    ).toHaveNoComponentInterference();
  });
  for (const pitchDeg of [-25, -12.5, 0, 12.5, 25]) {
    for (const yawDeg of [-12, -6, 0, 6, 12]) {
      it(`articulation pitch ${pitchDeg} yaw ${yawDeg}: closed separated components`, async () => {
        const model = await loadModel({
          file: 'assemblies/gimbal.ts',
          parameters: { pitchDeg, yawDeg },
        });
        expectGeo(model).toBeWatertight();
        expectGeo(model).toHaveNoComponentInterference();
        const step = await loadModel({
          file: 'assemblies/gimbal.ts',
          parameters: { pitchDeg, yawDeg },
          format: 'step',
        });
        expectGeo(step).toBeValidBrep();
        expectGeo(step).toHaveTopologyCounts({ solids: 22 });
        expectGeo(step).toHaveNoComponentInterference({ tolerance: 0.001 });
      });
    }
  }
});
