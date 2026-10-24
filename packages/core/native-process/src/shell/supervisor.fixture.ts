/**
 * A stand-in supervisor for orchestration tests: it answers the provider's job with an **unsandboxed**
 * `/bin/sh -c <command>` vector, or with `unavailable` when the command mentions `TAU_FIXTURE_UNAVAILABLE`, and holds
 * until its channel closes, like the real one. It proves the provider's plumbing, never containment.
 */
import { createInterface } from 'node:readline';

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
const first = await lines.next();
const job = JSON.parse(String(first.value)) as { command: string };
const reply = job.command.includes('TAU_FIXTURE_UNAVAILABLE')
  ? { status: 'unavailable', message: 'fixture prerequisite missing' }
  : { status: 'ready', argv: ['/bin/sh', '-c', job.command] };
process.stdout.write(`${JSON.stringify(reply)}\n`);
// oxlint-disable-next-line no-await-in-loop -- drained only to observe the channel closing.
for (let next = await lines.next(); next.done !== true; next = await lines.next()) {
  /* Nothing to do per line. */
}
// oxlint-disable-next-line unicorn/no-process-exit -- the fixture is its own process.
process.exit(0);
