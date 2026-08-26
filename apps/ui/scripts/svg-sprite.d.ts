declare module 'svg-sprite' {
  type SpriteCompilation = {
    data: { symbol: { shapes: Array<{ base: string }> } };
    result: { symbol: { sprite: { contents: { toString(): string }; path: string } } };
  };

  export default class SVGSprite {
    public constructor(config: {
      dest: string;
      mode: { symbol: { sprite: string } };
      shape: object;
      svg: { xmlDeclaration: boolean };
    });

    public add(path: string, name: string, contents: string): void;
    public compileAsync(): Promise<SpriteCompilation>;
  }
}
