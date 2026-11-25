/* eslint-disable no-bitwise, unicorn/prefer-math-trunc -- mulberry32 is 32-bit integer arithmetic. */
/** A number in [0, 1) from a seed (the first output of mulberry32), so a seeded flake fails on known seeds. */
export const seededDraw = (seed: number): number => {
  let state = (seed + 0x6d_2b_79_f5) | 0;
  state = Math.imul(state ^ (state >>> 15), state | 1);
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
  return ((state ^ (state >>> 14)) >>> 0) / 4_294_967_296;
};
