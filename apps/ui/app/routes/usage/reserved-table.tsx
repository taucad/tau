import { useEffect, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@taucad/ui/components/table';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party usage surface owns the direct billing client contract
import { formatCreditAtomsDisplay } from '@taucad/billing';
import type { WireOpenHolds } from '@taucad/billing';
import { useOpenHolds } from '@taucad/billing/hooks/use-open-holds';

type OpenHold = WireOpenHolds['holds'][number];

/** Matches the hook's poll, so an age and a release both move without a reload. */
const tickInterval = 15_000;

/** Plain-language dispatch state; the wire spells these for the ledger, not for a reader. */
/* eslint-disable @typescript-eslint/naming-convention -- keys are the ledger's own dispatch states */
const dispatchLabels: Record<OpenHold['dispatchState'], string> = {
  admitted: 'Starting',
  intent_recorded: 'Sending',
  accepted: 'Running',
  recovery_required: 'Recovering',
};
/* eslint-enable @typescript-eslint/naming-convention -- ledger dispatch states end here */

/**
 * What a reader needs from a hold: it is running, or its time to live has passed
 * and the reserve is coming back (journey 3).
 */
const holdState = (hold: OpenHold, now: number): string =>
  now > Date.parse(hold.releaseAfter) ? 'Being released' : dispatchLabels[hold.dispatchState];

/**
 * The reserves open on the account right now, newest first.
 *
 * Every number is the server's: the held credits are the operation's authorized
 * maximum, not a charge, and a row disappears when its hold is released. An
 * unavailable read renders nothing rather than an account with nothing reserved.
 *
 * @returns The reserved table, or nothing when no hold is open.
 */
export function ReservedTable(): React.JSX.Element | undefined {
  const holds = useOpenHolds();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, tickInterval);
    return () => {
      clearInterval(timer);
    };
  }, []);

  if (holds === undefined || holds.holds.length === 0) {
    return undefined;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reserved right now</CardTitle>
        <CardDescription className='mt-1'>
          Credits held for turns in flight. Each hold is released when its turn settles, or shortly after its time to
          live passes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <Table data-testid='reserved-table'>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Reserved</TableHead>
                <TableHead>Age</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holds.holds.map((hold) => (
                <TableRow key={hold.operationId}>
                  <TableCell className='max-w-[220px] truncate'>{hold.model.displayName ?? hold.model.id}</TableCell>
                  <TableCell className='font-mono tabular-nums'>
                    {formatCreditAtomsDisplay(BigInt(hold.heldCreditAtoms))}
                  </TableCell>
                  <TableCell>
                    {hold.admittedAt === null
                      ? 'Not reported'
                      : formatDistanceToNowStrict(new Date(hold.admittedAt), { addSuffix: true })}
                  </TableCell>
                  <TableCell>{holdState(hold, now)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
