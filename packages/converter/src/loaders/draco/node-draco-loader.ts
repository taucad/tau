/* eslint-disable max-depth -- this is a copied function. */
/* eslint-disable import-x/no-extraneous-dependencies -- this is misconfigured - TODO: fix */
/* eslint-disable @typescript-eslint/naming-convention -- draco3d uses c++ style */
/* eslint-disable max-params -- draco3d uses c++ style */
/* eslint-disable new-cap -- draco3d uses c++ style */
// Copyright 2016 The Draco Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as THREE from 'three';
import type { BufferGeometry, LoadingManager } from 'three';
import type { Attribute, Decoder, DecoderBuffer, DecoderModule, DracoArray, Mesh, PointCloud } from 'draco3dgltf';
import draco3d from 'draco3dgltf';

type AttributeType =
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Uint16ArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor
  | Int8ArrayConstructor
  | Int32ArrayConstructor;

type TypedAttribute =
  | THREE.Float32BufferAttribute
  | THREE.Int8BufferAttribute
  | THREE.Int16BufferAttribute
  | THREE.Int32BufferAttribute
  | THREE.Uint8BufferAttribute
  | THREE.Uint16BufferAttribute
  | THREE.Uint32BufferAttribute;

type GeometryBuffer = {
  [name: string]: THREE.BufferAttribute | undefined;
  indices?: Uint32Array;
};
export class NodeDracoLoader {
  public timeLoaded = 0;
  public manager: LoadingManager;
  public materials: THREE.Material[] | undefined = undefined;
  public verbosity = 0;
  public attributeOptions: Record<string, { skipDequantization?: boolean }> = {};
  public drawMode: THREE.TrianglesDrawModes = THREE.TrianglesDrawMode;

  private path = '';
  private decoderModule!: DecoderModule;
  private readonly nativeAttributeMap: Record<string, string> = {
    position: 'POSITION',
    normal: 'NORMAL',
    color: 'COLOR',
    uv: 'TEX_COORD',
  };

  public constructor(manager?: LoadingManager) {
    this.manager = manager ?? THREE.DefaultLoadingManager;
  }

  public async initialize(): Promise<void> {
    this.decoderModule = await draco3d.createDecoderModule();
  }

  public load(
    url: string,
    onLoad: (geometry: BufferGeometry) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const loader = new THREE.FileLoader(this.manager);
    loader.setPath(this.path);
    loader.setResponseType('arraybuffer');
    loader.load(
      url,
      (blob) => {
        if (blob instanceof ArrayBuffer) {
          this.decodeDracoFile(blob, onLoad);
        }
      },
      onProgress,
      onError,
    );
  }

  public setPath(value: string): this {
    this.path = value;
    return this;
  }

  public setVerbosity(level: number): this {
    this.verbosity = level;
    return this;
  }

  public setDrawMode(drawMode: THREE.TrianglesDrawModes): this {
    this.drawMode = drawMode;
    return this;
  }

  public setSkipDequantization(attributeName: string, skip = true): this {
    this.getAttributeOptions(attributeName).skipDequantization = skip;
    return this;
  }

  public preload(): void {
    // No-op - required by DRACOLoader interface
  }

  public decodeDracoFile(
    rawBuffer: ArrayBuffer,
    callback: (geometry: BufferGeometry) => void,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeType>,
  ): void {
    this.decodeDracoFileInternal(rawBuffer, this.decoderModule, callback, attributeUniqueIdMap, attributeTypeMap);
  }

  private decodeDracoFileInternal(
    rawBuffer: ArrayBuffer,
    dracoDecoder: DecoderModule,
    callback: (geometry: BufferGeometry) => void,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeType>,
  ): void {
    const buffer = new dracoDecoder.DecoderBuffer();
    buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
    const decoder = new dracoDecoder.Decoder();

    const geometryType = decoder.GetEncodedGeometryType(buffer);
    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
      if (this.verbosity > 0) {
        console.info('Loaded a mesh.');
      }
    } else if (geometryType === dracoDecoder.POINT_CLOUD) {
      if (this.verbosity > 0) {
        console.info('Loaded a point cloud.');
      }
    } else {
      const errorMessage = 'DRACOLoader: Unknown geometry type.';
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    callback(
      this.convertDracoGeometryTo3JS(
        dracoDecoder,
        decoder,
        geometryType,
        buffer,
        attributeUniqueIdMap,
        attributeTypeMap,
      ),
    );
  }

  private addAttributeToGeometry(
    dracoDecoder: DecoderModule,
    decoder: Decoder,
    dracoGeometry: Mesh | PointCloud,
    attributeName: string,
    attributeType: AttributeType,
    attribute: Attribute,
    geometry: BufferGeometry,
    geometryBuffer: GeometryBuffer,
  ): void {
    const numberComponents = attribute.num_components();
    const numberPoints = dracoGeometry.num_points();
    const numberValues = numberPoints * numberComponents;
    let attributeData: DracoArray;
    let TypedBufferAttribute: new (...args: any[]) => TypedAttribute;

    switch (String(attributeType)) {
      case 'Float32Array': {
        attributeData = new dracoDecoder.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Float32BufferAttribute(
          new Float32Array(numberValues),
          numberComponents,
        );
        TypedBufferAttribute = THREE.Float32BufferAttribute;
        break;
      }

      case 'Int8Array': {
        attributeData = new dracoDecoder.DracoInt8Array();
        decoder.GetAttributeInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Int8BufferAttribute(new Int8Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Int8BufferAttribute;
        break;
      }

      case 'Int16Array': {
        attributeData = new dracoDecoder.DracoInt16Array();
        decoder.GetAttributeInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Int16BufferAttribute(new Int16Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Int16BufferAttribute;
        break;
      }

      case 'Int32Array': {
        attributeData = new dracoDecoder.DracoInt32Array();
        decoder.GetAttributeInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Int32BufferAttribute(new Int32Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Int32BufferAttribute;
        break;
      }

      case 'Uint8Array': {
        attributeData = new dracoDecoder.DracoUInt8Array();
        decoder.GetAttributeUInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Uint8BufferAttribute(new Uint8Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Uint8BufferAttribute;
        break;
      }

      case 'Uint16Array': {
        attributeData = new dracoDecoder.DracoUInt16Array();
        decoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Uint16BufferAttribute(
          new Uint16Array(numberValues),
          numberComponents,
        );
        TypedBufferAttribute = THREE.Uint16BufferAttribute;
        break;
      }

      case 'Uint32Array': {
        attributeData = new dracoDecoder.DracoUInt32Array();
        decoder.GetAttributeUInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Uint32BufferAttribute(
          new Uint32Array(numberValues),
          numberComponents,
        );
        TypedBufferAttribute = THREE.Uint32BufferAttribute;
        break;
      }

      default: {
        const errorMessage = `DRACOLoader: Unexpected attribute type: ${String(attributeType)}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
    }

    for (let i = 0; i < numberValues; i++) {
      geometryBuffer[attributeName].array[i] = attributeData.GetValue(i);
    }

    geometry.setAttribute(
      attributeName,
      new TypedBufferAttribute(geometryBuffer[attributeName].array, geometryBuffer[attributeName].itemSize),
    );
    dracoDecoder.destroy(attributeData);
  }

  // eslint-disable-next-line complexity -- this is a copied function.
  private convertDracoGeometryTo3JS(
    dracoDecoder: DecoderModule,
    decoder: Decoder,
    geometryType: unknown,
    buffer: DecoderBuffer,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeType>,
  ): BufferGeometry {
    let dracoGeometry;
    let decodingStatus;
    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
      dracoGeometry = new dracoDecoder.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(buffer, dracoGeometry);
    } else {
      dracoGeometry = new dracoDecoder.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(buffer, dracoGeometry);
    }

    if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
      const errorMessage = `DRACOLoader: Decoding failed: ${decodingStatus.error_msg()}`;
      console.error(errorMessage);
      dracoDecoder.destroy(decoder);
      dracoDecoder.destroy(dracoGeometry);
      throw new Error(errorMessage);
    }

    dracoDecoder.destroy(buffer);

    let numberFaces = 0;
    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
      numberFaces = (dracoGeometry as Mesh).num_faces();
      if (this.verbosity > 0) {
        console.info(`Number of faces loaded: ${numberFaces.toString()}`);
      }
    }

    const numberPoints = dracoGeometry.num_points();
    const numberAttributes = dracoGeometry.num_attributes();
    if (this.verbosity > 0) {
      console.info(`Number of points loaded: ${numberPoints.toString()}`);
      console.info(`Number of attributes loaded: ${numberAttributes.toString()}`);
    }

    const posAttId = decoder.GetAttributeId(dracoGeometry, dracoDecoder.POSITION);
    if (posAttId === -1) {
      const errorMessage = 'DRACOLoader: No position attribute found.';
      console.error(errorMessage);
      dracoDecoder.destroy(decoder);
      dracoDecoder.destroy(dracoGeometry);
      throw new Error(errorMessage);
    }

    const posAttribute = decoder.GetAttribute(dracoGeometry, posAttId);

    const geometryBuffer: GeometryBuffer = {};
    const geometry = new THREE.BufferGeometry();

    if (attributeUniqueIdMap && attributeTypeMap) {
      for (const attributeName in attributeUniqueIdMap) {
        if (Object.hasOwn(attributeUniqueIdMap, attributeName)) {
          const attributeType = attributeTypeMap[attributeName]!;
          const attributeId = attributeUniqueIdMap[attributeName]!;
          const attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeId);
          this.addAttributeToGeometry(
            dracoDecoder,
            decoder,
            dracoGeometry,
            attributeName,
            attributeType,
            attribute,
            geometry,
            geometryBuffer,
          );
        }
      }
    } else {
      for (const attributeName in this.nativeAttributeMap) {
        if (Object.hasOwn(this.nativeAttributeMap, attributeName)) {
          const attId = decoder.GetAttributeId(dracoGeometry, dracoDecoder[this.nativeAttributeMap[attributeName]]);
          if (attId !== -1) {
            if (this.verbosity > 0) {
              console.info(`Loaded ${attributeName} attribute.`);
            }

            const attribute = decoder.GetAttribute(dracoGeometry, attId);
            this.addAttributeToGeometry(
              dracoDecoder,
              decoder,
              dracoGeometry,
              attributeName,
              Float32Array,
              attribute,
              geometry,
              geometryBuffer,
            );
          }
        }
      }
    }

    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
      if (this.drawMode === THREE.TriangleStripDrawMode) {
        const stripsArray = new dracoDecoder.DracoInt32Array();
        decoder.GetTriangleStripsFromMesh(dracoGeometry, stripsArray);
        geometryBuffer.indices = new Uint32Array(stripsArray.size());
        for (let i = 0; i < stripsArray.size(); ++i) {
          geometryBuffer.indices[i] = stripsArray.GetValue(i);
        }

        dracoDecoder.destroy(stripsArray);
      } else {
        const numberIndices = numberFaces * 3;
        geometryBuffer.indices = new Uint32Array(numberIndices);
        const ia = new dracoDecoder.DracoInt32Array();
        for (let i = 0; i < numberFaces; ++i) {
          decoder.GetFaceFromMesh(dracoGeometry as Mesh, i, ia);
          const index = i * 3;
          geometryBuffer.indices[index] = ia.GetValue(0);
          geometryBuffer.indices[index + 1] = ia.GetValue(1);
          geometryBuffer.indices[index + 2] = ia.GetValue(2);
        }

        dracoDecoder.destroy(ia);
      }
    }

    if (geometryType === dracoDecoder.TRIANGULAR_MESH && geometryBuffer.indices) {
      geometry.setIndex(
        new (geometryBuffer.indices.length > 65_535 ? THREE.Uint32BufferAttribute : THREE.Uint16BufferAttribute)(
          geometryBuffer.indices,
          1,
        ),
      );
    }

    const posTransform = new dracoDecoder.AttributeQuantizationTransform();
    if (posTransform.InitFromAttribute(posAttribute)) {
      const geometryPosition = geometry.attributes['position'] as THREE.BufferAttribute;
      geometryPosition.isQuantized = true;
      geometryPosition.maxRange = posTransform.range();
      geometryPosition.numQuantizationBits = posTransform.quantization_bits();
      geometryPosition.minValues = new Float32Array(3);
      for (let i = 0; i < 3; ++i) {
        geometryPosition.minValues[i] = posTransform.min_value(i);
      }
    }

    dracoDecoder.destroy(posTransform);
    dracoDecoder.destroy(decoder);
    dracoDecoder.destroy(dracoGeometry);

    return geometry;
  }

  private getAttributeOptions(attributeName: string): {
    skipDequantization?: boolean;
  } {
    this.attributeOptions[attributeName] ??= {};
    return this.attributeOptions[attributeName];
  }
}
