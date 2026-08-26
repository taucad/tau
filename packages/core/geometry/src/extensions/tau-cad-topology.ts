/* eslint-disable @typescript-eslint/naming-convention -- glTF-Transform requires static EXTENSION_NAME. */
import { Extension, ExtensionProperty, PropertyType } from '@gltf-transform/core';
import type { IProperty, Nullable, ReaderContext, WriterContext } from '@gltf-transform/core';

import { tauCadTopologyExtension } from '@taucad/runtime/types';
import type { JSONObject } from '@taucad/runtime/types';
import { cloneJson, decodeJsonObject, encodeJsonObject, isJsonObject } from '#extensions/json.js';

type TauCadTopologyRootState = {
  payload: JSONObject;
} & IProperty;

const encodedTopologyPayloads = new WeakMap<TauCadTopologyRoot, Uint8Array<ArrayBuffer>>();

/**
 * Root-level Tau CAD topology payload.
 *
 * @public
 */
export class TauCadTopologyRoot extends ExtensionProperty<TauCadTopologyRootState> {
  public static override readonly EXTENSION_NAME = tauCadTopologyExtension;
  declare public extensionName: typeof tauCadTopologyExtension;
  declare public propertyType: 'TauCadTopologyRoot';
  declare public parentTypes: [PropertyType.ROOT];

  /**
   * Return the decoded Tau topology JSON payload.
   *
   * @public
   */
  public getPayload(): JSONObject {
    return cloneJson(this.get('payload'));
  }

  /**
   * Store the decoded Tau topology JSON payload.
   *
   * @public
   */
  public setPayload(payload: JSONObject): this {
    encodedTopologyPayloads.delete(this);
    return this.set('payload', cloneJson(payload));
  }

  /**
   * Return the encoded payload queued for a topology bufferView write.
   *
   * @public
   */
  public getEncodedPayload(): Uint8Array<ArrayBuffer> | undefined {
    return encodedTopologyPayloads.get(this);
  }

  /**
   * Store the encoded payload queued for a topology bufferView write.
   *
   * @public
   */
  public setEncodedPayload(payload: Uint8Array<ArrayBuffer>): this {
    encodedTopologyPayloads.set(this, payload);
    return this;
  }

  protected override init(): void {
    this.extensionName = tauCadTopologyExtension;
    this.propertyType = 'TauCadTopologyRoot';
    this.parentTypes = [PropertyType.ROOT];
  }

  protected override getDefaults(): Nullable<TauCadTopologyRootState> {
    return Object.assign(super.getDefaults() as IProperty, { payload: {} });
  }
}

/**
 * The glTF-Transform extension preserving Tau's `TAU_cad_topology`.
 *
 * @public
 */
export class TauCadTopology extends Extension {
  public static override readonly EXTENSION_NAME = tauCadTopologyExtension;
  public override readonly extensionName = tauCadTopologyExtension;
  public override readonly prewriteTypes = [PropertyType.BUFFER];

  /**
   * Create a root Tau topology property.
   *
   * @public
   */
  public createRoot(): TauCadTopologyRoot {
    return new TauCadTopologyRoot(this.document.getGraph());
  }

  /**
   */
  public override read(context: ReaderContext): this {
    const extensionDefinition = context.jsonDoc.json.extensions?.[tauCadTopologyExtension];
    if (!isJsonObject(extensionDefinition)) {
      return this;
    }

    let payload: JSONObject | undefined;
    const { topologyBufferView } = extensionDefinition;
    if (typeof topologyBufferView === 'number') {
      const bufferViewBytes = context.bufferViews[topologyBufferView];
      if (bufferViewBytes) {
        payload = decodeJsonObject(bufferViewBytes);
      }
    } else if (
      Array.isArray(extensionDefinition['components']) ||
      typeof extensionDefinition['schemaVersion'] === 'number'
    ) {
      payload = extensionDefinition;
    }

    if (payload) {
      this.document.getRoot().setExtension(tauCadTopologyExtension, this.createRoot().setPayload(payload));
    }

    return this;
  }

  /**
   */
  public override prewrite(context: WriterContext, propertyType: PropertyType): this {
    if (propertyType !== PropertyType.BUFFER) {
      return this;
    }

    const rootProperty = this.document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension);
    if (!rootProperty) {
      return this;
    }

    const encodedPayload = encodeJsonObject(rootProperty.getPayload());
    rootProperty.setEncodedPayload(encodedPayload);

    const buffer = this.document.getRoot().listBuffers()[0] ?? this.document.createBuffer();

    if (!context.otherBufferViews.has(buffer)) {
      context.otherBufferViews.set(buffer, []);
    }
    context.otherBufferViews.get(buffer)!.push(encodedPayload);
    return this;
  }

  /**
   */
  public override write(context: WriterContext): this {
    const rootProperty = this.document.getRoot().getExtension<TauCadTopologyRoot>(tauCadTopologyExtension);
    if (!rootProperty) {
      return this;
    }

    const encodedPayload = rootProperty.getEncodedPayload();
    const topologyBufferView =
      encodedPayload === undefined ? undefined : context.otherBufferViewsIndexMap.get(encodedPayload);
    if (topologyBufferView === undefined) {
      throw new Error('Missing topology bufferView for TAU_cad_topology extension write.');
    }

    context.jsonDoc.json.extensions ??= {};
    context.jsonDoc.json.extensions[tauCadTopologyExtension] = {
      schemaVersion: 1,
      encoding: 'application/json',
      topologyBufferView,
    };
    return this;
  }
}
