/**
 * Extracted from the OpenSCAD User Manual
 *
 * @see https://en.wikibooks.org/wiki/OpenSCAD_User_Manual
 */

type Parameter = {
  /** The name of the parameter, as it appears in the module/function call */
  name: string;
  /** The type of the parameter */
  type: string;
  /** The description of the parameter. Used for hover and signature help. */
  description: string;
  /** Whether the parameter is required */
  required: boolean;
  /** The default value of the parameter */
  defaultValue?: string;
};

type OpenscadSymbol = {
  /** The name of the symbol, as it appears in the code */
  name: string;
  /** The type of the symbol */
  type: 'module' | 'function' | 'constant';
  /** The category of the symbol */
  category: string;
  /** The description of the symbol. Used for hover and signature help. */
  description: string;
  /** The parameters of the symbol */
  parameters?: Parameter[];
  /** The examples of the symbol */
  examples?: string[];
  /** The long-form documentation of the symbol. Used for signature help. */
  documentation?: string;
};

export type OpenscadModuleSymbol = OpenscadSymbol & {
  type: 'module';
};

type OpenscadPrimitiveType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'any'
  | '[number, number]'
  | '[number, number, number]'
  | '[number, number, number, number]';

export type OpenscadFunctionSymbol = OpenscadSymbol & {
  type: 'function';
  returnType: OpenscadPrimitiveType | `${OpenscadPrimitiveType}[]` | 'void';
};

export type OpenscadConstantSymbol = OpenscadSymbol & {
  type: 'constant';
  defaultValue?: string | number | boolean;
};

export const openscadSymbols: OpenscadModuleSymbol[] = [
  // Basic 3D Primitives
  {
    name: 'cube',
    type: 'module',
    category: '3D Primitives',
    description: 'Creates a cube or rectangular prism',
    parameters: [
      { name: 'size', type: 'number | [number, number, number]', description: 'Size of the cube', required: true },
      {
        name: 'center',
        type: 'boolean',
        description: 'Center the cube on origin',
        required: false,
        defaultValue: 'false',
      },
    ],
    examples: ['cube(10);', 'cube([10, 20, 30]);', 'cube(10, center=true);'],
    documentation:
      'Creates a cube with specified dimensions. Can be a single value for all dimensions or an array [x,y,z].',
  },
  {
    name: 'sphere',
    type: 'module',
    category: '3D Primitives',
    description: 'Creates a sphere',
    parameters: [
      { name: 'r', type: 'number', description: 'Radius of the sphere', required: false },
      { name: 'd', type: 'number', description: 'Diameter of the sphere', required: false },
      { name: '$fn', type: 'number', description: 'Number of facets', required: false },
    ],
    examples: ['sphere(r=5);', 'sphere(d=10);', 'sphere(r=5, $fn=50);'],
    documentation: 'Creates a sphere with specified radius or diameter.',
  },
  {
    name: 'cylinder',
    type: 'module',
    category: '3D Primitives',
    description: 'Creates a cylinder or cone',
    parameters: [
      { name: 'h', type: 'number', description: 'Height of cylinder', required: true },
      { name: 'r', type: 'number', description: 'Radius (uniform)', required: false },
      { name: 'r1', type: 'number', description: 'Bottom radius', required: false },
      { name: 'r2', type: 'number', description: 'Top radius', required: false },
      { name: 'd', type: 'number', description: 'Diameter (uniform)', required: false },
      { name: 'center', type: 'boolean', description: 'Center on Z axis', required: false, defaultValue: 'false' },
      { name: '$fn', type: 'number', description: 'Number of facets', required: false },
    ],
    examples: ['cylinder(h=10, r=5);', 'cylinder(h=10, r1=5, r2=2);', 'cylinder(h=10, d=8, center=true);'],
    documentation: 'Creates a cylinder or cone. Use r for uniform radius, or r1/r2 for different top/bottom radii.',
  },
  {
    name: 'polyhedron',
    type: 'module',
    category: '3D Primitives',
    description: 'Creates a polyhedron from points and faces',
    parameters: [
      { name: 'points', type: '[[number, number, number], ...]', description: 'Array of 3D points', required: true },
      { name: 'faces', type: '[number[], ...]', description: 'Array of face indices', required: true },
      { name: 'convexity', type: 'number', description: 'Convexity parameter', required: false },
    ],
    examples: [
      'polyhedron(points=[[0,0,0], [10,0,0], [5,10,0], [5,5,10]], faces=[[0,1,2], [0,1,3], [1,2,3], [0,2,3]]);',
    ],
    documentation: 'Creates a 3D polyhedron from vertex points and face definitions.',
  },
  // 2D Primitives
  {
    name: 'circle',
    type: 'module',
    category: '2D Primitives',
    description: 'Creates a circle',
    parameters: [
      { name: 'r', type: 'number', description: 'Radius of circle', required: false },
      { name: 'd', type: 'number', description: 'Diameter of circle', required: false },
      { name: '$fn', type: 'number', description: 'Number of facets', required: false },
    ],
    examples: ['circle(r=5);', 'circle(d=10);', 'circle(r=5, $fn=100);'],
  },
  {
    name: 'square',
    type: 'module',
    category: '2D Primitives',
    description: 'Creates a square or rectangle',
    parameters: [
      { name: 'size', type: 'number | [number, number]', description: 'Size of square/rectangle', required: true },
      { name: 'center', type: 'boolean', description: 'Center on origin', required: false, defaultValue: 'false' },
    ],
    examples: ['square(10);', 'square([10, 20]);', 'square(10, center=true);'],
  },
  {
    name: 'polygon',
    type: 'module',
    category: '2D Primitives',
    description: 'Creates a polygon from points',
    parameters: [
      { name: 'points', type: '[[number, number], ...]', description: 'Array of 2D points', required: true },
      { name: 'paths', type: 'number[]', description: 'Path indices (optional)', required: false },
    ],
    examples: ['polygon([[0,0], [10,0], [5,10]]);', 'polygon(points=[[0,0], [10,0], [10,10], [0,10]]);'],
  },
  {
    name: 'text',
    type: 'module',
    category: '2D Primitives',
    description: 'Creates 2D text',
    parameters: [
      { name: 'text', type: 'string', description: 'Text to render', required: true },
      { name: 'size', type: 'number', description: 'Font size', required: false, defaultValue: '10' },
      { name: 'font', type: 'string', description: 'Font name', required: false },
      {
        name: 'halign',
        type: '"left" | "center" | "right"',
        description: 'Horizontal alignment',
        required: false,
        defaultValue: '"left"',
      },
      {
        name: 'valign',
        type: '"top" | "center" | "baseline" | "bottom"',
        description: 'Vertical alignment',
        required: false,
        defaultValue: '"baseline"',
      },
      { name: 'spacing', type: 'number', description: 'Letter spacing', required: false, defaultValue: '1' },
      {
        name: 'direction',
        type: '"ltr" | "rtl" | "ttb" | "btt"',
        description: 'Text direction',
        required: false,
        defaultValue: '"ltr"',
      },
      { name: 'language', type: 'string', description: 'Language code', required: false },
      { name: 'script', type: 'string', description: 'Script name', required: false },
    ],
    examples: [
      'text("Hello");',
      'text("World", size=20, font="Arial");',
      'text("Center", halign="center", valign="center");',
    ],
    documentation: 'Creates 2D text that can be extruded or used in 2D operations.',
  },
  // Transformations
  {
    name: 'translate',
    type: 'module',
    category: 'Transformations',
    description: 'Moves objects in 3D space',
    parameters: [{ name: 'v', type: '[number, number, number]', description: 'Translation vector', required: true }],
    examples: ['translate([10, 0, 0]) cube(5);', 'translate([x, y, z]) sphere(r=2);'],
  },
  {
    name: 'rotate',
    type: 'module',
    category: 'Transformations',
    description: 'Rotates objects around axes',
    parameters: [
      {
        name: 'a',
        type: 'number | [number, number, number]',
        description: 'Rotation angle(s) in degrees',
        required: true,
      },
      { name: 'v', type: '[number, number, number]', description: 'Rotation axis vector', required: false },
    ],
    examples: ['rotate([0, 0, 45]) cube(10);', 'rotate(a=45, v=[0, 0, 1]) cube(10);', 'rotate(90) square(10);'],
  },
  {
    name: 'scale',
    type: 'module',
    category: 'Transformations',
    description: 'Scales objects by factor(s)',
    parameters: [
      { name: 'v', type: 'number | [number, number, number]', description: 'Scale factor(s)', required: true },
    ],
    examples: ['scale(2) cube(5);', 'scale([2, 1, 0.5]) cube(10);'],
  },
  {
    name: 'mirror',
    type: 'module',
    category: 'Transformations',
    description: 'Mirrors objects across a plane',
    parameters: [
      { name: 'v', type: '[number, number, number]', description: 'Normal vector of mirror plane', required: true },
    ],
    examples: ['mirror([1, 0, 0]) cube(10);', 'mirror([0, 1, 0]) sphere(5);'],
  },
  {
    name: 'resize',
    type: 'module',
    category: 'Transformations',
    description: 'Resizes objects to specific dimensions',
    parameters: [
      { name: 'newsize', type: '[number, number, number]', description: 'New size [x, y, z]', required: true },
      {
        name: 'auto',
        type: 'boolean | [boolean, boolean, boolean]',
        description: 'Auto-scale proportionally',
        required: false,
      },
    ],
    examples: ['resize([10, 20, 30]) cube(5);', 'resize([20, 0, 0], auto=true) sphere(3);'],
    documentation: 'Resizes objects to fit specified dimensions, optionally maintaining proportions.',
  },
  {
    name: 'multmatrix',
    type: 'module',
    category: 'Transformations',
    description: 'Applies a transformation matrix',
    parameters: [
      {
        name: 'm',
        type: '[[number, number, number, number], ...]',
        description: '4x4 transformation matrix',
        required: true,
      },
    ],
    examples: ['multmatrix([[1,0,0,10], [0,1,0,20], [0,0,1,30], [0,0,0,1]]) cube(5);'],
    documentation: 'Applies a custom 4x4 transformation matrix to objects.',
  },
  {
    name: 'color',
    type: 'module',
    category: 'Transformations',
    description: 'Sets the color of objects',
    parameters: [
      {
        name: 'c',
        type: 'string | [number, number, number] | [number, number, number, number]',
        description: 'Color as name, RGB, or RGBA',
        required: true,
      },
    ],
    examples: ['color("red") cube(10);', 'color([1, 0, 0]) sphere(5);', 'color([0, 1, 0, 0.5]) cylinder(h=10, r=3);'],
    documentation: 'Sets the color of objects for visualization. Does not affect geometry.',
  },
  // Boolean Operations
  {
    name: 'union',
    type: 'module',
    category: 'Boolean Operations',
    description: 'Combines multiple objects (default operation)',
    examples: ['union() { cube(10); translate([5, 0, 0]) sphere(3); }'],
  },
  {
    name: 'difference',
    type: 'module',
    category: 'Boolean Operations',
    description: 'Subtracts objects from the first object',
    examples: ['difference() { cube(10); translate([5, 5, 5]) sphere(3); }'],
  },
  {
    name: 'intersection',
    type: 'module',
    category: 'Boolean Operations',
    description: 'Keeps only the intersection of objects',
    examples: ['intersection() { cube(10); sphere(7); }'],
  },
  // Advanced Operations
  {
    name: 'hull',
    type: 'module',
    category: 'Advanced Operations',
    description: 'Creates convex hull of objects',
    examples: ['hull() { translate([0, 0, 0]) sphere(3); translate([10, 10, 0]) sphere(3); }'],
  },
  {
    name: 'minkowski',
    type: 'module',
    category: 'Advanced Operations',
    description: 'Performs Minkowski sum of objects',
    examples: ['minkowski() { cube(10); sphere(2); }'],
  },
  // Extrusion
  {
    name: 'linear_extrude',
    type: 'module',
    category: 'Extrusion',
    description: 'Extrudes 2D geometries into 3D',
    parameters: [
      { name: 'height', type: 'number', description: 'Extrusion height', required: true },
      { name: 'center', type: 'boolean', description: 'Center on Z axis', required: false, defaultValue: 'false' },
      { name: 'convexity', type: 'number', description: 'Convexity parameter', required: false },
      { name: 'twist', type: 'number', description: 'Twist angle in degrees', required: false },
      { name: 'slices', type: 'number', description: 'Number of slices', required: false },
      { name: 'scale', type: 'number | [number, number]', description: 'Scale factor at top', required: false },
    ],
    examples: ['linear_extrude(height=10) square(5);', 'linear_extrude(height=10, twist=90) square(5);'],
  },
  {
    name: 'rotate_extrude',
    type: 'module',
    category: 'Extrusion',
    description: 'Rotates 2D geometries around Y axis',
    parameters: [
      { name: 'angle', type: 'number', description: 'Rotation angle in degrees', required: false, defaultValue: '360' },
      { name: 'convexity', type: 'number', description: 'Convexity parameter', required: false },
      { name: '$fn', type: 'number', description: 'Number of facets', required: false },
    ],
    examples: ['rotate_extrude() translate([10, 0, 0]) circle(2);', 'rotate_extrude(angle=180) square([5, 10]);'],
  },
  // 2D Operations
  {
    name: 'offset',
    type: 'module',
    category: '2D Operations',
    description: 'Expands or contracts 2D geometries',
    parameters: [
      {
        name: 'r',
        type: 'number',
        description: 'Offset distance (positive=expand, negative=contract)',
        required: false,
      },
      { name: 'delta', type: 'number', description: 'Offset distance (alternative to r)', required: false },
      {
        name: 'chamfer',
        type: 'boolean',
        description: 'Use chamfer instead of round',
        required: false,
        defaultValue: 'false',
      },
    ],
    examples: ['offset(r=2) square(10);', 'offset(delta=-1) circle(5);', 'offset(r=1, chamfer=true) polygon(points);'],
    documentation: 'Creates an offset outline of 2D geometries. Positive values expand, negative values contract.',
  },
  // Other Operations
  {
    name: 'render',
    type: 'module',
    category: 'Other Operations',
    description: 'Forces rendering of CSG operations',
    parameters: [{ name: 'convexity', type: 'number', description: 'Convexity parameter', required: false }],
    examples: ['render() difference() { cube(10); sphere(6); }'],
    documentation: 'Forces immediate rendering of CSG operations for performance optimization.',
  },
  {
    name: 'surface',
    type: 'module',
    category: 'Other Operations',
    description: 'Creates surface from height map image',
    parameters: [
      { name: 'file', type: 'string', description: 'Path to image file', required: true },
      { name: 'center', type: 'boolean', description: 'Center the surface', required: false, defaultValue: 'false' },
      { name: 'convexity', type: 'number', description: 'Convexity parameter', required: false },
    ],
    examples: ['surface(file="heightmap.png");', 'surface(file="terrain.dat", center=true);'],
    documentation: 'Creates a 3D surface from a grayscale height map image.',
  },
  {
    name: 'projection',
    type: 'module',
    category: 'Other Operations',
    description: 'Projects 3D objects to 2D',
    parameters: [
      { name: 'cut', type: 'boolean', description: 'Cut projection at z=0', required: false, defaultValue: 'false' },
    ],
    examples: ['projection() cube(10);', 'projection(cut=true) translate([0, 0, 5]) sphere(8);'],
    documentation: 'Projects 3D objects onto the XY plane to create 2D geometries.',
  },
];
export const openscadFunctions: OpenscadFunctionSymbol[] = [
  // Mathematical Functions
  {
    name: 'sin',
    type: 'function',
    category: 'Mathematical',
    description: 'Sine function',
    parameters: [{ name: 'angle', type: 'number', description: 'Angle in degrees', required: true }],
    returnType: 'number',
    examples: ['sin(30)', 'sin(angle)'],
  },
  {
    name: 'cos',
    type: 'function',
    category: 'Mathematical',
    description: 'Cosine function',
    parameters: [{ name: 'angle', type: 'number', description: 'Angle in degrees', required: true }],
    returnType: 'number',
    examples: ['cos(45)', 'cos(rotation_angle)'],
  },
  {
    name: 'tan',
    type: 'function',
    category: 'Mathematical',
    description: 'Tangent function',
    parameters: [{ name: 'angle', type: 'number', description: 'Angle in degrees', required: true }],
    returnType: 'number',
    examples: ['tan(60)', 'tan(slope_angle)'],
  },
  {
    name: 'acos',
    type: 'function',
    category: 'Mathematical',
    description: 'Arccosine function',
    parameters: [{ name: 'value', type: 'number', description: 'Input value (-1 to 1)', required: true }],
    returnType: 'number',
    examples: ['acos(0.5)', 'acos(cos_value)'],
  },
  {
    name: 'asin',
    type: 'function',
    category: 'Mathematical',
    description: 'Arcsine function',
    parameters: [{ name: 'value', type: 'number', description: 'Input value (-1 to 1)', required: true }],
    returnType: 'number',
    examples: ['asin(0.5)', 'asin(sin_value)'],
  },
  {
    name: 'atan',
    type: 'function',
    category: 'Mathematical',
    description: 'Arctangent function',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['atan(1)', 'atan(slope)'],
  },
  {
    name: 'atan2',
    type: 'function',
    category: 'Mathematical',
    description: 'Two-argument arctangent function',
    parameters: [
      { name: 'y', type: 'number', description: 'Y coordinate', required: true },
      { name: 'x', type: 'number', description: 'X coordinate', required: true },
    ],
    returnType: 'number',
    examples: ['atan2(y, x)', 'atan2(dy, dx)'],
  },
  {
    name: 'sqrt',
    type: 'function',
    category: 'Mathematical',
    description: 'Square root function',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['sqrt(16)', 'sqrt(x*x + y*y)'],
  },
  {
    name: 'pow',
    type: 'function',
    category: 'Mathematical',
    description: 'Power function',
    parameters: [
      { name: 'base', type: 'number', description: 'Base value', required: true },
      { name: 'exponent', type: 'number', description: 'Exponent', required: true },
    ],
    returnType: 'number',
    examples: ['pow(2, 3)', 'pow(radius, 2)'],
  },
  {
    name: 'abs',
    type: 'function',
    category: 'Mathematical',
    description: 'Absolute value function',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['abs(-5)', 'abs(x - center_x)'],
  },
  {
    name: 'min',
    type: 'function',
    category: 'Mathematical',
    description: 'Minimum value from arguments',
    parameters: [{ name: '...values', type: 'number[]', description: 'Values to compare', required: true }],
    returnType: 'number',
    examples: ['min(1, 2, 3)', 'min(width, height)'],
  },
  {
    name: 'max',
    type: 'function',
    category: 'Mathematical',
    description: 'Maximum value from arguments',
    parameters: [{ name: '...values', type: 'number[]', description: 'Values to compare', required: true }],
    returnType: 'number',
    examples: ['max(1, 2, 3)', 'max(width, height)'],
  },
  {
    name: 'ceil',
    type: 'function',
    category: 'Mathematical',
    description: 'Ceiling function (round up)',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['ceil(3.2)', 'ceil(measurement)'],
  },
  {
    name: 'floor',
    type: 'function',
    category: 'Mathematical',
    description: 'Floor function (round down)',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['floor(3.8)', 'floor(calculation)'],
  },
  {
    name: 'round',
    type: 'function',
    category: 'Mathematical',
    description: 'Round to nearest integer',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['round(3.6)', 'round(average)'],
  },
  {
    name: 'sign',
    type: 'function',
    category: 'Mathematical',
    description: 'Sign function (-1, 0, or 1)',
    parameters: [{ name: 'value', type: 'number', description: 'Input value', required: true }],
    returnType: 'number',
    examples: ['sign(-5)', 'sign(difference)'],
  },
  {
    name: 'exp',
    type: 'function',
    category: 'Mathematical',
    description: 'Exponential function (e^x)',
    parameters: [{ name: 'value', type: 'number', description: 'Exponent', required: true }],
    returnType: 'number',
    examples: ['exp(1)', 'exp(rate * time)'],
  },
  {
    name: 'ln',
    type: 'function',
    category: 'Mathematical',
    description: 'Natural logarithm',
    parameters: [{ name: 'value', type: 'number', description: 'Input value (> 0)', required: true }],
    returnType: 'number',
    examples: ['ln(2.718)', 'ln(growth_factor)'],
  },
  {
    name: 'log',
    type: 'function',
    category: 'Mathematical',
    description: 'Base-10 logarithm',
    parameters: [{ name: 'value', type: 'number', description: 'Input value (> 0)', required: true }],
    returnType: 'number',
    examples: ['log(100)', 'log(magnitude)'],
  },
  {
    name: 'rands',
    type: 'function',
    category: 'Mathematical',
    description: 'Generate random numbers',
    parameters: [
      { name: 'min', type: 'number', description: 'Minimum value', required: true },
      { name: 'max', type: 'number', description: 'Maximum value', required: true },
      { name: 'count', type: 'number', description: 'Number of values', required: true },
      { name: 'seed', type: 'number', description: 'Random seed', required: false },
    ],
    returnType: 'number[]',
    examples: ['rands(0, 10, 5)', 'rands(-1, 1, 3, 42)'],
  },
  // Vector/List Functions
  {
    name: 'len',
    type: 'function',
    category: 'Vector/List',
    description: 'Length of vector or list',
    parameters: [{ name: 'vector', type: 'any[]', description: 'Vector or list', required: true }],
    returnType: 'number',
    examples: ['len([1, 2, 3])', 'len(points)'],
  },
  {
    name: 'norm',
    type: 'function',
    category: 'Vector/List',
    description: 'Euclidean norm of vector',
    parameters: [{ name: 'vector', type: 'number[]', description: 'Vector', required: true }],
    returnType: 'number',
    examples: ['norm([3, 4])', 'norm([x, y, z])'],
  },
  {
    name: 'cross',
    type: 'function',
    category: 'Vector/List',
    description: 'Cross product of two 3D vectors',
    parameters: [
      { name: 'a', type: '[number, number, number]', description: 'First vector', required: true },
      { name: 'b', type: '[number, number, number]', description: 'Second vector', required: true },
    ],
    returnType: '[number, number, number]',
    examples: ['cross([1, 0, 0], [0, 1, 0])', 'cross(v1, v2)'],
  },
  // String Functions
  {
    name: 'str',
    type: 'function',
    category: 'String',
    description: 'Convert values to string',
    parameters: [{ name: '...values', type: 'any[]', description: 'Values to convert', required: true }],
    returnType: 'string',
    examples: ['str("value: ", x)', 'str(width, "x", height)'],
  },
  {
    name: 'chr',
    type: 'function',
    category: 'String',
    description: 'Convert ASCII code to character',
    parameters: [{ name: 'code', type: 'number', description: 'ASCII code', required: true }],
    returnType: 'string',
    examples: ['chr(65)', 'chr(ascii_value)'],
  },
  {
    name: 'ord',
    type: 'function',
    category: 'String',
    description: 'Convert character to ASCII code',
    parameters: [{ name: 'char', type: 'string', description: 'Single character', required: true }],
    returnType: 'number',
    examples: ['ord("A")', 'ord(first_char)'],
  },
  {
    name: 'concat',
    type: 'function',
    category: 'Vector/List',
    description: 'Concatenate lists or strings',
    parameters: [{ name: '...arrays', type: 'any[][]', description: 'Arrays to concatenate', required: true }],
    returnType: 'any[]',
    examples: ['concat([1, 2], [3, 4])', 'concat(list1, list2, list3)'],
  },
  {
    name: 'search',
    type: 'function',
    category: 'Vector/List',
    description: 'Search for values in list',
    parameters: [
      { name: 'match_value', type: 'any', description: 'Value to search for', required: true },
      { name: 'list_of_values', type: 'any[]', description: 'List to search in', required: true },
      { name: 'num_returns_per_match', type: 'number', description: 'Number of matches to return', required: false },
      {
        name: 'index_col_num',
        type: 'number',
        description: 'Column index for multi-dimensional search',
        required: false,
      },
    ],
    returnType: 'number[]',
    examples: ['search("abc", ["abc", "def", "abc"])', 'search([3, 4], [[1, 2], [3, 4], [5, 6]])'],
  },
  {
    name: 'lookup',
    type: 'function',
    category: 'Vector/List',
    description: 'Lookup value in table',
    parameters: [
      { name: 'index', type: 'number', description: 'Index value', required: true },
      { name: 'table', type: '[[number, any], ...]', description: 'Lookup table', required: true },
    ],
    returnType: 'any',
    examples: ['lookup(2.5, [[0, 10], [1, 20], [2, 30], [3, 40]])', 'lookup(angle, angle_table)'],
  },
  // Utility Functions
  {
    name: 'echo',
    type: 'function',
    category: 'Utility',
    description: 'Print values to console',
    parameters: [{ name: '...values', type: 'any[]', description: 'Values to print', required: true }],
    returnType: 'void',
    examples: ['echo("Debug:", x)', 'echo("Point:", [x, y])'],
  },
  // System Functions
  {
    name: 'version',
    type: 'function',
    category: 'System',
    description: 'Get OpenSCAD version as string',
    parameters: [],
    returnType: 'string',
    examples: ['echo(version())', 'v = version();'],
  },
  {
    name: 'version_num',
    type: 'function',
    category: 'System',
    description: 'Get OpenSCAD version as number',
    parameters: [],
    returnType: 'number',
    examples: ['echo(version_num())', 'if (version_num() >= 20190500) ...'],
  },
  {
    name: 'parent_module',
    type: 'function',
    category: 'System',
    description: 'Get number of parent modules',
    parameters: [
      { name: 'n', type: 'number', description: 'Parent level (0=current, 1=parent, etc.)', required: false },
    ],
    returnType: 'number',
    examples: ['echo(parent_module())', 'echo(parent_module(1))'],
  },
];
export const openscadConstants: OpenscadConstantSymbol[] = [
  {
    name: '$fn',
    type: 'constant',
    category: 'Special Variables',
    description: 'Number of facets for curved surfaces',
    defaultValue: 0,
    examples: ['$fn = 50;', 'sphere(r=5, $fn=100);'],
    documentation:
      'Usually has the default value of 0. When this variable has a value greater than zero, the other two variables are ignored, and a full circle is rendered using this number of fragments.',
  },
  {
    name: '$fa',
    type: 'constant',
    category: 'Special Variables',
    description: 'Minimum angle for facets',
    defaultValue: 12,
    examples: ['$fa = 12;', '$fa = 6;'],
    documentation:
      'The minimum angle for a fragment. Even a huge circle does not have more fragments than 360 divided by this number. The default value is 12 (i.e. 30 fragments for a full circle).',
  },
  {
    name: '$fs',
    type: 'constant',
    category: 'Special Variables',
    description: 'Minimum facet size',
    defaultValue: 2,
    examples: ['$fs = 2;', '$fs = 0.1;'],
    documentation:
      'The minimum size of a fragment. The default value is 2 so very small circles have a smaller number of fragments than specified using $fa.',
  },
  {
    name: '$t',
    type: 'constant',
    category: 'Special Variables',
    description: 'Animation time variable (0-1)',
    defaultValue: 0,
    examples: ['rotate($t * 360) cube(10);', 'translate([$t * 50, 0, 0]) sphere(2);'],
    documentation: 'Animation time variable that varies from 0 to 1 during animation cycles.',
  },
  {
    name: '$vpr',
    type: 'constant',
    category: 'Special Variables',
    description: 'Viewport rotation [x, y, z]',
    examples: ['$vpr', 'echo("Viewport rotation:", $vpr);'],
    documentation:
      'Contains the current viewport rotation as [x, y, z] angles in degrees. Value depends on current view.',
  },
  {
    name: '$vpt',
    type: 'constant',
    category: 'Special Variables',
    description: 'Viewport translation [x, y, z]',
    examples: ['$vpt', 'echo("Viewport center:", $vpt);'],
    documentation:
      'Contains the current viewport center point as [x, y, z] coordinates. Value depends on current view.',
  },
  {
    name: '$vpd',
    type: 'constant',
    category: 'Special Variables',
    description: 'Viewport distance',
    examples: ['$vpd', 'echo("Viewport distance:", $vpd);'],
    documentation: 'Contains the current viewport camera distance. Value depends on current view zoom level.',
  },
  {
    name: '$vpf',
    type: 'constant',
    category: 'Special Variables',
    description: 'Viewport field of view',
    examples: ['$vpf', 'echo("Viewport FOV:", $vpf);'],
    documentation: 'Contains the current viewport field of view angle. Requires OpenSCAD version 2021.01 or later.',
  },
  {
    name: '$children',
    type: 'constant',
    category: 'Special Variables',
    description: 'Number of child modules',
    examples: ['echo("Children count:", $children);', 'for (i = [0 : $children-1]) children(i);'],
    documentation:
      'Contains the number of child objects in the current module context. Value depends on usage context.',
  },
  {
    name: '$preview',
    type: 'constant',
    category: 'Special Variables',
    description: 'True when in preview mode',
    defaultValue: true,
    examples: ['if ($preview) color("red") cube(10);', 'echo("Preview mode:", $preview);'],
    documentation: 'Boolean variable that is true when rendering in preview mode, false when rendering.',
  },
  {
    name: '$OPENSCAD_VERSION',
    type: 'constant',
    category: 'Special Variables',
    description: 'OpenSCAD version information',
    examples: ['echo("Version:", $OPENSCAD_VERSION);'],
  },
  // Mathematical Constants
  {
    name: 'PI',
    type: 'constant',
    category: 'Mathematical Constants',
    description: 'Mathematical constant π (pi)',
    examples: ['rotate([0, 0, PI * 45 / 180]) cube(10);', 'angle = 2 * PI / segments;'],
    documentation: 'The mathematical constant π (pi), approximately 3.14159.',
  },
  {
    name: 'undef',
    type: 'constant',
    category: 'Special Constants',
    description: 'Undefined value',
    examples: ['x = undef;', 'if (value == undef) echo("Not defined");'],
  },
] as const;
