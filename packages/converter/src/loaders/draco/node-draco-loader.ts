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

// Derived from https://gist.github.com/donmccurdy/323c6363ac7ca8a7de6a3362d7fdddb4

/* eslint-disable @typescript-eslint/naming-convention -- draco3d uses c++ style */
/* eslint-disable max-params -- draco3d uses c++ style */
/* eslint-disable new-cap -- draco3d uses c++ style */

import * as THREE from 'three';
import type { BufferGeometry } from 'three';
import type { Attribute, Decoder, DecoderBuffer, DecoderModule, DracoArray, Mesh, PointCloud } from 'draco3dgltf';
import draco3d from 'draco3dgltf';
import { DRACOLoader } from 'three/examples/jsm/Addons.js';
import { Color, ColorManagement, LinearSRGBColorSpace, SRGBColorSpace } from 'three';

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

type GeometryBuffer = Record<string, THREE.BufferAttribute | undefined> & {
  indices?: Uint32Array;
};

export class NodeDracoLoader extends DRACOLoader {
  public verbosity = 0;
  public attributeOptions: Record<string, { skipDequantization?: boolean }> = {};
  public drawMode: THREE.TrianglesDrawModes = THREE.TrianglesDrawMode;

  private decoderModule!: DecoderModule;

  private readonly defaultAttributeIDs: Record<string, string> = {
    position: 'POSITION',
    normal: 'NORMAL',
    color: 'COLOR',
    uv: 'TEX_COORD',
  };

  private readonly defaultAttributeTypes: Record<string, AttributeType> = {
    position: Float32Array,
    normal: Float32Array,
    color: Float32Array,
    uv: Float32Array,
  };

  public async initialize(): Promise<void> {
    this.decoderModule = await draco3d.createDecoderModule();
  }

  public override load(
    url: string,
    onLoad: (geometry: BufferGeometry) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void,
  ): void {
    const loader = new THREE.FileLoader(this.manager);
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

  public override preload(): this {
    // No WASM preload needed for Node.js
    return this;
  }

  public decodeDracoFile(
    rawBuffer: ArrayBuffer,
    callback: (geometry: BufferGeometry) => void,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeType>,
    vertexColorSpace: string = LinearSRGBColorSpace,
  ): void {
    this.decodeDracoFileInternal(
      rawBuffer,
      this.decoderModule,
      callback,
      attributeUniqueIdMap,
      attributeTypeMap,
      vertexColorSpace,
    );
  }

  private decodeDracoFileInternal(
    rawBuffer: ArrayBuffer,
    decoderModule: DecoderModule,
    callback: (geometry: BufferGeometry) => void,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeType>,
    vertexColorSpace: string = LinearSRGBColorSpace,
  ): void {
    const buffer = new decoderModule.DecoderBuffer();
    buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
    const decoder = new decoderModule.Decoder();

    const geometryType = decoder.GetEncodedGeometryType(buffer);
    if (geometryType === decoderModule.TRIANGULAR_MESH) {
      if (this.verbosity > 0) {
        console.info('Loaded a mesh.');
      }
    } else if (geometryType === decoderModule.POINT_CLOUD) {
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
        decoderModule,
        decoder,
        geometryType,
        buffer,
        attributeUniqueIdMap,
        attributeTypeMap,
        vertexColorSpace,
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
    vertexColorSpace: string,
  ): void {
    const numberComponents = attribute.num_components();
    const numberPoints = dracoGeometry.num_points();
    const numberValues = numberPoints * numberComponents;
    let attributeData: DracoArray;
    let TypedBufferAttribute: new (...args: any[]) => TypedAttribute;

    switch (attributeType) {
      case Float32Array: {
        attributeData = new dracoDecoder.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Float32BufferAttribute(
          new Float32Array(numberValues),
          numberComponents,
        );
        TypedBufferAttribute = THREE.Float32BufferAttribute;
        break;
      }

      case Int8Array: {
        attributeData = new dracoDecoder.DracoInt8Array();
        decoder.GetAttributeInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Int8BufferAttribute(new Int8Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Int8BufferAttribute;
        break;
      }

      case Int16Array: {
        attributeData = new dracoDecoder.DracoInt16Array();
        decoder.GetAttributeInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Int16BufferAttribute(new Int16Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Int16BufferAttribute;
        break;
      }

      case Int32Array: {
        attributeData = new dracoDecoder.DracoInt32Array();
        decoder.GetAttributeInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Int32BufferAttribute(new Int32Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Int32BufferAttribute;
        break;
      }

      case Uint8Array: {
        attributeData = new dracoDecoder.DracoUInt8Array();
        decoder.GetAttributeUInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Uint8BufferAttribute(new Uint8Array(numberValues), numberComponents);
        TypedBufferAttribute = THREE.Uint8BufferAttribute;
        break;
      }

      case Uint16Array: {
        attributeData = new dracoDecoder.DracoUInt16Array();
        decoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        geometryBuffer[attributeName] = new THREE.Uint16BufferAttribute(
          new Uint16Array(numberValues),
          numberComponents,
        );
        TypedBufferAttribute = THREE.Uint16BufferAttribute;
        break;
      }

      case Uint32Array: {
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

    const bufferAttribute = new TypedBufferAttribute(
      geometryBuffer[attributeName].array,
      geometryBuffer[attributeName].itemSize,
    );

    // Handle color space conversion
    if (attributeName === 'color') {
      this.assignVertexColorSpace(bufferAttribute, vertexColorSpace);
      bufferAttribute.normalized = !(geometryBuffer[attributeName].array instanceof Float32Array);
    }

    geometry.setAttribute(attributeName, bufferAttribute);
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
    vertexColorSpace: string = LinearSRGBColorSpace,
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

    const geometryBuffer: GeometryBuffer = {};
    const geometry = new THREE.BufferGeometry();

    // Use provided attribute maps or defaults
    const attributeIDs = attributeUniqueIdMap ?? this.defaultAttributeIDs;
    const attributeTypes = attributeTypeMap ?? this.defaultAttributeTypes;
    const useUniqueIDs = Boolean(attributeUniqueIdMap);

    // Gather all vertex attributes.
    for (const attributeName in attributeIDs) {
      if (!Object.hasOwn(attributeIDs, attributeName)) {
        continue;
      }

      const attributeTypeString = attributeTypes[attributeName];
      if (!attributeTypeString) {
        continue;
      }

      const attributeType = this.getAttributeType(attributeTypeString);
      let attribute;
      let attributeID;

      if (useUniqueIDs) {
        const uniqueIdMap = attributeIDs as Record<string, number>;
        attributeID = uniqueIdMap[attributeName];
        if (attributeID === undefined) {
          continue;
        }

        attribute = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
      } else {
        const stringIdMap = attributeIDs as Record<string, string>;
        const dracoAttributeKey = stringIdMap[attributeName];
        if (!dracoAttributeKey) {
          continue;
        }

        // Map string keys to draco constants
        let dracoConstant: number;
        switch (dracoAttributeKey) {
          case 'POSITION': {
            dracoConstant = dracoDecoder.POSITION;
            break;
          }

          case 'NORMAL': {
            dracoConstant = dracoDecoder.NORMAL;
            break;
          }

          case 'COLOR': {
            dracoConstant = dracoDecoder.COLOR;
            break;
          }

          case 'TEX_COORD': {
            dracoConstant = dracoDecoder.TEX_COORD;
            break;
          }

          default: {
            continue;
          }
        }

        attributeID = decoder.GetAttributeId(dracoGeometry, dracoConstant);
        if (attributeID === -1) {
          continue;
        }

        attribute = decoder.GetAttribute(dracoGeometry, attributeID);
      }

      if (this.verbosity > 0) {
        console.info(`Loaded ${attributeName} attribute.`);
      }

      this.addAttributeToGeometry(
        dracoDecoder,
        decoder,
        dracoGeometry,
        attributeName,
        attributeType,
        attribute,
        geometry,
        geometryBuffer,
        vertexColorSpace,
      );
    }

    if (geometryType === dracoDecoder.TRIANGULAR_MESH) {
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

    if (geometryType === dracoDecoder.TRIANGULAR_MESH && geometryBuffer.indices) {
      geometry.setIndex(
        new (geometryBuffer.indices.length > 65_535 ? THREE.Uint32BufferAttribute : THREE.Uint16BufferAttribute)(
          geometryBuffer.indices,
          1,
        ),
      );
    }

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

  private getAttributeType(typeName: string | AttributeType): AttributeType {
    if (typeof typeName === 'function') {
      return typeName;
    }

    switch (typeName) {
      case 'Float32Array': {
        return Float32Array;
      }

      case 'Int8Array': {
        return Int8Array;
      }

      case 'Int16Array': {
        return Int16Array;
      }

      case 'Int32Array': {
        return Int32Array;
      }

      case 'Uint8Array': {
        return Uint8Array;
      }

      case 'Uint16Array': {
        return Uint16Array;
      }

      case 'Uint32Array': {
        return Uint32Array;
      }

      default: {
        return Float32Array;
      }
    }
  }

  private assignVertexColorSpace(attribute: THREE.BufferAttribute, inputColorSpace: string): void {
    // While .drc files do not specify colorspace, the only 'official' tooling
    // is PLY and OBJ converters, which use sRGB. We'll assume sRGB when a .drc
    // file is passed into .load() or .parse(). GLTFLoader uses internal APIs
    // to decode geometry, and vertex colors are already Linear-sRGB in there.
    if (inputColorSpace !== SRGBColorSpace) {
      return;
    }

    const color = new Color();
    for (let i = 0, il = attribute.count; i < il; i++) {
      color.fromBufferAttribute(attribute, i);
      ColorManagement.colorSpaceToWorking(color, SRGBColorSpace);
      attribute.setXYZ(i, color.r, color.g, color.b);
    }
  }
}
