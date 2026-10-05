import { describe, expect, it } from 'vitest';
import { Group, Mesh, InstancedMesh, Matrix4, BoxGeometry, MeshBasicMaterial } from 'three';
import {
  getModelComponentIdInHierarchy,
  getModelComponentHitOwner,
  getModelComponentInstanceSlot,
  getModelComponentWorldMatrix,
  setModelComponentInstanceSlots,
  getModelComponentOwner,
  getModelComponentOwnerInHierarchy,
  modelComponentOwnerUserDataKeys,
  setModelComponentOwner,
} from '#components/geometry/graphics/three/utils/model-component-owner.js';

describe('model component owner userData helpers', () => {
  it('sets and reads direct unit/component ownership', () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());

    setModelComponentOwner(mesh, { unitId: 'unit:main', componentId: 'component:block' });

    expect(getModelComponentOwner(mesh)).toEqual({
      unitId: 'unit:main',
      componentId: 'component:block',
    });
  });

  it('resolves ownership inherited from a parent object', () => {
    const parent = new Group();
    const child = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    setModelComponentOwner(parent, { unitId: 'unit:main', componentId: 'component:block' });
    parent.add(child);

    expect(getModelComponentOwnerInHierarchy(child)).toEqual({
      unitId: 'unit:main',
      componentId: 'component:block',
    });
  });

  it('keeps legacy component-id lookup compatible without fabricating ownership', () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.userData[modelComponentOwnerUserDataKeys.componentId] = 'component:legacy';

    expect(getModelComponentIdInHierarchy(mesh)).toBe('component:legacy');
    expect(getModelComponentOwner(mesh)).toBeUndefined();
    expect(getModelComponentOwnerInHierarchy(mesh)).toBeUndefined();
  });
});

describe('actual instance slot ownership', () => {
  it('should preserve canonical identity and draw placement while denying missing, stale and disposed slot evidence', () => {
    const source = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    const batch = new InstancedMesh(source.geometry, source.material, 2);
    const parent = new Group();
    parent.position.set(30, 0, 0);
    parent.add(batch);
    setModelComponentOwner(parent, { unitId: 'unit', componentId: 'incorrect:shared-ancestor' });
    batch.setMatrixAt(0, new Matrix4().makeTranslation(12, 0, 0));
    batch.setMatrixAt(1, new Matrix4().makeTranslation(17, 0, 0));
    setModelComponentInstanceSlots(batch, [
      { owner: { unitId: 'unit', componentId: 'left' }, sourceObject: source },
      { owner: { unitId: 'unit', componentId: 'right' }, sourceObject: source },
    ]);
    parent.updateMatrixWorld(true);
    expect(getModelComponentHitOwner({ object: batch, instanceId: 1 })).toEqual({
      unitId: 'unit',
      componentId: 'right',
    });
    expect(getModelComponentWorldMatrix(batch, 0, new Matrix4())?.elements[12]).toBe(42);
    expect(getModelComponentHitOwner({ object: batch })).toBeUndefined();
    expect(getModelComponentHitOwner({ object: batch, instanceId: 9 })).toBeUndefined();
    expect(parent.children).toHaveLength(1);
    batch.count = 1;
    expect(getModelComponentHitOwner({ object: batch, instanceId: 0 })).toBeUndefined();
    batch.count = 2;
    batch.dispose();
    expect(getModelComponentHitOwner({ object: batch, instanceId: 0 })).toBeUndefined();
    expect(getModelComponentWorldMatrix(batch, 0, new Matrix4())).toBeUndefined();
    source.geometry.dispose();
    source.material.dispose();
  });
});

it('should prevent same-count reordering from replacing immutable canonical slot evidence', () => {
  const template = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const batch = new InstancedMesh(template.geometry, template.material, 2);
  const slots = [
    { owner: { unitId: 'u', componentId: 'left' }, sourceObject: template },
    { owner: { unitId: 'u', componentId: 'right' }, sourceObject: template },
  ];
  setModelComponentInstanceSlots(batch, slots);
  const original = getModelComponentInstanceSlot(batch, 0);
  slots.reverse();
  expect(getModelComponentInstanceSlot(batch, 0)).toBe(original);
  expect(getModelComponentInstanceSlot(batch, 0)?.owner.componentId).toBe('left');
  expect(() => {
    setModelComponentInstanceSlots(batch, slots);
  }).toThrow('already bound');
  expect(Object.isFrozen(original)).toBe(true);
  expect(Object.isFrozen(original?.owner)).toBe(true);
  batch.dispose();
  expect(getModelComponentInstanceSlot(batch, 0)).toBeUndefined();
  template.geometry.dispose();
  template.material.dispose();
});
