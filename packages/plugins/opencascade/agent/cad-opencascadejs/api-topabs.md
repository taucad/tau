# libcascade — TopAbs

4 top-level symbols. Signatures are verbatim typescript.

TopAbs: declare class TopAbs

  // TopAbs.constructor (constructor)
  constructor();

  // TopAbs.Complement (method)
  static Complement(Or: TopAbs_Orientation): TopAbs_Orientation;

  // TopAbs.ShapeTypeToString (method)
  static ShapeTypeToString(theType: TopAbs_ShapeEnum): string;

  // TopAbs.ShapeTypeFromString (method)
  static ShapeTypeFromString(theTypeString: string): TopAbs_ShapeEnum;
  static ShapeTypeFromString(theTypeString: string, theType?: TopAbs_ShapeEnum): { returnValue: boolean; theType: TopAbs_ShapeEnum };

  // TopAbs.ShapeOrientationToString (method)
  static ShapeOrientationToString(theOrientation: TopAbs_Orientation): string;

  // TopAbs.ShapeOrientationFromString (method)
  static ShapeOrientationFromString(theOrientationString: string): TopAbs_Orientation;
  static ShapeOrientationFromString(theOrientationString: string, theOrientation?: TopAbs_Orientation): { returnValue: boolean; theOrientation: TopAbs_Orientation };

  // TopAbs.delete (method)
  delete(): void;

  // TopAbs.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

TopAbs_Orientation: typeof TopAbs_Orientation[keyof typeof TopAbs_Orientation]

  TopAbs_FORWARD: 'TopAbs_FORWARD'

  TopAbs_REVERSED: 'TopAbs_REVERSED'

  TopAbs_INTERNAL: 'TopAbs_INTERNAL'

  TopAbs_EXTERNAL: 'TopAbs_EXTERNAL'

TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum[keyof typeof TopAbs_ShapeEnum]

  TopAbs_COMPOUND: 'TopAbs_COMPOUND'

  TopAbs_COMPSOLID: 'TopAbs_COMPSOLID'

  TopAbs_SOLID: 'TopAbs_SOLID'

  TopAbs_SHELL: 'TopAbs_SHELL'

  TopAbs_FACE: 'TopAbs_FACE'

  TopAbs_WIRE: 'TopAbs_WIRE'

  TopAbs_EDGE: 'TopAbs_EDGE'

  TopAbs_VERTEX: 'TopAbs_VERTEX'

  TopAbs_SHAPE: 'TopAbs_SHAPE'

TopAbs_State: typeof TopAbs_State[keyof typeof TopAbs_State]

  TopAbs_IN: 'TopAbs_IN'

  TopAbs_OUT: 'TopAbs_OUT'

  TopAbs_ON: 'TopAbs_ON'

  TopAbs_UNKNOWN: 'TopAbs_UNKNOWN'
