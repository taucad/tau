export const rejectSupersededTimingResult = (result) => {
  if (result.superseded) throw new Error('render superseded during fail-closed timing arm');
};
