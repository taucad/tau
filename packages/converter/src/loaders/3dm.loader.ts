import type { Object3D, MeshBasicMaterial } from 'three';
import {
  BufferGeometryLoader,
  Group,
  Mesh,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  Points,
  PointsMaterial,
  Line,
  LineBasicMaterial,
  Color,
  DoubleSide,
  PointLight,
  SpotLight,
  DirectionalLight,
  RectAreaLight,
} from 'three';
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
  Material,
  PhysicallyBasedMaterial,
  Layer,
  Group as RhinoGroup,
} from 'rhino3dm';
import rhino3dm from 'rhino3dm';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

/**
 * Loader for 3dm files for isomorphic environments.
 */
export class ThreeDmLoader extends ThreeJsBaseLoader<Group> {
  private rhino!: RhinoModule;

  protected async parseAsync(data: Uint8Array): Promise<Group> {
    await this.initializeRhino();

    // Parse the 3dm file using rhino3dm
    const doc = this.rhino.File3dm.fromByteArray(data);

    // Create a group to hold all objects
    const group = new Group();

    // Process all objects in the document
    const objects = doc.objects();
    const instanceDefinitionObjects: Object3D[] = [];

    for (let i = 0; i < objects.count; i++) {
      const rhinoObject = objects.get(i);
      const attributes = rhinoObject.attributes();
      const geometry = rhinoObject.geometry();

      const threejsObject = this.createObject(geometry, attributes, doc);

      if (threejsObject) {
        if (attributes.isInstanceDefinitionObject) {
          instanceDefinitionObjects.push(threejsObject);
        } else {
          group.add(threejsObject);
        }
      }
    }

    // Handle instance definitions and references
    this.processInstanceDefinitions(doc, group, instanceDefinitionObjects);

    return group;
  }

  protected mapToObject(parseResult: Group): Object3D {
    return parseResult;
  }

  /**
   * Initialize the rhino3dm library if not already loaded
   */
  private async initializeRhino(): Promise<void> {
    this.rhino = await rhino3dm();
  }

  /**
   * Create Three.js object from Rhino geometry
   */
  private createObject(geometry: GeometryBase, attributes: ObjectAttributes, doc: File3dm): Object3D | undefined {
    // Get object type name
    const { objectType } = geometry;

    switch (objectType) {
      case this.rhino.ObjectType.Mesh: {
        return this.createMesh(geometry as RhinoMesh, attributes, doc);
      }

      case this.rhino.ObjectType.Brep: {
        return this.createBrepAsMesh(geometry as Brep, attributes, doc);
      }

      case this.rhino.ObjectType.Extrusion: {
        return this.createExtrusion(geometry as Extrusion, attributes, doc);
      }

      case this.rhino.ObjectType.Point: {
        return this.createPoint(geometry as Point, attributes, doc);
      }

      case this.rhino.ObjectType.PointSet: {
        return this.createPointSet(geometry as PointCloud, attributes);
      }

      case this.rhino.ObjectType.Curve: {
        return this.createCurve(geometry as Curve, attributes);
      }

      case this.rhino.ObjectType.TextDot: {
        return this.createTextDot(geometry as TextDot, attributes);
      }

      case this.rhino.ObjectType.Light: {
        return this.createLight(geometry as Light, attributes);
      }

      case this.rhino.ObjectType.SubD: {
        return this.createSubD(geometry as SubD, attributes, doc);
      }

      case this.rhino.ObjectType.InstanceReference: {
        // Instance references are handled separately
        return undefined;
      }

      default: {
        console.warn(`Rhino3dmLoader: Unsupported object type: ${objectType}`);
        return undefined;
      }
    }
  }

  /**
   * Create Three.js Point from Rhino Point
   */
  private createPoint(geometry: Point, attributes: ObjectAttributes, doc: File3dm): Points {
    const loader = new BufferGeometryLoader();
    const pt = geometry.location;

    const position = {
      itemSize: 3,
      type: 'Float32Array',
      array: [pt[0], pt[1], pt[2]],
    };

    const drawColor = (attributes.drawColor as (doc: File3dm) => { r: number; g: number; b: number })(doc);
    const colorAttr = {
      itemSize: 3,
      type: 'Float32Array',
      array: [drawColor.r / 255, drawColor.g / 255, drawColor.b / 255],
    };

    const bufferGeometry = loader.parse({
      data: {
        attributes: {
          position,
          color: colorAttr,
        },
      },
    });

    const material = new PointsMaterial({
      vertexColors: true,
      sizeAttenuation: false,
      size: 2,
    });

    const points = new Points(bufferGeometry, material);
    points.userData = this.extractObjectMetadata('Point', attributes, doc);

    if (attributes.name) {
      points.name = attributes.name;
    }

    return points;
  }

  /**
   * Create Three.js Points from Rhino PointSet
   */
  private createPointSet(geometry: PointCloud, attributes: ObjectAttributes): Points {
    const loader = new BufferGeometryLoader();
    const bufferGeometry = loader.parse(geometry.toThreejsJSON());

    let material: PointsMaterial;
    if (bufferGeometry.attributes['color']) {
      material = new PointsMaterial({ vertexColors: true, sizeAttenuation: false, size: 2 });
    } else {
      const drawColor = attributes.drawColor as unknown as { r: number; g: number; b: number };
      const color = new Color(drawColor.r / 255, drawColor.g / 255, drawColor.b / 255);
      material = new PointsMaterial({ color, sizeAttenuation: false, size: 2 });
    }

    const points = new Points(bufferGeometry, material);
    points.userData = this.extractObjectMetadata('PointSet', attributes);

    if (attributes.name) {
      points.name = attributes.name;
    }

    return points;
  }

  /**
   * Create Three.js Line from Rhino Curve
   */
  private createCurve(geometry: Curve, attributes: ObjectAttributes): Line {
    const pts = this.curveToPoints(geometry, 100);

    const position = {
      itemSize: 3,
      type: 'Float32Array',
      array: [] as number[],
    };

    for (const pt of pts) {
      position.array.push(pt[0] ?? 0, pt[1] ?? 0, pt[2] ?? 0);
    }

    const loader = new BufferGeometryLoader();
    const bufferGeometry = loader.parse({
      data: {
        attributes: { position },
      },
    });

    const drawColor = attributes.drawColor as unknown as { r: number; g: number; b: number };
    const color = new Color(drawColor.r / 255, drawColor.g / 255, drawColor.b / 255);
    const material = new LineBasicMaterial({ color });

    const line = new Line(bufferGeometry, material);
    line.userData = this.extractObjectMetadata('Curve', attributes);

    if (attributes.name) {
      line.name = attributes.name;
    }

    return line;
  }

  /**
   * Create Three.js Mesh from Rhino Mesh
   */
  private createMesh(geometry: RhinoMesh, attributes?: ObjectAttributes, doc?: File3dm): Mesh {
    const loader = new BufferGeometryLoader();
    const bufferGeometry = loader.parse(geometry.toThreejsJSON());

    const material = attributes && doc ? this.createMaterial(attributes, doc) : this.createDefaultMaterial();

    if (bufferGeometry.attributes['color']) {
      material.vertexColors = true;
    }

    const mesh = new Mesh(bufferGeometry, material);

    if (attributes) {
      mesh.userData = this.extractObjectMetadata('Mesh', attributes, doc);
      if (attributes.name) {
        mesh.name = attributes.name;
      }
    } else {
      mesh.userData = { objectType: 'Mesh' };
    }

    return mesh;
  }

  /**
   * Create Three.js Mesh from Rhino BREP by converting faces to mesh
   */
  private createBrepAsMesh(geometry: Brep, attributes?: ObjectAttributes, doc?: File3dm): Mesh {
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
    return this.createMesh(mesh, attributes, doc);
  }

  /**
   * Create Three.js Mesh from Rhino Extrusion
   */
  private createExtrusion(geometry: Extrusion, attributes?: ObjectAttributes, doc?: File3dm): Mesh | undefined {
    // eslint-disable-next-line @typescript-eslint/no-restricted-types -- can be null.
    const mesh = geometry.getMesh(this.rhino.MeshType.Any) as RhinoMesh | null;

    if (!mesh) {
      // Rhino compute, a cloud-based service is required to support EXTRUSION geometry meshing.
      throw new Error('Extrusion geometry is not supported for conversion.');
    }

    return this.createMesh(mesh, attributes, doc);
  }

  /**
   * Create Three.js Mesh from Rhino SubD
   */
  private createSubD(geometry: SubD, attributes?: ObjectAttributes, doc?: File3dm): Mesh {
    geometry.subdivide();
    // @ts-expect-error -- createFromSubDControlNet has incorrect type.
    // eslint-disable-next-line @typescript-eslint/no-restricted-types -- can be null.
    const mesh = this.rhino.Mesh.createFromSubDControlNet(geometry) as RhinoMesh | null;

    if (!mesh) {
      // Rhino compute, a cloud-based service is required to support SubD geometry meshing.
      throw new Error('Failed to create mesh from SubD control net');
    }

    return this.createMesh(mesh, attributes, doc);
  }

  /**
   * Create Three.js Points from Rhino TextDot (isomorphic - no canvas/browser dependencies)
   */
  private createTextDot(geometry: TextDot, attributes: ObjectAttributes): Points {
    // Since we can't use canvas in an isomorphic environment,
    // we'll represent TextDots as colored points with the text stored in userData
    const loader = new BufferGeometryLoader();
    const { point } = geometry;

    const position = {
      itemSize: 3,
      type: 'Float32Array',
      array: [point[0] ?? 0, point[1] ?? 0, point[2] ?? 0],
    };

    const bufferGeometry = loader.parse({
      data: {
        attributes: { position },
      },
    });

    const color = attributes.drawColor as unknown as { r: number; g: number; b: number };
    const material = new PointsMaterial({
      color: new Color(color.r / 255, color.g / 255, color.b / 255),
      sizeAttenuation: false,
      size: 8, // Larger size to indicate it's a text dot
    });

    const points = new Points(bufferGeometry, material);
    const metadata = this.extractObjectMetadata('TextDot', attributes);
    metadata['text'] = geometry.text;
    metadata['fontHeight'] = geometry.fontHeight;
    metadata['fontFace'] = geometry.fontFace;
    points.userData = metadata;

    if (attributes.name) {
      points.name = attributes.name;
    }

    return points;
  }

  /**
   * Create Three.js Light from Rhino Light
   */
  // eslint-disable-next-line complexity -- light styles are complex.
  private createLight(geometry: Light, attributes: ObjectAttributes): Object3D {
    let light: PointLight | SpotLight | DirectionalLight | RectAreaLight;

    const lightStyle = geometry.lightStyle as unknown as { name: string };
    const { location } = geometry;

    switch (lightStyle.name) {
      case 'LightStyle_WorldPoint': {
        const pointLight = new PointLight();
        pointLight.castShadow = attributes.castsShadows;
        pointLight.position.set(location[0] ?? 0, location[1] ?? 0, location[2] ?? 0);
        light = pointLight;
        break;
      }

      case 'LightStyle_WorldSpot': {
        const spotLight = new SpotLight();
        const { direction } = geometry;
        spotLight.castShadow = attributes.castsShadows;
        spotLight.position.set(location[0] ?? 0, location[1] ?? 0, location[2] ?? 0);
        spotLight.target.position.set(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0);
        spotLight.angle = geometry.spotAngleRadians;
        light = spotLight;
        break;
      }

      case 'LightStyle_WorldRectangular': {
        const rectLight = new RectAreaLight();
        const { width } = geometry;
        const height = geometry.length;
        const { direction } = geometry;
        const widthValue = Math.abs(width[2] ?? 1);
        const heightValue = Math.abs(height[0] ?? 1);
        rectLight.position.set(
          (location[0] ?? 0) - heightValue / 2,
          location[1] ?? 0,
          (location[2] ?? 0) - widthValue / 2,
        );
        rectLight.height = heightValue;
        rectLight.width = widthValue;
        rectLight.lookAt(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0);
        light = rectLight;
        break;
      }

      case 'LightStyle_WorldDirectional': {
        const dirLight = new DirectionalLight();
        const { direction } = geometry;
        dirLight.castShadow = attributes.castsShadows;
        dirLight.position.set(location[0] ?? 0, location[1] ?? 0, location[2] ?? 0);
        dirLight.target.position.set(direction[0] ?? 0, direction[1] ?? 0, direction[2] ?? 0);
        light = dirLight;
        break;
      }

      default: {
        throw new Error(`Unsupported light style: ${lightStyle.name}`);
      }
    }

    light.intensity = geometry.intensity;

    const lightColor = geometry.diffuse as { r: number; g: number; b: number };
    light.color = new Color(lightColor.r / 255, lightColor.g / 255, lightColor.b / 255);

    light.userData = this.extractObjectMetadata('Light', attributes);

    if (attributes.name) {
      light.name = attributes.name;
    }

    return light;
  }

  /**
   * Process instance definitions and references (simplified)
   */
  private processInstanceDefinitions(_doc: unknown, group: Group, instanceDefinitionObjects: Object3D[]): void {
    // Simplified instance handling - just add instance definition objects to main group
    for (const object of instanceDefinitionObjects) {
      group.add(object);
    }
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
      const t = (domain[0] ?? 0) + (i / pointCount) * ((domain[1] ?? 1) - (domain[0] ?? 0));
      const point = curve.pointAt(t);
      points.push([point[0] ?? 0, point[1] ?? 0, point[2] ?? 0]);
    }

    return points;
  }

  /**
   * Create Three.js material from Rhino attributes and document
   */
  private createMaterial(
    attributes: ObjectAttributes,
    doc: File3dm,
  ): MeshStandardMaterial | MeshPhysicalMaterial | MeshBasicMaterial {
    // Try to get material from document
    const materials = doc.materials();
    let rhinoMaterial: Material | undefined;

    if (attributes.materialIndex >= 0 && attributes.materialIndex < materials.count) {
      rhinoMaterial = materials.get(attributes.materialIndex);
    }

    if (rhinoMaterial) {
      return this.createMaterialFromRhinoMaterial(rhinoMaterial);
    }

    // Fallback to object draw color
    const drawColor = attributes.drawColor as unknown as { r: number; g: number; b: number };
    return new MeshStandardMaterial({
      color: new Color(drawColor.r / 255, drawColor.g / 255, drawColor.b / 255),
      metalness: 0.1,
      roughness: 0.8,
      side: DoubleSide,
    });
  }

  /**
   * Create Three.js material from Rhino Material
   */
  private createMaterialFromRhinoMaterial(
    rhinoMaterial: Material,
  ): MeshStandardMaterial | MeshPhysicalMaterial | MeshBasicMaterial {
    // Check if it's a PBR material
    const pbrMaterial = rhinoMaterial as unknown as PhysicallyBasedMaterial;

    if (pbrMaterial.supported) {
      return this.createPbrMaterial(pbrMaterial);
    }

    // Create standard material from basic Rhino material
    const diffuseColor = rhinoMaterial.diffuseColor as unknown as { r: number; g: number; b: number };
    const specularColor = rhinoMaterial.specularColor as unknown as { r: number; g: number; b: number };

    const material = new MeshStandardMaterial({
      color: new Color(diffuseColor.r / 255, diffuseColor.g / 255, diffuseColor.b / 255),
      metalness: 0.1,
      roughness: 1 - rhinoMaterial.shine / 255, // Convert shine to roughness
      transparent: rhinoMaterial.transparency > 0,
      opacity: 1 - rhinoMaterial.transparency,
      side: DoubleSide,
    });

    // Add reflection color as metalness tint
    if (specularColor.r > 0 || specularColor.g > 0 || specularColor.b > 0) {
      material.metalness = 0.5;
    }

    return material;
  }

  /**
   * Create Three.js PBR material from Rhino PBR material
   */
  private createPbrMaterial(pbrMaterial: PhysicallyBasedMaterial): MeshPhysicalMaterial {
    const baseColor = pbrMaterial.baseColor as unknown as { r: number; g: number; b: number };

    const material = new MeshPhysicalMaterial({
      color: new Color(baseColor.r / 255, baseColor.g / 255, baseColor.b / 255),
      metalness: pbrMaterial.metallic,
      roughness: pbrMaterial.roughness,
      transparent: pbrMaterial.opacity < 1,
      opacity: pbrMaterial.opacity,
      clearcoat: pbrMaterial.clearcoat,
      clearcoatRoughness: pbrMaterial.clearcoatRoughness,
      side: DoubleSide,
    });

    // Set emission (if available in the PBR material)
    const { emission } = pbrMaterial as unknown as { emission?: number };
    if (emission && emission > 0) {
      const { emissionColor } = pbrMaterial as unknown as { emissionColor?: { r: number; g: number; b: number } };
      if (emissionColor) {
        material.emissive = new Color(emissionColor.r / 255, emissionColor.g / 255, emissionColor.b / 255);
        material.emissiveIntensity = emission;
      }
    }

    // Set subsurface scattering
    if (pbrMaterial.subsurface > 0) {
      material.transmission = pbrMaterial.subsurface;
    }

    return material;
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

    // Add group information if document is available
    if (
      doc &&
      metadata['groupIndices'] &&
      Array.isArray(metadata['groupIndices']) &&
      metadata['groupIndices'].length > 0
    ) {
      const groups = doc.groups();
      const groupInfo: unknown[] = [];
      for (const groupIndex of metadata['groupIndices'] as number[]) {
        if (groupIndex >= 0 && groupIndex < groups.count) {
          const group = groups.get(groupIndex);
          groupInfo.push(this.extractGroupInfo(group));
        }
      }

      metadata['groups'] = groupInfo;
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

  /**
   * Extract group information
   */
  private extractGroupInfo(group: RhinoGroup): Record<string, unknown> {
    return {
      name: group.name,
      index: group.index,
    };
  }

  /**
   * Create default material
   */
  private createDefaultMaterial(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: new Color(0.8, 0.8, 0.8),
      metalness: 0.1,
      roughness: 0.8,
      side: DoubleSide,
    });
  }
}
