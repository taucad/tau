/* eslint-disable @typescript-eslint/naming-convention -- glTF-Transform requires static EXTENSION_NAME. */
import { Extension, ExtensionProperty, PropertyType } from '@gltf-transform/core';
import type { IProperty, Nullable, ReaderContext, WriterContext } from '@gltf-transform/core';

import { kittyCadBoundaryRepresentationExtension } from '@taucad/runtime/types';
import type { JSONObject } from '@taucad/runtime/types';
import { cloneJson, isJsonObject } from '#extensions/json.js';

type KittyCadBrepRootPayload = JSONObject;

type KittyCadBrepRootState = {
  payload: KittyCadBrepRootPayload;
} & IProperty;

type KittyCadBrepNodeState = {
  solid: number;
} & IProperty;

const unsetSolidIndex = -1;

/**
 * Root-level Zoo BREP payload attached to `KITTYCAD_boundary_representation`.
 *
 * @public
 */
export class KittyCadBrepRoot extends ExtensionProperty<KittyCadBrepRootState> {
  public static override readonly EXTENSION_NAME = kittyCadBoundaryRepresentationExtension;
  declare public extensionName: typeof kittyCadBoundaryRepresentationExtension;
  declare public propertyType: 'KittyCadBrepRoot';
  declare public parentTypes: [PropertyType.ROOT];

  /**
   * Return the preserved root BREP JSON payload.
   *
   * @public
   */
  public getPayload(): KittyCadBrepRootPayload {
    return cloneJson(this.get('payload'));
  }

  /**
   * Store the root BREP JSON payload.
   *
   * @public
   */
  public setPayload(payload: KittyCadBrepRootPayload): this {
    return this.set('payload', cloneJson(payload));
  }

  protected override init(): void {
    this.extensionName = kittyCadBoundaryRepresentationExtension;
    this.propertyType = 'KittyCadBrepRoot';
    this.parentTypes = [PropertyType.ROOT];
  }

  protected override getDefaults(): Nullable<KittyCadBrepRootState> {
    return Object.assign(super.getDefaults() as IProperty, { payload: {} });
  }
}

/**
 * Node-level Zoo BREP solid reference.
 *
 * @public
 */
export class KittyCadBrepNode extends ExtensionProperty<KittyCadBrepNodeState> {
  public static override readonly EXTENSION_NAME = kittyCadBoundaryRepresentationExtension;
  declare public extensionName: typeof kittyCadBoundaryRepresentationExtension;
  declare public propertyType: 'KittyCadBrepNode';
  declare public parentTypes: [PropertyType.NODE];

  /**
   * Return the BREP solid index referenced by this glTF node.
   *
   * @public
   */
  public getSolid(): number | undefined {
    const solid = this.get('solid');
    return solid >= 0 ? solid : undefined;
  }

  /**
   * Store the BREP solid index referenced by this glTF node.
   *
   * @public
   */
  public setSolid(solid: number): this {
    return this.set('solid', solid);
  }

  protected override init(): void {
    this.extensionName = kittyCadBoundaryRepresentationExtension;
    this.propertyType = 'KittyCadBrepNode';
    this.parentTypes = [PropertyType.NODE];
  }

  protected override getDefaults(): Nullable<KittyCadBrepNodeState> {
    return Object.assign(super.getDefaults() as IProperty, { solid: unsetSolidIndex });
  }
}

/**
 * The glTF-Transform extension preserving Zoo's `KITTYCAD_boundary_representation`.
 *
 * @public
 */
export class KittyCadBoundaryRepresentation extends Extension {
  public static override readonly EXTENSION_NAME = kittyCadBoundaryRepresentationExtension;
  public override readonly extensionName = kittyCadBoundaryRepresentationExtension;

  /**
   * Create a root BREP payload property.
   *
   * @public
   */
  public createRoot(): KittyCadBrepRoot {
    return new KittyCadBrepRoot(this.document.getGraph());
  }

  /**
   * Create a node solid-reference property.
   *
   * @public
   */
  public createNode(): KittyCadBrepNode {
    return new KittyCadBrepNode(this.document.getGraph());
  }

  /**
   */
  public override read(context: ReaderContext): this {
    const rootPayload = context.jsonDoc.json.extensions?.[kittyCadBoundaryRepresentationExtension];
    if (isJsonObject(rootPayload)) {
      this.document
        .getRoot()
        .setExtension(kittyCadBoundaryRepresentationExtension, this.createRoot().setPayload(rootPayload));
    }

    for (const [nodeIndex, nodeDefinition] of (context.jsonDoc.json.nodes ?? []).entries()) {
      const nodePayload = nodeDefinition.extensions?.[kittyCadBoundaryRepresentationExtension];
      if (!isJsonObject(nodePayload) || typeof nodePayload['solid'] !== 'number') {
        continue;
      }

      context.nodes[nodeIndex]?.setExtension(
        kittyCadBoundaryRepresentationExtension,
        this.createNode().setSolid(nodePayload['solid']),
      );
    }

    return this;
  }

  /**
   */
  public override write(context: WriterContext): this {
    const { json } = context.jsonDoc;
    const rootProperty = this.document
      .getRoot()
      .getExtension<KittyCadBrepRoot>(kittyCadBoundaryRepresentationExtension);

    if (rootProperty) {
      json.extensions ??= {};
      json.extensions[kittyCadBoundaryRepresentationExtension] = rootProperty.getPayload();
    }

    for (const node of this.document.getRoot().listNodes()) {
      const nodeProperty = node.getExtension<KittyCadBrepNode>(kittyCadBoundaryRepresentationExtension);
      const solid = nodeProperty?.getSolid();
      if (solid === undefined) {
        continue;
      }

      const nodeIndex = context.nodeIndexMap.get(node);
      const nodeDefinition = nodeIndex === undefined ? undefined : json.nodes?.[nodeIndex];
      if (!nodeDefinition) {
        continue;
      }

      nodeDefinition.extensions ??= {};
      nodeDefinition.extensions[kittyCadBoundaryRepresentationExtension] = { solid };
    }

    return this;
  }
}
