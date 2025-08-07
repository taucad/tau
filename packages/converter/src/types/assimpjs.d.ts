/* eslint-disable @typescript-eslint/naming-convention -- External library uses PascalCase method names */
declare module 'assimpjs' {
  export type AssimpResult = {
    IsSuccess(): boolean;
    FileCount(): number;
    GetFile(index: number): AssimpFile;
    GetErrorCode(): string;
  };

  export type AssimpFile = {
    GetContent(): Uint8Array;
  };

  export type FileList = {
    AddFile(name: string, content: Uint8Array): void;
  };

  export type AssimpJS = {
    FileList: new () => FileList;
    ConvertFileList(fileList: FileList, format: string): AssimpResult;
  };

  function assimpjs(): Promise<AssimpJS>;
  export default assimpjs;
}
