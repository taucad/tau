/**
 * Per-repository ceiling on non-LFS bytes (charter D20, operator ruling O5,
 * 2026-09-18). `pre-receive` enforces it on the incoming quarantine so a push
 * is refused while it arrives; the commit protocol checks the committed total
 * as a backstop, because the hook measures only what this push added.
 *
 * Spelled in the same units as `storageLimitBytesByTier`, which D20 names.
 * Counted over pack bytes only: a stored `.idx` is a derived 0.17 % that the
 * user did not push.
 *
 * Defined in this library, which git builds on, because storage accounting
 * reports quota bands against it and may not import git;
 * the git commit protocol imports it from here, and its other bounds stay in
 * `apps/api/app/api/git/store/limits.ts`.
 */
export const repositoryByteCeiling = 1024 ** 3;
