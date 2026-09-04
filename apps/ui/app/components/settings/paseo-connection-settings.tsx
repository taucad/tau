import { useCallback, useEffect, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Input } from '@taucad/ui/components/input';
import { Label } from '@taucad/ui/components/label';
import { Textarea } from '@taucad/ui/components/textarea';
import { listPaseoConnections, pairPaseoConnection, revokePaseoConnection } from '#lib/paseo-connection-client.js';
import type { PaseoConnection } from '#lib/paseo-connection-client.js';

type ConnectionAction = 'revoke';

const messageForError = (error: unknown): string =>
  error instanceof Error ? error.message : 'The Paseo connection request failed';

export function PaseoConnectionSettings(): React.JSX.Element {
  const [connections, setConnections] = useState<PaseoConnection[]>([]);
  const [offer, setOffer] = useState('');
  const [password, setPassword] = useState('');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [pairing, setPairing] = useState(false);
  const [activeAction, setActiveAction] = useState<{ id: string; action: ConnectionAction }>();
  const [disconnectCandidate, setDisconnectCandidate] = useState<PaseoConnection>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setConnections(await listPaseoConnections());
      setError(undefined);
    } catch (error) {
      setError(messageForError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      // async-iife: the mount refresh is owned by this effect.
      void refresh();
    });
  }, [refresh]);

  const pair = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!offer.trim()) {
      return;
    }
    setPairing(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const connection = await pairPaseoConnection({
        offer: offer.trim(),
        ...(password ? { password } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      setConnections((current) => [connection, ...current.filter((entry) => entry.id !== connection.id)]);
      // Pairing material is request-only. Clear it before any later render or
      // persistence boundary can retain it.
      setOffer('');
      setPassword('');
      setLabel('');
      setNotice(`${connection.label} paired`);
    } catch (error) {
      setError(messageForError(error));
    } finally {
      setPairing(false);
    }
  };

  const runAction = async (connection: PaseoConnection, action: ConnectionAction): Promise<void> => {
    setActiveAction({ id: connection.id, action });
    setError(undefined);
    setNotice(undefined);
    try {
      await revokePaseoConnection(connection.id);
      setConnections((current) => current.filter((entry) => entry.id !== connection.id));
      setNotice(`${connection.label} disconnected from Tau`);
    } catch (error) {
      setError(messageForError(error));
    } finally {
      setActiveAction(undefined);
    }
  };

  return (
    <section className='flex flex-col gap-6' aria-labelledby='paseo-connection-title'>
      <div>
        <h2 id='paseo-connection-title' className='text-lg font-semibold'>
          Paseo agents
        </h2>
        <p className='text-sm text-muted-foreground'>
          Pair a Paseo daemon to use local Claude, Codex, OpenCode, Pi, or other discovered agents in Tau chats.
        </p>
      </div>

      <form
        className='grid gap-3 rounded-md border p-4'
        onSubmit={(event) => {
          void pair(event);
        }}
      >
        <div className='grid gap-1.5'>
          <Label htmlFor='paseo-offer'>Pairing link</Label>
          <Textarea
            id='paseo-offer'
            name='paseo-offer'
            value={offer}
            onChange={(event) => {
              setOffer(event.target.value);
            }}
            placeholder='Paste the pairing link from your Paseo daemon'
            autoComplete='off'
            rows={3}
            required
          />
          <p className='text-xs text-muted-foreground'>
            This reusable link is a bearer secret. Tau sends it to its API for encrypted server-side storage and never
            saves it in browser storage.
          </p>
        </div>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='grid gap-1.5'>
            <Label htmlFor='paseo-label'>Label</Label>
            <Input
              id='paseo-label'
              value={label}
              onChange={(event) => {
                setLabel(event.target.value);
              }}
              placeholder='My workstation'
              autoComplete='off'
            />
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='paseo-password'>Password (optional)</Label>
            <Input
              id='paseo-password'
              type='password'
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              autoComplete='new-password'
            />
          </div>
        </div>
        <Button className='justify-self-start' type='submit' disabled={pairing || !offer.trim()}>
          <Link2 className='size-4' aria-hidden='true' />
          {pairing ? 'Pairing…' : 'Pair daemon'}
        </Button>
      </form>

      <div className='grid gap-3' aria-busy={loading}>
        {connections.map((connection) => {
          const action = activeAction?.id === connection.id ? activeAction.action : undefined;
          return (
            <article
              key={connection.id}
              className='flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:flex-wrap sm:items-center'
            >
              <div className='min-w-0 flex-1'>
                <h3 className='truncate font-medium'>{connection.label}</h3>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {/* The directory knows the daemon identity, never whether it
                      answers right now: since SP-10 the session is the page’s, and
                      the selector reports reachability when it dials. */}
                  {connection.relayEndpoint}
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  disabled={activeAction !== undefined}
                  onClick={() => {
                    setDisconnectCandidate(connection);
                  }}
                >
                  <Trash2 className='size-4' aria-hidden='true' />
                  {action === 'revoke' ? 'Disconnecting…' : 'Disconnect Tau'}
                </Button>
              </div>
              {disconnectCandidate?.id === connection.id ? (
                <div
                  role='alertdialog'
                  aria-label={`Disconnect ${connection.label} from Tau?`}
                  className='grid w-full gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm'
                >
                  <p>
                    This removes Tau’s stored pairing link. It does not invalidate a copied or leaked link; hard
                    revocation requires rotating the daemon key or server identity.
                  </p>
                  <div className='flex flex-wrap justify-end gap-2'>
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      onClick={() => {
                        setDisconnectCandidate(undefined);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type='button'
                      size='sm'
                      variant='destructive'
                      disabled={activeAction !== undefined}
                      onClick={() => {
                        setDisconnectCandidate(undefined);
                        void runAction(connection, 'revoke');
                      }}
                    >
                      Confirm disconnect Tau
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
        {!loading && connections.length === 0 ? (
          <p className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
            No Paseo daemons paired yet.
          </p>
        ) : null}
      </div>

      <p className='text-xs text-muted-foreground'>
        Disconnecting removes Tau’s stored pairing link. Paseo does not yet support per-client revocation; rotate the
        daemon key or server identity to invalidate links that may have been copied.
      </p>

      {notice ? (
        <p className='text-sm text-muted-foreground' aria-live='polite'>
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
    </section>
  );
}
