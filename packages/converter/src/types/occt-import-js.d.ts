declare module 'occt-import-js' {
  /**
   * Linear unit options for the output
   */
  export type LinearUnit = 'millimeter' | 'centimeter' | 'meter' | 'inch' | 'foot';

  /**
   * Linear deflection type options
   */
  export type LinearDeflectionType = 'bounding_box_ratio' | 'absolute_value';

  /**
   * Triangulation parameters for import functions
   */
  export type TriangulationParameters = {
    /**
     * Defines the linear unit of the output. Default is 'millimeter'.
     * Has no effect on brep files.
     */
    linearUnit?: LinearUnit;

    /**
     * Defines what the linear deflection value means. Default is 'bounding_box_ratio'.
     */
    linearDeflectionType?: LinearDeflectionType;

    /**
     * The linear deflection value based on the value of the linearDeflectionType parameter.
     */
    linearDeflection?: number;

    /**
     * The angular deflection value.
     */
    angularDeflection?: number;
  };

  /**
   * RGB color array [r, g, b]
   */
  export type RgbColor = [number, number, number];

  /**
   * Face representation from the source b-rep
   */
  export type BrepFace = {
    /**
     * The first triangle index of the face
     */
    first: number;

    /**
     * The last triangle index of the face
     */
    last: number;

    /**
     * RGB color values or undefined
     */
    color: RgbColor | undefined;
  };

  /**
   * Vertex attributes compatible with three.js
   */
  export type MeshAttributes = {
    position: {
      /**
       * Array of number triplets defining the vertex positions
       */
      array: number[];
    };
    normal?: {
      /**
       * Array of number triplets defining the normal vectors
       */
      array: number[];
    };
  };

  /**
   * Mesh index data
   */
  type MeshIndex = {
    /**
     * Array of number triplets defining triangles by indices
     */
    array: number[];
  };

  /**
   * Mesh object with geometry representation compatible with three.js
   */
  export type Mesh = {
    /**
     * Name of the mesh
     */
    name: string;

    /**
     * RGB color values (optional)
     */
    color?: RgbColor;

    /**
     * Array representing the faces of the source b-rep
     */
    brep_faces: BrepFace[];

    /**
     * Vertex attributes
     */
    attributes: MeshAttributes;

    /**
     * Triangle indices
     */
    index: MeshIndex;
  };

  /**
   * Node in the hierarchy tree
   */
  export type Node = {
    /**
     * Name of the node
     */
    name: string;

    /**
     * Indices of the meshes in the meshes array for this node
     */
    meshes: number[];

    /**
     * Array of child nodes for this node
     */
    children: Node[];
  };

  /**
   * Result object returned by import functions
   */
  export type ImportResult = {
    /**
     * Tells if the import was successful
     */
    success: boolean;

    /**
     * The root node of the hierarchy
     */
    root: Node;

    /**
     * Array of mesh objects
     */
    meshes: Mesh[];
  };

  /**
   * OCCT Import JS interface
   */
  export type OcctImportJs = {
    /**
     * Import brep file
     * @param content - The file content as a Uint8Array object
     * @param parameters - Triangulation parameters, can be undefined
     * @returns Import result object
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External library uses PascalCase
    ReadBrepFile(content: Uint8Array, parameters: TriangulationParameters | undefined): ImportResult;

    /**
     * Import step file
     * @param content - The file content as a Uint8Array object
     * @param parameters - Triangulation parameters, can be undefined
     * @returns Import result object
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External library uses PascalCase
    ReadStepFile(content: Uint8Array, parameters: TriangulationParameters | undefined): ImportResult;

    /**
     * Import iges file
     * @param content - The file content as a Uint8Array object
     * @param parameters - Triangulation parameters, can be undefined
     * @returns Import result object
     */
    // eslint-disable-next-line @typescript-eslint/naming-convention -- External library uses PascalCase
    ReadIgesFile(content: Uint8Array, parameters: TriangulationParameters | undefined): ImportResult;
  };

  /**
   * Factory function that returns a Promise resolving to the OCCT Import JS interface
   */
  function occtimportjs(): Promise<OcctImportJs>;

  export = occtimportjs;
}
