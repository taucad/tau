declare module 'xstate' {
  // Re-export the actual types if installed; fallback any to satisfy editor when declaration map fails.
  export * from '@xstate/fsm';
}