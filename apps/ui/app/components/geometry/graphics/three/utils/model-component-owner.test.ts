import { describe, expect, it } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import {
  getModelComponentIdInHierarchy,
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
