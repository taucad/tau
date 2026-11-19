/**
 * Why the Share panel's envelope read failed, from its HTTP status (W30, #2304). Only a failed request or a server
 * error is `unreachable`: `410 PROJECT_DELETED` (the project's cloud copy was deleted) and `404` (no cloud project this
 * account can see) are answers that Tau Cloud has no copy (`absent`), never a network fault.
 *
 * @param status - The response status, or `undefined` when the request itself failed.
 * @returns `sign-in` for `401`, else the project's cloud state the failure says (`absent` or `unreachable`).
 */
export const shareEnvelopeFailureOf = (status: number | undefined): 'sign-in' | 'absent' | 'unreachable' => {
  if (status === 401) {
    return 'sign-in';
  }
  if (status === 404 || status === 410) {
    return 'absent';
  }
  return 'unreachable';
};
