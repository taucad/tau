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

  readonly TopAbs_FORWARD: 'TopAbs_FORWARD'

  readonly TopAbs_REVERSED: 'TopAbs_REVERSED'

  readonly TopAbs_INTERNAL: 'TopAbs_INTERNAL'

  readonly TopAbs_EXTERNAL: 'TopAbs_EXTERNAL'

TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum[keyof typeof TopAbs_ShapeEnum]

  readonly TopAbs_COMPOUND: 'TopAbs_COMPOUND'

  readonly TopAbs_COMPSOLID: 'TopAbs_COMPSOLID'

  readonly TopAbs_SOLID: 'TopAbs_SOLID'

  readonly TopAbs_SHELL: 'TopAbs_SHELL'

  readonly TopAbs_FACE: 'TopAbs_FACE'

  readonly TopAbs_WIRE: 'TopAbs_WIRE'

  readonly TopAbs_EDGE: 'TopAbs_EDGE'

  readonly TopAbs_VERTEX: 'TopAbs_VERTEX'

  readonly TopAbs_SHAPE: 'TopAbs_SHAPE'

TopAbs_State: typeof TopAbs_State[keyof typeof TopAbs_State]

  readonly TopAbs_IN: 'TopAbs_IN'

  readonly TopAbs_OUT: 'TopAbs_OUT'

  readonly TopAbs_ON: 'TopAbs_ON'

  readonly TopAbs_UNKNOWN: 'TopAbs_UNKNOWN'
