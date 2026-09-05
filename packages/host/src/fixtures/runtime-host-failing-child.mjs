/**
 * A runtime child that dies before it can answer the supervisor's `start`.
 *
 * The daemon must survive this: the agent channel needs the child only for the
 * geometry tools, so a broken compute child is a retriable warning, never a
 * fatal daemon outcome.
 */

// oxlint-disable-next-line unicorn/no-process-exit -- the fixture exists to simulate a child that never becomes ready.
process.exit(9);
