export const resolveTestServerAction = (options: {
  readonly baseUrl: string;
  readonly rootReady: boolean;
  readonly debugReady: boolean;
}): 'start' | 'reuse' => {
  if (!options.rootReady) {
    return 'start';
  }
  if (options.debugReady) {
    return 'reuse';
  }
  throw new Error(
    `A server is already responding at ${options.baseUrl}, but its TAU_DEBUG route is unavailable. Stop that server and rerun ui-e2e.`,
  );
};
