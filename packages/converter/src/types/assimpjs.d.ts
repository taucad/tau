/* eslint-disable no-barrel-files/no-barrel-files -- allowed for this type declaration file */
/* eslint-disable @typescript-eslint/naming-convention -- External library uses PascalCase method names */

// Base module with all type definitions
declare module 'assimpjs' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Required to keep module as ambient type definition
  type EmscriptenModuleConfig = import('#types/emscripten.d.ts').EmscriptenModuleConfig;

  export type AssimpResult = {
    IsSuccess(): boolean;
    FileCount(): number;
    GetFile(index: number): AssimpFile;
    GetErrorCode(): string;
  };

  export type AssimpFile = {
    GetContent(): Uint8Array;
    GetPath(): string;
  };

  export type FileList = {
    AddFile(name: string, content: Uint8Array): void;
  };

  export type AssimpJS = {
    FileList: new () => FileList;
    ConvertFileList(fileList: FileList, format: string): AssimpResult;
  };

  function assimpjs(config?: EmscriptenModuleConfig): Promise<AssimpJS>;
  export default assimpjs;
}

// Re-export everything from the base module
declare module 'assimpjs/all' {
  export * from 'assimpjs';
  export { default } from 'assimpjs';
}

// Re-export everything from the base module
declare module 'assimpjs/exporter' {
  export * from 'assimpjs';
  export { default } from 'assimpjs';
}
