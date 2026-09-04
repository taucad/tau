import { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';

import { Button } from '@taucad/ui/components/button';
import { approveRemoteHostPairing, listRemoteHosts, revokeRemoteHost } from '#lib/remote-host-client.js';
import type { RemoteHostDevice } from '#lib/remote-host-client.js';
import {
  selectLocalCompute,
  selectRemoteComputeDevice,
  useRemoteComputePlacement,
} from '#lib/remote-compute-placement.js';

const placementCopy = {
  local: 'Rendering in this browser',
  connecting: 'Connecting to remote compute…',
  remote: 'Rendering on the selected remote device',
  'device-offline': 'The selected remote device is offline or revoked',
  busy: 'The selected remote device is at capacity',
  'version-mismatch': 'The browser and remote runtime versions do not match',
  disconnected: 'The remote runtime disconnected',
} as const;

export function RemoteComputeSettings(): React.JSX.Element {
  const [searchParameters, setSearchParameters] = useSearchParams();
  const pairingCode = searchParameters.get('pair');
  const placement = useRemoteComputePlacement();
  const [devices, setDevices] = useState<RemoteHostDevice[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setDevices(await listRemoteHosts());
      setError(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load remote devices');
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  const approve = async (): Promise<void> => {
    if (!pairingCode) {
      return;
    }
    setBusy(true);
    try {
      await approveRemoteHostPairing(pairingCode);
      setSearchParameters((previous) => {
        const next = new URLSearchParams(previous);
        next.delete('pair');
        return next;
      });
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not pair this device');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (deviceId: string): Promise<void> => {
    setBusy(true);
    try {
      await revokeRemoteHost(deviceId);
      if (placement.state !== 'local' && placement.deviceId === deviceId) {
        selectLocalCompute();
      }
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not revoke this device');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className='flex flex-col gap-6' aria-labelledby='remote-compute-title'>
      <div>
        <h2 id='remote-compute-title' className='text-lg font-semibold'>
          Tau Host
        </h2>
        <p className='text-sm text-muted-foreground'>
          Run CAD kernels on a paired Tau Host while this browser remains the project filesystem authority.
        </p>
      </div>

      {pairingCode ? (
        <div className='rounded-md border border-primary/40 p-4'>
          <p className='font-medium'>Pair Tau Host {pairingCode}</p>
          <p className='mb-3 text-sm text-muted-foreground'>Approve only if this code is visible in your Tau CLI.</p>
          <Button disabled={busy} onClick={() => void approve()}>
            Approve device
          </Button>
        </div>
      ) : null}

      <div className='flex items-center justify-between gap-4 rounded-md border p-4'>
        <div>
          <p className='font-medium'>{placementCopy[placement.state]}</p>
          {placement.state !== 'local' && placement.message ? (
            <p className='text-sm text-destructive'>{placement.message}</p>
          ) : null}
        </div>
        <Button variant='outline' disabled={placement.state === 'local'} onClick={selectLocalCompute}>
          Use local
        </Button>
      </div>

      <div className='flex flex-col gap-3'>
        {devices.map((device) => (
          <div key={device.id} className='flex items-center justify-between gap-4 rounded-md border p-4'>
            <div>
              <p className='font-medium'>{device.label}</p>
              <p className='text-sm text-muted-foreground'>
                {device.online ? `Online · ${device.runtimeVersion ?? 'runtime unknown'}` : 'Offline'}
              </p>
            </div>
            <div className='flex gap-2'>
              <Button
                disabled={busy || !device.online}
                onClick={() => {
                  selectRemoteComputeDevice(device.id);
                }}
              >
                <Cpu className='size-4' aria-hidden='true' /> Use remote
              </Button>
              <Button
                variant='outline'
                size='icon'
                aria-label={`Revoke ${device.label}`}
                disabled={busy}
                onClick={() => void revoke(device.id)}
              >
                <Trash2 className='size-4' aria-hidden='true' />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <p role='alert' className='text-sm text-destructive'>
          {error}
        </p>
      ) : null}
      <Button variant='ghost' className='self-start' disabled={busy} onClick={() => void refresh()}>
        <RefreshCw className='size-4' aria-hidden='true' /> Refresh devices
      </Button>

      <p className='text-xs text-muted-foreground'>
        Experimental: paired project code executes on the remote computer. Use only with projects you trust.
      </p>
    </section>
  );
}
