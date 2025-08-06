/* eslint-disable @typescript-eslint/no-unsafe-argument -- some three attributes are typed as any */
import { Buffer } from 'node:buffer';
import type { BufferAttribute, BufferGeometry, Object3D, Texture, TypedArray, TypedArrayConstructor } from 'three';
import {
  DoubleSide,
  InterleavedBufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshPhongMaterial,
} from 'three';

/**
 * https://github.com/gkjohnson/collada-exporter-js
 *
 * Usage:
 *  const exporter = new ColladaExporter();
 *
 *  const data = exporter.parse(mesh);
 *
 * Format Definition:
 *  https://www.khronos.org/collada/
 */

export type ColladaExporterOptions = {
  author?: string;
  textureDirectory?: string;
  version?: string;
};

export type ColladaExporterResult = {
  data: string;
  textures: Array<Record<string, unknown>>;
};

type GeometryInfo = { meshid: string; bufferGeometry: BufferGeometry };

type MaterialRepresentation = MeshPhongMaterial | MeshBasicMaterial | MeshLambertMaterial;

class ColladaExporter {
  private options: {
    version: string;
    author: string | undefined;
    textureDirectory: string;
    upAxis: string;
    unitName: string | undefined;
    unitMeter: string | undefined;
  };

  private readonly geometryInfo: WeakMap<BufferGeometry, GeometryInfo>;
  private readonly materialMap: WeakMap<MaterialRepresentation, string>;
  private readonly imageMap: WeakMap<Texture, string>;
  private readonly textures: Array<{
    directory: string;
    name: string;
    ext: string;
    data: Uint8Array;
    original: Texture;
  }>;

  private readonly libraryImages: string[];
  private readonly libraryGeometries: string[];
  private readonly libraryEffects: string[];
  private readonly libraryMaterials: string[];

  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- canvas can be null
  private canvas: HTMLCanvasElement | null;
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- canvas context can be null
  private ctx: CanvasRenderingContext2D | null;

  private transMat: Matrix4 | undefined;

  private readonly getFuncs = ['getX', 'getY', 'getZ', 'getW'] as const;

  public constructor() {
    this.options = {
      version: '1.4.1',
      author: undefined,
      textureDirectory: '',
      upAxis: 'Y_UP',
      unitName: undefined,
      unitMeter: undefined,
    };

    this.geometryInfo = new WeakMap();
    this.materialMap = new WeakMap();
    this.imageMap = new WeakMap();
    this.textures = [];

    this.libraryImages = [];
    this.libraryGeometries = [];
    this.libraryEffects = [];
    this.libraryMaterials = [];

    this.canvas = null;
    this.ctx = null;

    this.transMat = undefined;
  }

  public parse(
    object: Object3D,
    onDone: (result: ColladaExporterResult) => void,
    options: ColladaExporterOptions = {},
  ): ColladaExporterResult | undefined {
    this.options = { ...this.options, ...options };

    if (/^[XYZ]_UP$/.exec(this.options.upAxis) === null) {
      console.error('ColladaExporter: Invalid upAxis: valid values are X_UP, Y_UP or Z_UP.');
      return undefined;
    }

    if (this.options.unitName !== undefined && this.options.unitMeter === undefined) {
      console.error('ColladaExporter: unitMeter needs to be specified if unitName is specified.');
      return undefined;
    }

    if (this.options.unitMeter !== undefined && this.options.unitName === undefined) {
      console.error('ColladaExporter: unitName needs to be specified if unitMeter is specified.');
      return undefined;
    }

    if (this.options.textureDirectory !== '') {
      this.options.textureDirectory = `${this.options.textureDirectory}/`.replaceAll('\\', '/').replaceAll(/\/+/g, '/');
    }

    if (this.options.version !== '1.4.1' && this.options.version !== '1.5.0') {
      console.warn(`ColladaExporter : Version ${this.options.version} not supported for export. Only 1.4.1 and 1.5.0.`);
      return undefined;
    }

    const libraryVisualScenes = this.processObject(object);

    const specLink =
      this.options.version === '1.4.1'
        ? 'http://www.collada.org/2005/11/COLLADASchema'
        : 'https://www.khronos.org/collada/';
    let dae = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>${`<COLLADA xmlns="${specLink}" version="${this.options.version}">`}<asset><contributor><authoring_tool>three.js Collada Exporter</authoring_tool>${
      this.options.author ? `<author>${this.options.author}</author>` : ''
    }</contributor>${`<created>${new Date().toISOString()}</created>`}${`<modified>${new Date().toISOString()}</modified>`}<up_axis>Y_UP</up_axis></asset>`;

    dae += `<library_images>${this.libraryImages.join('')}</library_images>`;

    dae += `<library_effects>${this.libraryEffects.join('')}</library_effects>`;

    dae += `<library_materials>${this.libraryMaterials.join('')}</library_materials>`;

    dae += `<library_geometries>${this.libraryGeometries.join('')}</library_geometries>`;

    dae += `<library_visual_scenes><visual_scene id="Scene" name="scene">${libraryVisualScenes}</visual_scene></library_visual_scenes>`;

    dae += '<scene><instance_visual_scene url="#Scene"/></scene>';

    dae += '</COLLADA>';

    const result = {
      data: this.format(dae),
      textures: this.textures,
    };

    if (typeof onDone === 'function') {
      requestAnimationFrame(() => {
        onDone(result);
      });
    }

    return result;
  }

  // Convert the urdf xml into a well-formatted, indented format
  private format(urdf: string): string {
    const isEndTag = '</';
    const isSelfClosing = /(\?>$)|(\/>$)/;
    const hasText = /<[^>]+>[^<]*<\/[^<]+>/;

    const pad = (ch: string, number_: number): string => (number_ > 0 ? ch + pad(ch, number_ - 1) : '');

    let tagnum = 0;

    return (
      urdf
        .match(/(<[^>]+>[^<]+<\/[^<]+>)|(<[^>]+>)/g)
        ?.map((tag) => {
          if (!hasText.test(tag) && !isSelfClosing.test(tag) && tag.startsWith(isEndTag)) {
            tagnum--;
          }

          const result = `${pad('  ', tagnum)}${tag}`;

          if (!hasText.test(tag) && !isSelfClosing.test(tag) && !tag.startsWith(isEndTag)) {
            tagnum++;
          }

          return result;
        })
        .join('\n') ?? ''
    );
  }

  // Convert an image into a png format for saving
  private base64ToBuffer(string_: string): Uint8Array {
    const b = Buffer.from(string_, 'base64').toString('utf8');
    const buf = new Uint8Array(b.length);

    for (let i = 0, l = buf.length; i < l; i++) {
      buf[i] = b.codePointAt(i)!;
    }

    return buf;
  }

  private imageToData(image: CanvasImageSource, ext: string): Uint8Array {
    this.canvas ??= document.createElement('canvas');
    this.ctx ??= this.canvas.getContext('2d');

    // @ts-expect-error -- image.width can be unavailable
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- image.width can be unavailable
    this.canvas.width = image.width instanceof SVGAnimatedLength ? 0 : image.width;
    // @ts-expect-error -- image.width can be unavailable
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- image.height can be unavailable
    this.canvas.height = image.height instanceof SVGAnimatedLength ? 0 : image.height;

    this.ctx?.drawImage(image, 0, 0);

    // Get the base64 encoded data
    const base64data = this.canvas.toDataURL(`image/${ext}`, 1).replace(/^data:image\/(png|jpg);base64,/, '');

    // Convert to a uint8 array
    return this.base64ToBuffer(base64data);
  }

  // Gets the attribute array. Generate a new array if the attribute is interleaved
  private attrBufferToArray(attr: InterleavedBufferAttribute | BufferAttribute): number[] | ArrayLike<number> {
    if (attr instanceof InterleavedBufferAttribute) {
      // Use the typed array constructor to save on memory
      // eslint-disable-next-line @typescript-eslint/naming-convention -- this is a constructor
      const TypedArrayConstructor = attr.array.constructor as TypedArrayConstructor;
      const array = new TypedArrayConstructor(attr.count * attr.itemSize);
      const size = attr.itemSize;

      for (let i = 0, l = attr.count; i < l; i++) {
        for (let j = 0; j < size; j++) {
          array[i * size + j] = attr[this.getFuncs[j]!](i);
        }
      }

      return array;
    }

    return attr.array;
  }

  // Returns an array of the same type starting at the `st` index,
  // and `ct` length
  private subArray(array: number[] | ArrayLike<number>, start: number, count: number): TypedArray | number[] {
    if (Array.isArray(array)) {
      return array.slice(start, start + count);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention -- this is a constructor
    const TypedArrayConstructor = array.constructor as TypedArrayConstructor;
    // @ts-expect-error -- array.buffer is not typed
    return new TypedArrayConstructor(array.buffer, start * array.BYTES_PER_ELEMENT, count);
  }

  // Returns the string for a geometry's attribute
  private getAttribute(
    attr: InterleavedBufferAttribute | BufferAttribute,
    name: string,
    parameters: string[],
    type: string,
  ): string {
    const array = this.attrBufferToArray(attr);
    const result = Array.isArray(array)
      ? `${
          `<source id="${name}"><float_array id="${name}-array" count="${array.length}">` + array.join(' ')
        }</float_array><technique_common>${`<accessor source="#${name}-array" count="${Math.floor(
          array.length / attr.itemSize,
        )}" stride="${attr.itemSize}">`}${parameters
          .map((n) => `<param name="${n}" type="${type}" />`)
          .join('')}</accessor></technique_common></source>`
      : '';

    return result;
  }

  // Returns the string for a node's transform information
  private getTransform(object3d: Object3D): string {
    // Ensure the object's matrix is up to date
    // before saving the transform
    object3d.updateMatrix();

    this.transMat ??= new Matrix4();
    this.transMat.copy(object3d.matrix);
    this.transMat.transpose();
    return `<matrix>${this.transMat.toArray().join(' ')}</matrix>`;
  }

  // Process the given piece of geometry into the geometry library
  // Returns the mesh id
  private processGeometry(bufferGeometry: BufferGeometry): GeometryInfo {
    let info = this.geometryInfo.get(bufferGeometry);

    if (!info) {
      const position = bufferGeometry.attributes['position']!;

      const meshid = `Mesh${this.libraryGeometries.length + 1}`;

      const indexCount = bufferGeometry.index
        ? bufferGeometry.index.count * bufferGeometry.index.itemSize
        : position.count;

      const groups =
        bufferGeometry.groups.length > 0 ? bufferGeometry.groups : [{ start: 0, count: indexCount, materialIndex: 0 }];

      const gname = bufferGeometry.name ? ` name="${bufferGeometry.name}"` : '';
      let gnode = `<geometry id="${meshid}"${gname}><mesh>`;

      // Define the geometry node and the vertices for the geometry
      const posName = `${meshid}-position`;
      const vertName = `${meshid}-vertices`;
      gnode += this.getAttribute(position, posName, ['X', 'Y', 'Z'], 'float');
      gnode += `<vertices id="${vertName}"><input semantic="POSITION" source="#${posName}" /></vertices>`;

      // NOTE: We're not optimizing the attribute arrays here, so they're all the same length and
      // can therefore share the same triangle indices. However, MeshLab seems to have trouble opening
      // models with attributes that share an offset.
      // MeshLab Bug#424: https://sourceforge.net/p/meshlab/bugs/424/

      // serialize normals
      let triangleInputs = `<input semantic="VERTEX" source="#${vertName}" offset="0" />`;
      if ('normal' in bufferGeometry.attributes) {
        const normName = `${meshid}-normal`;
        gnode += this.getAttribute(bufferGeometry.attributes['normal'], normName, ['X', 'Y', 'Z'], 'float');
        triangleInputs += `<input semantic="NORMAL" source="#${normName}" offset="0" />`;
      }

      // Serialize uvs
      if ('uv' in bufferGeometry.attributes) {
        const uvName = `${meshid}-texcoord`;
        gnode += this.getAttribute(bufferGeometry.attributes['uv'], uvName, ['S', 'T'], 'float');
        triangleInputs += `<input semantic="TEXCOORD" source="#${uvName}" offset="0" set="0" />`;
      }

      // Serialize lightmap uvs
      if ('uv2' in bufferGeometry.attributes) {
        const uvName = `${meshid}-texcoord2`;
        gnode += this.getAttribute(bufferGeometry.attributes['uv2'], uvName, ['S', 'T'], 'float');
        triangleInputs += `<input semantic="TEXCOORD" source="#${uvName}" offset="0" set="1" />`;
      }

      // Serialize colors
      if ('color' in bufferGeometry.attributes) {
        const colName = `${meshid}-color`;
        gnode += this.getAttribute(bufferGeometry.attributes['color'], colName, ['X', 'Y', 'Z'], 'uint8');
        triangleInputs += `<input semantic="COLOR" source="#${colName}" offset="0" />`;
      }

      let indexArray: number[] | ArrayLike<number>;
      if (bufferGeometry.index) {
        indexArray = this.attrBufferToArray(bufferGeometry.index);
      } else {
        indexArray = Array.from({ length: indexCount });
        for (let i = 0, l = indexArray.length; i < l && Array.isArray(indexArray); i++) {
          indexArray[i] = i;
        }
      }

      for (let i = 0, l = groups.length; i < l; i++) {
        const group = groups[i]!;
        const subarr = this.subArray(indexArray, group.start, group.count);
        const polycount = subarr.length / 3;
        gnode += `<triangles material="MESH_MATERIAL_${group.materialIndex}" count="${polycount}">`;
        gnode += triangleInputs;

        gnode += `<p>${subarr.join(' ')}</p>`;
        gnode += '</triangles>';
      }

      gnode += '</mesh></geometry>';

      this.libraryGeometries.push(gnode);

      info = { meshid, bufferGeometry };
      this.geometryInfo.set(bufferGeometry, info);
    }

    return info;
  }

  // Process the given texture into the image library
  // Returns the image library
  private processTexture(texture: Texture): string {
    let texid = this.imageMap.get(texture);
    if (texid === undefined) {
      texid = `image-${this.libraryImages.length + 1}`;

      const ext = 'png';
      const name = texture.name || texid;
      let imageNode = `<image id="${texid}" name="${name}">`;

      // eslint-disable-next-line unicorn/prefer-ternary -- more readable
      if (this.options.version === '1.5.0') {
        imageNode += `<init_from><ref>${this.options.textureDirectory}${name}.${ext}</ref></init_from>`;
      } else {
        // Version image node 1.4.1
        imageNode += `<init_from>${this.options.textureDirectory}${name}.${ext}</init_from>`;
      }

      imageNode += '</image>';

      this.libraryImages.push(imageNode);
      this.imageMap.set(texture, texid);
      this.textures.push({
        directory: this.options.textureDirectory,
        name,
        ext,
        data: this.imageToData(texture.image, ext),
        original: texture,
      });
    }

    return texid;
  }

  // Process the given material into the material and effect libraries
  // Returns the material id
  // eslint-disable-next-line complexity -- more readable
  private processMaterial(mesh: MaterialRepresentation): string {
    let matid = this.materialMap.get(mesh);

    if (matid === undefined) {
      matid = `Mat${this.libraryEffects.length + 1}`;

      let type = 'phong';

      if (mesh instanceof MeshLambertMaterial) {
        type = 'lambert';
      } else if (mesh instanceof MeshBasicMaterial) {
        type = 'constant';

        if (mesh.map !== null) {
          // The Collada spec does not support diffuse texture maps with the
          // constant shader type.
          // mrdoob/three.js#15469
          console.warn('ColladaExporter: Texture maps not supported with MeshBasicMaterial.');
        }
      }

      if (mesh instanceof MeshPhongMaterial) {
        const { emissive } = mesh;
        const diffuse = mesh.color;
        const { specular } = mesh;
        const shininess = mesh.shininess || 0;
        const reflectivity = mesh.reflectivity || 0;

        // Do not export and alpha map for the reasons mentioned in issue (#13792)
        // in three.js alpha maps are black and white, but collada expects the alpha
        // channel to specify the transparency
        let transparencyNode = '';
        if (mesh.transparent) {
          transparencyNode += `<transparent>${
            mesh.map ? '<texture texture="diffuse-sampler"></texture>' : '<float>1</float>'
          }</transparent>`;

          if (mesh.opacity < 1) {
            transparencyNode += `<transparency><float>${mesh.opacity}</float></transparency>`;
          }
        }

        const techniqueNode = `${`<technique sid="common"><${type}>`}<emission>${
          mesh.emissiveMap
            ? '<texture texture="emissive-sampler" texcoord="TEXCOORD" />'
            : `<color sid="emission">${emissive.r} ${emissive.g} ${emissive.b} 1</color>`
        }</emission>${
          type === 'constant'
            ? ''
            : `<diffuse>${
                mesh.map
                  ? '<texture texture="diffuse-sampler" texcoord="TEXCOORD" />'
                  : `<color sid="diffuse">${diffuse.r} ${diffuse.g} ${diffuse.b} 1</color>`
              }</diffuse>`
        }${
          type === 'constant'
            ? ''
            : `<bump>${mesh.normalMap ? '<texture texture="bump-sampler" texcoord="TEXCOORD" />' : ''}</bump>`
        }${
          type === 'phong'
            ? `${`<specular><color sid="specular">${specular.r} ${specular.g} ${specular.b} 1</color></specular>`}<shininess>${
                mesh.specularMap
                  ? '<texture texture="specular-sampler" texcoord="TEXCOORD" />'
                  : `<float sid="shininess">${shininess}</float>`
              }</shininess>`
            : ''
        }${`<reflective><color>${diffuse.r} ${diffuse.g} ${diffuse.b} 1</color></reflective>`}${`<reflectivity><float>${reflectivity}</float></reflectivity>`}${transparencyNode}${`</${type}></technique>`}`;

        const effectnode = `${`<effect id="${matid}-effect">`}<profile_COMMON>${
          mesh.map
            ? `<newparam sid="diffuse-surface"><surface type="2D">${`<init_from>${this.processTexture(
                mesh.map,
              )}</init_from>`}</surface></newparam><newparam sid="diffuse-sampler"><sampler2D><source>diffuse-surface</source></sampler2D></newparam>`
            : ''
        }${
          mesh.specularMap
            ? `<newparam sid="specular-surface"><surface type="2D">${`<init_from>${this.processTexture(
                mesh.specularMap,
              )}</init_from>`}</surface></newparam><newparam sid="specular-sampler"><sampler2D><source>specular-surface</source></sampler2D></newparam>`
            : ''
        }${
          mesh.emissiveMap
            ? `<newparam sid="emissive-surface"><surface type="2D">${`<init_from>${this.processTexture(
                mesh.emissiveMap,
              )}</init_from>`}</surface></newparam><newparam sid="emissive-sampler"><sampler2D><source>emissive-surface</source></sampler2D></newparam>`
            : ''
        }${
          mesh.normalMap
            ? `<newparam sid="bump-surface"><surface type="2D">${`<init_from>${this.processTexture(
                mesh.normalMap,
              )}</init_from>`}</surface></newparam><newparam sid="bump-sampler"><sampler2D><source>bump-surface</source></sampler2D></newparam>`
            : ''
        }${techniqueNode}${
          mesh.side === DoubleSide
            ? '<extra><technique profile="THREEJS"><double_sided sid="double_sided" type="int">1</double_sided></technique></extra>'
            : ''
        }</profile_COMMON></effect>`;

        const materialName = mesh.name ? ` name="${mesh.name}"` : '';
        const materialNode = `<material id="${matid}"${materialName}><instance_effect url="#${matid}-effect" /></material>`;

        this.libraryMaterials.push(materialNode);
        this.libraryEffects.push(effectnode);
        this.materialMap.set(mesh, matid);
      }
    }

    return matid;
  }

  // Recursively process the object into a scene
  private processObject(object3d: Object3D): string {
    let node = `<node name="${object3d.name}">`;

    node += this.getTransform(object3d);

    if (object3d instanceof Mesh && object3d.geometry !== null) {
      // Function returns the id associated with the mesh and a "BufferGeometry" version
      // of the geometry in case it's not a geometry.
      const geomInfo = this.processGeometry(object3d.geometry);
      const { meshid } = geomInfo;
      const geometry = geomInfo.bufferGeometry;

      // Ids of the materials to bind to the geometry
      let matids = null;

      // Get a list of materials to bind to the sub groups of the geometry.
      // If the amount of subgroups is greater than the materials, than reuse
      // the materials.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- material can be any
      const material: MaterialRepresentation | MaterialRepresentation[] = object3d.material ?? new MeshBasicMaterial();
      const materials = Array.isArray(material) ? material : [material];

      const matidsArray =
        geometry.groups.length > materials.length
          ? Array.from({ length: geometry.groups.length })
          : Array.from({ length: materials.length });

      matids = matidsArray.fill(null).map((_, i) => this.processMaterial(materials[i % materials.length]!));

      node += `${
        `<instance_geometry url="#${meshid}">` +
        `<bind_material><technique_common>${matids
          .map(
            (id, i) =>
              `${`<instance_material symbol="MESH_MATERIAL_${i}" target="#${id}" >`}<bind_vertex_input semantic="TEXCOORD" input_semantic="TEXCOORD" input_set="0" /></instance_material>`,
          )
          .join('')}</technique_common></bind_material>`
      }</instance_geometry>`;
    }

    for (const c of object3d.children) {
      node += this.processObject(c);
    }

    node += '</node>';

    return node;
  }
}

export { ColladaExporter };
