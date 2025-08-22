/* eslint-disable new-cap -- External library uses PascalCase method names */
import type { Object3D } from 'three';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from 'three';
import occtimportjs from 'occt-import-js';
import type { ImportResult } from 'occt-import-js';
import type { InputFormat, InputFile } from '#types.js';
import { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';

type OcctOptions = {
  format: InputFormat;
};

export class OcctLoader extends ThreeJsBaseLoader<ImportResult, OcctOptions> {
  private geometryCache = new Map<string, BufferGeometry>();
  private materialCache = new Map<string, MeshStandardMaterial>();

  /**
   * Generate a unique key for geometry based on its data
   */
  private generateGeometryKey(positions: Float32Array, normals: Float32Array | undefined, indices: Uint32Array): string {
    const positionHash = Array.from(positions.slice(0, Math.min(positions.length, 100))).join(',');
    const normalHash = normals ? Array.from(normals.slice(0, Math.min(normals.length, 100))).join(',') : 'no-normals';
    const indexHash = Array.from(indices.slice(0, Math.min(indices.length, 100))).join(',');
    
    return `geo:${positions.length}:${normals?.length ?? 0}:${indices.length}:${positionHash}:${normalHash}:${indexHash}`;
  }

  /**
   * Generate a unique key for material based on its properties
   */
  private generateMaterialKey(color: [number, number, number] | undefined): string {
    if (!color) {
      return '#FFFFFF';
    }
    
    const [red, green, blue] = color;
    // Convert RGB values (0-1 range) to hex (0-255 range)
    const redHex = Math.round(red * 255).toString(16).padStart(2, '0');
    const greenHex = Math.round(green * 255).toString(16).padStart(2, '0');
    const blueHex = Math.round(blue * 255).toString(16).padStart(2, '0');
    
    return `#${redHex}${greenHex}${blueHex}`.toUpperCase();
  }

  /**
   * Create or reuse a geometry from cache
   */
  private getOrCreateGeometry(positions: Float32Array, normals: Float32Array | undefined, indices: Uint32Array): BufferGeometry {
    const key = this.generateGeometryKey(positions, normals, indices);
    
    let geometry = this.geometryCache.get(key);
    if (geometry) {
      return geometry;
    }

    // Create new geometry
    geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    
    if (normals) {
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    }
    
    geometry.setIndex([...indices]);
    
    // Cache the geometry
    this.geometryCache.set(key, geometry);
    
    return geometry;
  }

  /**
   * Create or reuse a material from cache
   */
  private getOrCreateMaterial(color: [number, number, number] | undefined): MeshStandardMaterial {
    const key = this.generateMaterialKey(color);
    
    let material = this.materialCache.get(key);
    if (material) {
      return material;
    }

    // Create new material
    material = new MeshStandardMaterial();
    if (color) {
      const [red, green, blue] = color;
      material.color.setRGB(red, green, blue);
    }
    material.name = key;
    
    // Cache the material
    this.materialCache.set(key, material);
    
    return material;
  }

  /**
   * Clear the geometry and material caches and dispose of resources
   */
  public clearCache(): void {
    // Dispose of all cached geometries
    for (const geometry of this.geometryCache.values()) {
      geometry.dispose();
    }
    this.geometryCache.clear();

    // Dispose of all cached materials
    for (const material of this.materialCache.values()) {
      material.dispose();
    }
    this.materialCache.clear();
  }

  protected async parseAsync(files: InputFile[], options: OcctOptions): Promise<ImportResult> {
    const { data } = this.findPrimaryFile(files);
    // Configure the module to suppress console output
    const moduleConfig = {
      // Suppress console.log output from the WASM module
      print() {
        // Suppress stdout
      },
      printErr() {
        // Suppress stderr
      },
    };

    // Initialize OCCT with the custom module configuration
    const occt = await occtimportjs(moduleConfig);

    // Choose the appropriate method based on the file format
    let result: ImportResult;

    switch (options.format) {
      case 'step':
      case 'stp': {
        result = occt.ReadStepFile(data, undefined);
        break;
      }

      case 'iges':
      case 'igs': {
        result = occt.ReadIgesFile(data, undefined);
        break;
      }

      case 'brep': {
        result = occt.ReadBrepFile(data, undefined);
        break;
      }

      default: {
        throw new Error(`Unsupported format: ${options.format as string}`);
      }
    }

    return result;
  }

  protected mapToObject(parseResult: ImportResult, _options: OcctOptions): Object3D {
    if (!parseResult.success) {
      throw new Error('Failed to parse OCCT file');
    }

    const group = new Group();
    group.name = parseResult.root.name;

    // Create meshes from the result using deduplication
    for (const meshData of parseResult.meshes) {
      // Prepare geometry data
      const positions = new Float32Array(meshData.attributes.position.array);
      const normals = meshData.attributes.normal ? new Float32Array(meshData.attributes.normal.array) : undefined;
      const indices = new Uint32Array(meshData.index.array);

      // Get or create cached geometry and material
      const geometry = this.getOrCreateGeometry(positions, normals, indices);
      const material = this.getOrCreateMaterial(meshData.color);

      const mesh = new Mesh(geometry, material);
      mesh.name = meshData.name;
      group.add(mesh);
    }

    return group;
  }
}
