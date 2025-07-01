declare module '@monaco-editor/react' {
  // Re-export a compatible "Environment" shape so consumer imports compile.
  // The actual structure is defined by monaco at runtime; typing as unknown map.
  export interface Environment {
    [key: string]: unknown;
  }
}