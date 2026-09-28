type CaseResult = {
  caseId: string;
  repeat: number;
  status: string;
  canonicalResultSha256: unknown;
};

type RunCell = { run: number; result: { perCase: readonly CaseResult[] } };

/** Compare only matching authored calls from the same sequential run. */
export const pairedCaseVerdict = (
  mt: RunCell,
  stCells: readonly RunCell[] | undefined,
  caseId: string,
): 'same' | 'different' | 'unpaired' | 'unsupported' => {
  const st = stCells?.findLast(
    (candidate) => candidate.run === mt.run && candidate.result.perCase.some((row) => row.caseId === caseId),
  );
  if (!st) {
    return 'unpaired';
  }
  const mtRows = mt.result.perCase.filter((row) => row.caseId === caseId);
  const stRows = st.result.perCase.filter((row) => row.caseId === caseId);
  if (mtRows.length === 0) {
    return 'unpaired';
  }
  if (mtRows.some((row) => row.status === 'unsupported') || stRows.some((row) => row.status === 'unsupported')) {
    return 'unsupported';
  }
  if (mtRows.length !== stRows.length) {
    return 'different';
  }
  return mtRows.every((mtRow) => {
    const stRow = stRows.find((row) => row.repeat === mtRow.repeat);
    return (
      mtRow.status === stRow?.status &&
      typeof mtRow.canonicalResultSha256 === 'string' &&
      mtRow.canonicalResultSha256 === stRow.canonicalResultSha256
    );
  })
    ? 'same'
    : 'different';
};
