/**
 * Monaco ships `ts.worker.js` without TypeScript declarations; the base class is therefore `any`
 * in consumers. These minimal types restore safe `super` calls and worker entry typing.
 */
declare module 'monaco-editor/esm/vs/language/typescript/ts.worker.js' {
  export type MonacoTsWorkerMirrorModel = {
    readonly uri: { toString(skipEncoding?: boolean): string };
    readonly version: number;
    getValue(): string;
  };

  export type MonacoTsWorkerContext = {
    getMirrorModels(): MonacoTsWorkerMirrorModel[];
  };

  export type MonacoTsWorkerCreateData = {
    readonly compilerOptions: Readonly<Record<string, unknown>>;
    readonly extraLibs: Readonly<Record<string, { content: string; version: number }>>;
    readonly inlayHintsOptions: Readonly<Record<string, unknown>>;
  };

  export class TypeScriptWorker {
    public constructor(context: MonacoTsWorkerContext, createData: MonacoTsWorkerCreateData);
    public _getScriptText(fileName: string): string | undefined;
    public getScriptVersion(fileName: string): string;
  }

  export function initialize(
    factory: (context: MonacoTsWorkerContext, createData: MonacoTsWorkerCreateData) => TypeScriptWorker,
  ): void;

  export function create(context: MonacoTsWorkerContext, createData: MonacoTsWorkerCreateData): TypeScriptWorker;
}
