import { Document } from '@gltf-transform/core';
import type { Buffer as GltfBuffer, Material, Mesh, Node, Scene } from '@gltf-transform/core';
import { BaseLoader, type BaseLoaderOptions } from '#loaders/base.loader.js';
import type { File } from '#types.js';
import { createNodeIO } from '#gltf.utils.js';
import { createCoordinateTransform, createScalingTransform } from '#gltf.transforms.js';
import type {
  RhinoModule,
  File3dm,
  GeometryBase,
  ObjectAttributes,
  Mesh as RhinoMesh,
  Brep,
  Curve,
  Point,
  PointCloud,
  Extrusion,
  SubD,
  TextDot,
  Light,
  Material as RhinoMaterial,
  PhysicallyBasedMaterial,
  Layer,
  InstanceReference,
  InstanceDefinition,
  File3dmObject,
} from 'rhino3dm';
import rhino3dm from 'rhino3dm';

// Type for rhino3dm geometry JSON structure
type RhinoGeometryJSON = {
  data: {
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
      color?: { array: number[] };
    };
    index?: { array: number[] };
  };
};

type ThreeDmLoaderOptions = {
  transformYtoZup?: boolean;
  scaleMetersToMillimeters?: boolean;
} & BaseLoaderOptions;

/**
 * Loader for 3dm files using gltf-transform directly (no Three.js dependency).
 */
export class ThreeDmLoader extends BaseLoader<Document, ThreeDmLoaderOptions> {
  private rhino!: RhinoModule;
  private readonly instanceIdToDefinition = new Map<string, InstanceDefinition>();
  private readonly instanceIdToObject = new Map<string, File3dmObject>();

  protected async parseAsync(files: File[], _options: ThreeDmLoaderOptions): Promise<Document> {
    await this.initializeRhino();

    const { data } = this.findPrimaryFile(files);

    // Parse the 3dm file using rhino3dm
    const doc = this.rhino.File3dm.fromByteArray(data);

    // Create gltf-transform document
    const document = new Document();
    const scene = document.createScene();
    const buffer = document.createBuffer();

    // Initialize instance maps
    this.initInstanceMaps(doc);

    // Process all objects
    const objects = doc.objects();
    for (let i = 0; i < objects.count; i++) {
      const rhinoObject = objects.get(i);
      this.processRhinoObject(doc, rhinoObject, [], scene, document, buffer);
    }

    return document;
  }

  protected async mapToGlb(document: Document, options: ThreeDmLoaderOptions): Promise<Uint8Array> {
    const io = await createNodeIO();

    // Apply transformations
    await document.transform(
      createCoordinateTransform(options.transformYtoZup ?? false),
      createScalingTransform(options.scaleMetersToMillimeters ?? false),
    );

    // Export to GLB
    const glb = await io.writeBinary(document);
    return new Uint8Array(glb);
  }

  /**
   * Initialize the rhino3dm library if not already loaded
   */
  private async initializeRhino(): Promise<void> {
    this.rhino = await rhino3dm();
  }

  /**
   * Initialize instance maps by cataloging all instance definition objects and definitions
   */
  private initInstanceMaps(doc: File3dm): void {
    // Clear previous maps
    this.instanceIdToDefinition.clear();
    this.instanceIdToObject.clear();

    // Map all instance definition objects
    const objects = doc.objects();
    for (let i = 0; i < objects.count; i++) {
      const rhinoObject = objects.get(i);
      const attributes = rhinoObject.attributes();
      if (attributes.isInstanceDefinitionObject) {
        this.instanceIdToObject.set(attributes.id, rhinoObject);
      }
    }

    // Map all instance definitions
    const instanceDefinitions = doc.instanceDefinitions();
    for (let i = 0; i < instanceDefinitions.count; i++) {
      const instanceDefinition = instanceDefinitions.get(i);
      this.instanceIdToDefinition.set(instanceDefinition.id, instanceDefinition);
    }
  }

  /**
   * Process a Rhino object recursively, handling instances with transformation stack
   */
  private processRhinoObject(
    doc: File3dm,
    rhinoObject: File3dmObject,
    transformationStack: number[][],
    parentNode: Scene | Node,
    document: Document,
    buffer: GltfBuffer,
  ): void {
    const geometry = rhinoObject.geometry();
    const attributes = rhinoObject.attributes();
    const { objectType } = geometry;

    // Skip instance definition objects unless we're processing them through an instance reference
    if (attributes.isInstanceDefinitionObject && transformationStack.length === 0) {
      return;
    }

    // Handle different geometry types
    if (objectType.constructor.name === 'ObjectType_InstanceReference') {
      // Handle instance reference by recursively processing referenced objects
      const instanceRef = geometry as InstanceReference;
      const parentDefinitionId = instanceRef.parentIdefId;

      if (this.instanceIdToDefinition.has(parentDefinitionId)) {
        const instanceDefinition = this.instanceIdToDefinition.get(parentDefinitionId)!;
        const instanceObjectIds = instanceDefinition.getObjectIds() as string[];

        // Create transformation matrix from the instance reference
        const xformArray = instanceRef.xform.toFloatArray(false);

        // Add this transformation to the stack
        const newTransformationStack = [...transformationStack, xformArray];

        // Process each object in the instance definition
        for (const instanceObjectId of instanceObjectIds) {
          if (this.instanceIdToObject.has(instanceObjectId)) {
            const instanceObject = this.instanceIdToObject.get(instanceObjectId);
            this.processRhinoObject(doc, instanceObject!, newTransformationStack, parentNode, document, buffer);
          }
        }
      }
    } else {
      // Process regular geometry (Mesh, Extrusion, Brep, etc.)
      const result = this.createObject(geometry, attributes, doc, document, buffer);
      if (result) {
        const { node } = result;
        
        // Apply accumulated transformations from the transformation stack
        if (transformationStack.length > 0) {
          // Compose all transformations into a single matrix
          const composedMatrix = this.composeTransformationStack(transformationStack);
          node.setMatrix(composedMatrix);
        }

        // Set layer visibility (only for objects not in transformation stack)
        if (transformationStack.length === 0) {
          const layers = doc.layers();
          if (attributes.layerIndex >= 0 && attributes.layerIndex < layers.count) {
            const layer = layers.get(attributes.layerIndex);
            // Store visibility in extras since gltf-transform nodes don't have direct visibility
            const extras = node.getExtras() || {};
            extras['visible'] = layer.visible;
            node.setExtras(extras);
          }
        }

        parentNode.addChild(node);
      }
    }
  }

  /**
   * Create gltf-transform objects from Rhino geometry
   */
  private createObject(
    geometry: GeometryBase,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } | undefined {
    // Get object type name
    const { objectType } = geometry;

    switch (objectType) {
      case this.rhino.ObjectType.Mesh: {
        return this.createMeshFromRhino(geometry as RhinoMesh, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.Brep: {
        return this.createBrepAsMesh(geometry as Brep, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.Extrusion: {
        return this.createExtrusionAsMesh(geometry as Extrusion, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.Point: {
        return this.createPointAsPoints(geometry as Point, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.PointSet: {
        return this.createPointSetAsPoints(geometry as PointCloud, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.Curve: {
        return this.createCurveAsLine(geometry as Curve, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.TextDot: {
        return this.createTextDotAsPoints(geometry as TextDot, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.Light: {
        return this.createLightAsPoints(geometry as Light, attributes, document, buffer);
      }

      case this.rhino.ObjectType.SubD: {
        return this.createSubDAsMesh(geometry as SubD, attributes, doc, document, buffer);
      }

      case this.rhino.ObjectType.InstanceReference: {
        // Instance references are handled separately
        return undefined;
      }

      default: {
        console.warn(`ThreeDmLoader: Unsupported object type: ${objectType}`);
        return undefined;
      }
    }
  }

  /**
   * Create gltf-transform mesh from Rhino Mesh
   */
  private createMeshFromRhino(
    geometry: RhinoMesh,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const threeGeometry = geometry.toThreejsJSON() as RhinoGeometryJSON;
    
    // Extract vertex data
    const positions = new Float32Array(threeGeometry.data.attributes.position.array);
    const normals = threeGeometry.data.attributes.normal 
      ? new Float32Array(threeGeometry.data.attributes.normal.array) 
      : undefined;
    const colors = threeGeometry.data.attributes.color
      ? new Float32Array(threeGeometry.data.attributes.color.array)
      : undefined;
    const indices = threeGeometry.data.index
      ? new Uint32Array(threeGeometry.data.index.array)
      : undefined;

    // Create accessors
    const positionAccessor = document.createAccessor()
      .setArray(positions)
      .setType('VEC3')
      .setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setMode(4) // TRIANGLES
      .setAttribute('POSITION', positionAccessor);

    if (indices) {
      const indexAccessor = document.createAccessor()
        .setArray(indices)
        .setType('SCALAR')
        .setBuffer(buffer);
      primitive.setIndices(indexAccessor);
    }

    if (normals) {
      const normalAccessor = document.createAccessor()
        .setArray(normals)
        .setType('VEC3')
        .setBuffer(buffer);
      primitive.setAttribute('NORMAL', normalAccessor);
    }

    if (colors) {
      const colorAccessor = document.createAccessor()
        .setArray(colors)
        .setType('VEC3')
        .setBuffer(buffer);
      primitive.setAttribute('COLOR_0', colorAccessor);
    }

    // Create material
    const material = this.createGltfMaterial(attributes, doc, document);
    primitive.setMaterial(material);

    // Create mesh and node
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);

    // Set metadata
    const metadata = this.extractObjectMetadata('Mesh', attributes, doc);
    node.setExtras(metadata);

    if (attributes.name) {
      mesh.setName(attributes.name);
      node.setName(attributes.name);
    }

    return { mesh, node };
  }

  /**
   * Create gltf-transform mesh from Rhino BREP by converting faces to mesh
   */
  private createBrepAsMesh(
    geometry: Brep,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const faces = geometry.faces();
    const mesh = new this.rhino.Mesh();

    // Try to convert each face to mesh
    for (let faceIndex = 0; faceIndex < faces.count; faceIndex++) {
      const face = faces.get(faceIndex);
      // eslint-disable-next-line @typescript-eslint/no-restricted-types -- can be null.
      const faceMesh = face.getMesh(this.rhino.MeshType.Any) as RhinoMesh | null;

      if (faceMesh) {
        mesh.append(faceMesh);
      }
    }

    if (mesh.faces().count === 0) {
      // Rhino compute, a cloud-based service is required to support BREP geometry meshing.
      throw new Error('BREP geometry is not supported for conversion.');
    }

    mesh.compact();
    return this.createMeshFromRhino(mesh, attributes, doc, document, buffer);
  }

  /**
   * Create gltf-transform mesh from Rhino Extrusion
   */
  private createExtrusionAsMesh(
    geometry: Extrusion,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    // eslint-disable-next-line @typescript-eslint/no-restricted-types -- can be null.
    const mesh = geometry.getMesh(this.rhino.MeshType.Any) as RhinoMesh | null;

    if (!mesh) {
      // Rhino compute, a cloud-based service is required to support EXTRUSION geometry meshing.
      throw new Error('Extrusion geometry is not supported for conversion.');
    }

    return this.createMeshFromRhino(mesh, attributes, doc, document, buffer);
  }

  /**
   * Create gltf-transform mesh from Rhino SubD
   */
  private createSubDAsMesh(
    geometry: SubD,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    geometry.subdivide();
    // @ts-expect-error -- createFromSubDControlNet has incorrect type.
    // eslint-disable-next-line @typescript-eslint/no-restricted-types -- can be null.
    const mesh = this.rhino.Mesh.createFromSubDControlNet(geometry) as RhinoMesh | null;

    if (!mesh) {
      // Rhino compute, a cloud-based service is required to support SubD geometry meshing.
      throw new Error('Failed to create mesh from SubD control net');
    }

    return this.createMeshFromRhino(mesh, attributes, doc, document, buffer);
  }

  /**
   * Create gltf-transform points from Rhino Point
   */
  private createPointAsPoints(
    geometry: Point,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const point = geometry.location;
    const positions = new Float32Array([point[0]!, point[1]!, point[2]!]);

    const drawColor = (attributes.drawColor as (doc: File3dm) => { r: number; g: number; b: number })(doc);
    const colors = new Float32Array([drawColor.r / 255, drawColor.g / 255, drawColor.b / 255]);

    // Create accessors
    const positionAccessor = document.createAccessor()
      .setArray(positions)
      .setType('VEC3')
      .setBuffer(buffer);

    const colorAccessor = document.createAccessor()
      .setArray(colors)
      .setType('VEC3')
      .setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setMode(0) // POINTS
      .setAttribute('POSITION', positionAccessor)
      .setAttribute('COLOR_0', colorAccessor);

    // Create basic material for points
    const material = document.createMaterial()
      .setBaseColorFactor([1, 1, 1, 1]);
    primitive.setMaterial(material);

    // Create mesh and node
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);

    // Set metadata
    const metadata = this.extractObjectMetadata('Point', attributes, doc);
    node.setExtras(metadata);

    if (attributes.name) {
      mesh.setName(attributes.name);
      node.setName(attributes.name);
    }

    return { mesh, node };
  }

  /**
   * Create gltf-transform points from Rhino PointSet
   */
  private createPointSetAsPoints(
    geometry: PointCloud,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const threeGeometry = geometry.toThreejsJSON() as RhinoGeometryJSON;
    
    const positions = new Float32Array(threeGeometry.data.attributes.position.array);
    const colors = threeGeometry.data.attributes.color
      ? new Float32Array(threeGeometry.data.attributes.color.array)
      : undefined;

    // Create accessors
    const positionAccessor = document.createAccessor()
      .setArray(positions)
      .setType('VEC3')
      .setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setMode(0) // POINTS
      .setAttribute('POSITION', positionAccessor);

    let material: Material;
    if (colors) {
      const colorAccessor = document.createAccessor()
        .setArray(colors)
        .setType('VEC3')
        .setBuffer(buffer);
      primitive.setAttribute('COLOR_0', colorAccessor);
      
      material = document.createMaterial()
        .setBaseColorFactor([1, 1, 1, 1]);
    } else {
      const color = this.extractColor(attributes, doc);
      material = document.createMaterial()
        .setBaseColorFactor([color.r, color.g, color.b, 1]);
    }

    primitive.setMaterial(material);

    // Create mesh and node
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);

    // Set metadata
    const metadata = this.extractObjectMetadata('PointSet', attributes);
    node.setExtras(metadata);

    if (attributes.name) {
      mesh.setName(attributes.name);
      node.setName(attributes.name);
    }

    return { mesh, node };
  }

  /**
   * Create gltf-transform line from Rhino Curve
   */
  private createCurveAsLine(
    geometry: Curve,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const pts = this.curveToPoints(geometry, 100);
    const positions = new Float32Array(pts.length * 3);

    for (let i = 0; i < pts.length; i++) {
      const pt = pts[i]!;
      positions[i * 3] = pt[0]!;
      positions[i * 3 + 1] = pt[1]!;
      positions[i * 3 + 2] = pt[2]!;
    }

    // Create accessors
    const positionAccessor = document.createAccessor()
      .setArray(positions)
      .setType('VEC3')
      .setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setMode(3) // LINE_STRIP
      .setAttribute('POSITION', positionAccessor);

    // Create material with color
    const color = this.extractColor(attributes, doc);
    const material = document.createMaterial()
      .setBaseColorFactor([color.r, color.g, color.b, 1]);
    primitive.setMaterial(material);

    // Create mesh and node
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);

    // Set metadata
    const metadata = this.extractObjectMetadata('Curve', attributes);
    node.setExtras(metadata);

    if (attributes.name) {
      mesh.setName(attributes.name);
      node.setName(attributes.name);
    }

    return { mesh, node };
  }

  /**
   * Create gltf-transform points from Rhino TextDot (store text in metadata)
   */
  private createTextDotAsPoints(
    geometry: TextDot,
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const { point } = geometry;
    const positions = new Float32Array([point[0]!, point[1]!, point[2]!]);

    // Create accessors
    const positionAccessor = document.createAccessor()
      .setArray(positions)
      .setType('VEC3')
      .setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setMode(0) // POINTS
      .setAttribute('POSITION', positionAccessor);

    // Create material with color
    const color = this.extractColor(attributes, doc);
    const material = document.createMaterial()
      .setBaseColorFactor([color.r, color.g, color.b, 1]);
    primitive.setMaterial(material);

    // Create mesh and node
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);

    // Set metadata including text content
    const metadata = this.extractObjectMetadata('TextDot', attributes);
    metadata['text'] = geometry.text;
    metadata['fontHeight'] = geometry.fontHeight;
    metadata['fontFace'] = geometry.fontFace;
    node.setExtras(metadata);

    if (attributes.name) {
      mesh.setName(attributes.name);
      node.setName(attributes.name);
    }

    return { mesh, node };
  }

  /**
   * Create gltf-transform points from Rhino Light (lights represented as colored points with metadata)
   */
  private createLightAsPoints(
    geometry: Light,
    attributes: ObjectAttributes,
    document: Document,
    buffer: GltfBuffer,
  ): { mesh: Mesh; node: Node } {
    const { location } = geometry;
    const positions = new Float32Array([location[0]!, location[1]!, location[2]!]);

    // Create accessors
    const positionAccessor = document.createAccessor()
      .setArray(positions)
      .setType('VEC3')
      .setBuffer(buffer);

    const primitive = document.createPrimitive()
      .setMode(0) // POINTS
      .setAttribute('POSITION', positionAccessor);

    // Create material with light color
    const lightColor = geometry.diffuse as { r: number; g: number; b: number };
    const material = document.createMaterial()
      .setBaseColorFactor([lightColor.r / 255, lightColor.g / 255, lightColor.b / 255, 1]);
    primitive.setMaterial(material);

    // Create mesh and node
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);

    // Set metadata including light properties
    const lightStyle = geometry.lightStyle as unknown as { name: string };
    const metadata = this.extractObjectMetadata('Light', attributes);
    metadata['lightStyle'] = lightStyle.name;
    metadata['intensity'] = geometry.intensity;
    metadata['diffuse'] = lightColor;
    
    // Add direction for directional/spot lights
    if (lightStyle.name.includes('Directional') || lightStyle.name.includes('Spot')) {
      metadata['direction'] = geometry.direction;
    }
    
    if (lightStyle.name.includes('Spot')) {
      metadata['spotAngleRadians'] = geometry.spotAngleRadians;
    }
    
    if (lightStyle.name.includes('Rectangular')) {
      metadata['width'] = geometry.width;
      metadata['length'] = geometry.length;
    }
    
    node.setExtras(metadata);

    if (attributes.name) {
      mesh.setName(attributes.name);
      node.setName(attributes.name);
    }

    return { mesh, node };
  }

  /**
   * Compose transformation stack by multiplying matrices in order
   */
  private composeTransformationStack(
    transformationStack: number[][]
  ): [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number] {
    // Start with identity matrix
    let result = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1
    ];

    // Multiply matrices from the stack in reverse order (parent to child)
    for (let i = transformationStack.length - 1; i >= 0; i--) {
      const matrix = transformationStack[i]!;
      result = this.multiplyMatrices(result, matrix);
    }

    return result as [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];
  }

  /**
   * Multiply two 4x4 matrices (column-major order)
   */
  private multiplyMatrices(a: number[], b: number[]): number[] {
    const result = new Array(16).fill(0);

    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        for (let k = 0; k < 4; k++) {
          result[col * 4 + row] += a[k * 4 + row]! * b[col * 4 + k]!;
        }
      }
    }

    return result;
  }

  /**
   * Convert curve to points array (simplified)
   */
  private curveToPoints(curve: Curve, pointLimit: number): number[][] {
    const pointCount = Math.min(pointLimit, 100);
    const points: number[][] = [];

    if (curve instanceof this.rhino.LineCurve) {
      return [curve.pointAtStart, curve.pointAtEnd];
    }

    // Simplified curve sampling
    const { domain } = curve;
    for (let i = 0; i <= pointCount; i++) {
      const t = domain[0]! + (i / pointCount) * ((domain[1] ?? 1) - domain[0]!);
      const point = curve.pointAt(t);
      points.push([point[0]!, point[1]!, point[2]!]);
    }

    return points;
  }

  /**
   * Create gltf-transform material from Rhino attributes and document
   */
  private createGltfMaterial(
    attributes: ObjectAttributes,
    doc: File3dm,
    document: Document,
  ): Material {
    // Try to get material from document
    const materials = doc.materials();
    let rhinoMaterial: RhinoMaterial | undefined;

    if (attributes.materialIndex >= 0 && attributes.materialIndex < materials.count) {
      rhinoMaterial = materials.get(attributes.materialIndex);
    }

    if (rhinoMaterial) {
      return this.createMaterialFromRhinoMaterial(rhinoMaterial, document);
    }

    // Fallback to object draw color
    const color = this.extractColor(attributes, doc);
    return document.createMaterial()
      .setBaseColorFactor([color.r, color.g, color.b, 1])
      .setMetallicFactor(0.1)
      .setRoughnessFactor(0.8);
  }

  /**
   * Create gltf-transform material from Rhino Material
   */
  private createMaterialFromRhinoMaterial(
    rhinoMaterial: RhinoMaterial,
    document: Document,
  ): Material {
    // Check if it's a PBR material
    const pbrMaterial = rhinoMaterial as unknown as PhysicallyBasedMaterial;

    if (pbrMaterial.supported) {
      return this.createPbrMaterial(pbrMaterial, document);
    }

    // Create standard material from basic Rhino material
    const diffuseColor = rhinoMaterial.diffuseColor as unknown as { r: number; g: number; b: number };
    const specularColor = rhinoMaterial.specularColor as unknown as { r: number; g: number; b: number };

    const material = document.createMaterial()
      .setBaseColorFactor([diffuseColor.r / 255, diffuseColor.g / 255, diffuseColor.b / 255, 1])
      .setMetallicFactor(0.1)
      .setRoughnessFactor(1 - rhinoMaterial.shine / 255); // Convert shine to roughness

    if (rhinoMaterial.transparency > 0) {
      material.setAlphaMode('BLEND');
      material.getBaseColorFactor()[3] = 1 - rhinoMaterial.transparency;
    }

    // Add reflection color as metalness tint
    if (specularColor.r > 0 || specularColor.g > 0 || specularColor.b > 0) {
      material.setMetallicFactor(0.5);
    }

    return material;
  }

  /**
   * Create gltf-transform PBR material from Rhino PBR material
   */
  private createPbrMaterial(pbrMaterial: PhysicallyBasedMaterial, document: Document): Material {
    const baseColor = pbrMaterial.baseColor as unknown as { r: number; g: number; b: number };

    const material = document.createMaterial()
      .setBaseColorFactor([baseColor.r / 255, baseColor.g / 255, baseColor.b / 255, pbrMaterial.opacity])
      .setMetallicFactor(pbrMaterial.metallic)
      .setRoughnessFactor(pbrMaterial.roughness);

    if (pbrMaterial.opacity < 1) {
      material.setAlphaMode('BLEND');
    }

    // Set emission (if available in the PBR material)
    const { emission } = pbrMaterial as unknown as { emission?: number };
    if (emission && emission > 0) {
      const { emissionColor } = pbrMaterial as unknown as { emissionColor?: { r: number; g: number; b: number } };
      if (emissionColor) {
        material.setEmissiveFactor([emissionColor.r / 255, emissionColor.g / 255, emissionColor.b / 255]);
      }
    }

    return material;
  }

  /**
   * Extract color from attributes
   */
  private extractColor(attributes: ObjectAttributes, doc: File3dm): { r: number; g: number; b: number } {
    // @ts-expect-error -- rhino3dm types are not correct.
    const drawColor = attributes.drawColor(doc) as { r: number; g: number; b: number };
    return {
      r: drawColor.r / 255,
      g: drawColor.g / 255,
      b: drawColor.b / 255,
    };
  }

  /**
   * Extract comprehensive metadata from Rhino object attributes
   */
  private extractObjectMetadata(
    objectType: string,
    attributes: ObjectAttributes,
    doc?: File3dm,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      objectType,
      // Basic attributes
      layerIndex: attributes.layerIndex,
      materialIndex: attributes.materialIndex,
      mode: attributes.mode,
      visible: attributes.visible,
      // IDs and references
      groupIndices: attributes.getGroupList(),
      // Object properties
      castsShadows: attributes.castsShadows,
      receivesShadows: attributes.receivesShadows,
      // User data
      userStringCount: attributes.userStringCount,
    };

    // Add name if available
    if (attributes.name) {
      metadata['name'] = attributes.name;
    }

    // Extract user strings
    if (attributes.userStringCount > 0) {
      const userStrings: Record<string, string> = {};
      const userStringKeys = attributes.getUserStrings();
      for (const key of userStringKeys) {
        const value = attributes.getUserString(key);
        if (value) {
          userStrings[key] = value;
        }
      }

      metadata['userStrings'] = userStrings;
    }

    // Add layer information if document is available
    if (doc && attributes.layerIndex >= 0) {
      const layers = doc.layers();
      if (attributes.layerIndex < layers.count) {
        const layer = layers.get(attributes.layerIndex);
        metadata['layer'] = this.extractLayerInfo(layer);
      }
    }

    return metadata;
  }

  /**
   * Extract layer information
   */
  private extractLayerInfo(layer: Layer): Record<string, unknown> {
    return {
      name: layer.name,
      color: layer.color,
      visible: layer.visible,
      locked: layer.locked,
      index: layer.index,
      parentLayerId: layer.parentLayerId,
    };
  }
}
