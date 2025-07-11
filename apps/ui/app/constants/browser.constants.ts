// Check if we're in a browser environment
// eslint-disable-next-line unicorn/no-typeof-undefined -- window can be undefined during SSR
export const isBrowser = typeof globalThis.window !== 'undefined';
