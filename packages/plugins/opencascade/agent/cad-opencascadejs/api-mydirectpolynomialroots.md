# libcascade — MyDirectPolynomialRoots

1 top-level symbols. Signatures are verbatim typescript.

MyDirectPolynomialRoots: declare class MyDirectPolynomialRoots

  // MyDirectPolynomialRoots.constructor (constructor)
  constructor(A2: number, A1: number, A0: number);
  constructor(A4: number, A3: number, A2: number, A1: number, A0: number);

  // MyDirectPolynomialRoots.NbSolutions (method)
  NbSolutions(): number;

  // MyDirectPolynomialRoots.Value (method)
  Value(i: number): number;

  // MyDirectPolynomialRoots.IsDone (method)
  IsDone(): number;

  // MyDirectPolynomialRoots.InfiniteRoots (method)
  InfiniteRoots(): boolean;

  // MyDirectPolynomialRoots.delete (method)
  delete(): void;

  // MyDirectPolynomialRoots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
