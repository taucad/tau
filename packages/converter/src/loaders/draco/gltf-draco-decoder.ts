/* eslint-disable complexity -- draco3d uses c++ style */
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

// Pure gltf-transform implementation for Draco decoding

/* eslint-disable @typescript-eslint/naming-convention -- draco3d uses c++ style */
/* eslint-disable max-params -- draco3d uses c++ style */
/* eslint-disable new-cap -- draco3d uses c++ style */

import type { Attribute, Decoder, DecoderBuffer, DecoderModule, DracoArray, Mesh, PointCloud } from 'draco3dgltf';
import draco3d from 'draco3dgltf';
import type { Accessor, Buffer as GltfBuffer } from '@gltf-transform/core';
import { Document } from '@gltf-transform/core';

type AttributeTypeConstructor =
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Uint16ArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor
  | Int8ArrayConstructor
  | Int32ArrayConstructor;

// Gltf-transform doesn't support Int32Array
type TypedArray = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int16Array | Int8Array;

type AccessorType = 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';

type AttributeData = {
  array: TypedArray;
  itemSize: number;
  normalized?: boolean;
};

type DecodedDracoData = {
  attributes: Map<string, AttributeData>;
  indices?: Uint32Array;
  isPointCloud: boolean;
};

export class GltfDracoDecoder {
  public verbosity = 0;
  private decoderModule!: DecoderModule;

  private readonly defaultAttributeIDs: Record<string, string> = {
    position: 'POSITION',
    normal: 'NORMAL',
    color: 'COLOR',
    uv: 'TEX_COORD',
  };

  private readonly defaultAttributeTypes: Record<string, AttributeTypeConstructor> = {
    position: Float32Array,
    normal: Float32Array,
    color: Float32Array,
    uv: Float32Array,
  };

  public async initialize(): Promise<void> {
    this.decoderModule = await draco3d.createDecoderModule();
  }

  public setVerbosity(level: number): this {
    this.verbosity = level;
    return this;
  }

  public async createGltfDocument(decodedData: DecodedDracoData): Promise<Document> {
    const document = new Document();
    const root = document.getRoot();

    // Create buffer to hold all geometry data
    const buffer = document.createBuffer();

    // Calculate total buffer size
    let totalBufferSize = 0;
    for (const [, attributeData] of decodedData.attributes) {
      totalBufferSize += attributeData.array.byteLength;
    }

    if (decodedData.indices) {
      totalBufferSize += decodedData.indices.byteLength;
    }

    // Create buffer views and accessors for attributes
    const accessors = new Map<string, Accessor>();
    let bufferOffset = 0;

    // Position is required and should be first
    const positionData = decodedData.attributes.get('position');
    if (!positionData) {
      throw new Error('Position attribute is required');
    }

    // Create accessors for each attribute
    for (const [attributeName, attributeData] of decodedData.attributes) {
      const accessor = this.createAccessorForAttribute(document, buffer, attributeName, attributeData, bufferOffset);
      accessors.set(attributeName, accessor);
      bufferOffset += attributeData.array.byteLength;
    }

    // Create index accessor if needed
    let indexAccessor: Accessor | undefined;
    if (!decodedData.isPointCloud && decodedData.indices) {
      indexAccessor = this.createIndexAccessor(document, buffer, decodedData.indices, bufferOffset);
    }

    // Create mesh and primitive
    const mesh = document.createMesh();
    const primitive = document.createPrimitive();

    // Set primitive mode based on geometry type
    if (decodedData.isPointCloud) {
      primitive.setMode(0); // POINTS
    } else {
      primitive.setMode(4); // TRIANGLES
    }

    // Set attributes using GLTF attribute names
    const positionAccessor = accessors.get('position');
    if (positionAccessor) {
      primitive.setAttribute('POSITION', positionAccessor);
    }

    const normalAccessor = accessors.get('normal');
    if (normalAccessor) {
      primitive.setAttribute('NORMAL', normalAccessor);
    }

    const colorAccessor = accessors.get('color');
    if (colorAccessor) {
      primitive.setAttribute('COLOR_0', colorAccessor);
    }

    const uvAccessor = accessors.get('uv');
    if (uvAccessor) {
      primitive.setAttribute('TEXCOORD_0', uvAccessor);
    }

    // Set indices if not point cloud
    if (indexAccessor) {
      primitive.setIndices(indexAccessor);
    }

    // Create basic material appropriate for the geometry type
    const material = document.createMaterial();
    if (decodedData.isPointCloud) {
      // Point cloud material
      material.setBaseColorFactor([1, 1, 1, 1]);
      if (colorAccessor) {
        // Enable vertex colors for point clouds
        material.setBaseColorFactor([1, 1, 1, 1]);
      }
    } else {
      // Mesh material
      material.setBaseColorFactor([0.8, 0.8, 0.8, 1]);
      material.setMetallicFactor(0.1);
      material.setRoughnessFactor(0.9);
    }

    primitive.setMaterial(material);
    mesh.addPrimitive(primitive);

    // Create scene hierarchy - direct mesh node at root as expected by tests
    const scene = document.createScene();
    const node = document.createNode();
    node.setMesh(mesh);
    scene.addChild(node);
    root.setDefaultScene(scene);

    return document;
  }

  public async decodeDracoFile(
    rawBuffer: ArrayBuffer,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeTypeConstructor>,
  ): Promise<DecodedDracoData> {
    await this.initialize();

    const buffer = new this.decoderModule.DecoderBuffer();
    buffer.Init(new Int8Array(rawBuffer), rawBuffer.byteLength);
    const decoder = new this.decoderModule.Decoder();

    const geometryType = decoder.GetEncodedGeometryType(buffer);
    const isPointCloud = geometryType === this.decoderModule.POINT_CLOUD;

    if (geometryType === this.decoderModule.TRIANGULAR_MESH) {
      if (this.verbosity > 0) {
        console.info('Loaded a mesh.');
      }
    } else if (geometryType === this.decoderModule.POINT_CLOUD) {
      if (this.verbosity > 0) {
        console.info('Loaded a point cloud.');
      }
    } else {
      const errorMessage = 'DRACOLoader: Unknown geometry type.';
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    const decodedData = this.convertDracoGeometry(
      decoder,
      geometryType,
      buffer,
      attributeUniqueIdMap,
      attributeTypeMap,
    );

    return { ...decodedData, isPointCloud };
  }

  private convertDracoGeometry(
    decoder: Decoder,
    geometryType: unknown,
    buffer: DecoderBuffer,
    attributeUniqueIdMap?: Record<string, number>,
    attributeTypeMap?: Record<string, AttributeTypeConstructor>,
  ): Omit<DecodedDracoData, 'isPointCloud'> {
    let dracoGeometry;
    let decodingStatus;

    if (geometryType === this.decoderModule.TRIANGULAR_MESH) {
      dracoGeometry = new this.decoderModule.Mesh();
      decodingStatus = decoder.DecodeBufferToMesh(buffer, dracoGeometry);
    } else {
      dracoGeometry = new this.decoderModule.PointCloud();
      decodingStatus = decoder.DecodeBufferToPointCloud(buffer, dracoGeometry);
    }

    if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
      const errorMessage = `DRACOLoader: Decoding failed: ${decodingStatus.error_msg()}`;
      console.error(errorMessage);
      this.decoderModule.destroy(decoder);
      this.decoderModule.destroy(dracoGeometry);
      throw new Error(errorMessage);
    }

    this.decoderModule.destroy(buffer);

    let numberFaces = 0;
    if (geometryType === this.decoderModule.TRIANGULAR_MESH) {
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

    const posAttId = decoder.GetAttributeId(dracoGeometry, this.decoderModule.POSITION);
    if (posAttId === -1) {
      const errorMessage = 'DRACOLoader: No position attribute found.';
      console.error(errorMessage);
      this.decoderModule.destroy(decoder);
      this.decoderModule.destroy(dracoGeometry);
      throw new Error(errorMessage);
    }

    const attributes = new Map<string, AttributeData>();

    // Use provided attribute maps or defaults
    const attributeIDs = attributeUniqueIdMap ?? this.defaultAttributeIDs;
    const attributeTypes = attributeTypeMap ?? this.defaultAttributeTypes;
    const useUniqueIDs = Boolean(attributeUniqueIdMap);

    // Gather all vertex attributes
    for (const attributeName in attributeIDs) {
      if (!Object.hasOwn(attributeIDs, attributeName)) {
        continue;
      }

      const attributeTypeConstructor = attributeTypes[attributeName];
      if (!attributeTypeConstructor) {
        continue;
      }

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
            dracoConstant = this.decoderModule.POSITION;
            break;
          }

          case 'NORMAL': {
            dracoConstant = this.decoderModule.NORMAL;
            break;
          }

          case 'COLOR': {
            dracoConstant = this.decoderModule.COLOR;
            break;
          }

          case 'TEX_COORD': {
            dracoConstant = this.decoderModule.TEX_COORD;
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

      const attributeData = this.extractAttributeData(
        decoder,
        dracoGeometry,
        attribute,
        attributeTypeConstructor,
        attributeName,
      );

      attributes.set(attributeName, attributeData);
    }

    let indices: Uint32Array | undefined;
    if (geometryType === this.decoderModule.TRIANGULAR_MESH) {
      const numberIndices = numberFaces * 3;
      indices = new Uint32Array(numberIndices);
      const ia = new this.decoderModule.DracoInt32Array();

      for (let i = 0; i < numberFaces; ++i) {
        decoder.GetFaceFromMesh(dracoGeometry as Mesh, i, ia);
        const index = i * 3;
        indices[index] = ia.GetValue(0);
        indices[index + 1] = ia.GetValue(1);
        indices[index + 2] = ia.GetValue(2);
      }

      this.decoderModule.destroy(ia);
    }

    this.decoderModule.destroy(decoder);
    this.decoderModule.destroy(dracoGeometry);

    return { attributes, indices };
  }

  private extractAttributeData(
    decoder: Decoder,
    dracoGeometry: Mesh | PointCloud,
    attribute: Attribute,
    attributeTypeConstructor: AttributeTypeConstructor,
    attributeName: string,
  ): AttributeData {
    const numberComponents = attribute.num_components();
    const numberPoints = dracoGeometry.num_points();
    const numberValues = numberPoints * numberComponents;
    let attributeData: DracoArray;
    let typedArray: TypedArray;

    switch (attributeTypeConstructor) {
      case Float32Array: {
        attributeData = new this.decoderModule.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(dracoGeometry, attribute, attributeData);
        typedArray = new Float32Array(numberValues);
        break;
      }

      case Int8Array: {
        attributeData = new this.decoderModule.DracoInt8Array();
        decoder.GetAttributeInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        typedArray = new Int8Array(numberValues);
        break;
      }

      case Int16Array: {
        attributeData = new this.decoderModule.DracoInt16Array();
        decoder.GetAttributeInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        typedArray = new Int16Array(numberValues);
        break;
      }

      case Int32Array: {
        attributeData = new this.decoderModule.DracoInt32Array();
        decoder.GetAttributeInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        // Convert Int32Array to Uint32Array as gltf-transform doesn't support Int32Array
        const int32Array = new Int32Array(numberValues);
        for (let i = 0; i < numberValues; i++) {
          int32Array[i] = attributeData.GetValue(i);
        }

        typedArray = new Uint32Array(int32Array.buffer);
        // Skip the regular copy loop below for Int32Array since we already copied the data
        this.decoderModule.destroy(attributeData);
        return {
          array: typedArray,
          itemSize: numberComponents,
          normalized: attributeName === 'color' && !(typedArray instanceof Float32Array),
        };
      }

      case Uint8Array: {
        attributeData = new this.decoderModule.DracoUInt8Array();
        decoder.GetAttributeUInt8ForAllPoints(dracoGeometry, attribute, attributeData);
        typedArray = new Uint8Array(numberValues);
        break;
      }

      case Uint16Array: {
        attributeData = new this.decoderModule.DracoUInt16Array();
        decoder.GetAttributeUInt16ForAllPoints(dracoGeometry, attribute, attributeData);
        typedArray = new Uint16Array(numberValues);
        break;
      }

      case Uint32Array: {
        attributeData = new this.decoderModule.DracoUInt32Array();
        decoder.GetAttributeUInt32ForAllPoints(dracoGeometry, attribute, attributeData);
        typedArray = new Uint32Array(numberValues);
        break;
      }

      default: {
        const errorMessage = `DRACOLoader: Unexpected attribute type: ${String(attributeTypeConstructor)}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
    }

    // Copy data from Draco array to typed array
    for (let i = 0; i < numberValues; i++) {
      typedArray[i] = attributeData.GetValue(i);
    }

    // Determine if attribute should be normalized
    const normalized = attributeName === 'color' && !(typedArray instanceof Float32Array);

    this.decoderModule.destroy(attributeData);

    return {
      array: typedArray,
      itemSize: numberComponents,
      normalized,
    };
  }

  private createAccessorForAttribute(
    document: Document,
    buffer: GltfBuffer,
    _attributeName: string,
    data: AttributeData,
    _bufferOffset: number,
  ): Accessor {
    const accessor = document
      .createAccessor()
      .setBuffer(buffer)
      .setArray(data.array)
      .setType(this.getAccessorType(data.itemSize));

    if (data.normalized) {
      accessor.setNormalized(true);
    }

    return accessor;
  }

  private createIndexAccessor(
    document: Document,
    buffer: GltfBuffer,
    indices: Uint32Array,
    _bufferOffset: number,
  ): Accessor {
    // Use the most appropriate index type - Uint32 for large meshes, Uint16 for smaller ones
    const useShort = indices.every((index) => index < 65_536);
    const typedIndices = useShort ? new Uint16Array(indices) : indices;

    const accessor = document.createAccessor().setBuffer(buffer).setArray(typedIndices).setType('SCALAR');

    return accessor;
  }

  private getAccessorType(itemSize: number): AccessorType {
    switch (itemSize) {
      case 1: {
        return 'SCALAR';
      }

      case 2: {
        return 'VEC2';
      }

      case 3: {
        return 'VEC3';
      }

      case 4: {
        return 'VEC4';
      }

      default: {
        throw new Error(`Unsupported item size: ${itemSize}`);
      }
    }
  }
}
