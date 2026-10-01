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

TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum[keyof typeof TopAbs_ShapeEnum]

TopAbs_State: typeof TopAbs_State[keyof typeof TopAbs_State]
