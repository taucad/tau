declare module 'comlink' {
  export type Remote<T> = {
    [K in keyof T]: T[K] extends (...args: infer P) => infer R ? (...args: P) => Promise<R> : Promise<T[K]>;
  };

  export function wrap<T>(endpoint: any): Remote<T>;
  export function expose<T>(obj: T, endpoint?: any): void;

  export const transfer: <T>(obj: T, transfers: readonly Transferable[]) => T;
  export const proxy: <T extends object>(obj: T) => T;
}