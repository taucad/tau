import { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { SettingsGroup, SettingsRow } from '#components/settings/settings-item.js';
import { useSearchParameter } from '#hooks/use-search-parameter.js';
import { stringParameter } from '#utils/search-parameter.codecs.js';
import { approveRemoteHostPairing, listRemoteHosts, revokeRemoteHost } from '#lib/remote-host-client.js';
import type { RemoteHostDevice } from '#lib/remote-host-client.js';
import {
  selectLocalCompute,
  selectRemoteComputeDevice,
  useRemoteComputePlacement,
} from '#lib/remote-compute-placement.js';
import { isDesktopTarget } from '#lib/build-target.js';

const placementCopy = {
  local: isDesktopTarget() ? 'Rendering on this computer' : 'Rendering in this browser',
  connecting: 'Connecting to remote device…',
  remote: 'Rendering on a remote device',
  'device-offline': 'Remote device is offline',
  busy: 'Remote device is busy',
  'version-mismatch': 'Remote device needs a Tau update',
  disconnected: 'Remote device disconnected',
} as const;

const pairParameter = stringParameter();

export function RemoteComputeSettings(): React.JSX.Element {
  const [pairingCode, setPairingCode] = useSearchParameter('pair', pairParameter);
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
    queueMicrotask(refresh);
  }, [refresh]);

  const approve = async (): Promise<void> => {
    if (!pairingCode) {
      return;
    }
    setBusy(true);
    try {
      await approveRemoteHostPairing(pairingCode);
      setPairingCode('');
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
    <div className='flex flex-col gap-3'>
      <SettingsGroup
        title='Tau Host'
        action={
          <Button
            size='icon'
            variant='ghost'
            aria-label='Refresh devices'
            disabled={busy}
            onClick={async () => {
              await refresh();
            }}
          >
            <RefreshCw className='size-4' aria-hidden='true' />
          </Button>
        }
      >
        {pairingCode ? (
          <SettingsRow
            title={`Pair device ${pairingCode}`}
            description='Approve only if your Tau CLI shows this code. The device will run your project code.'
            control={
              <Button
                size='sm'
                disabled={busy}
                onClick={async () => {
                  await approve();
                }}
              >
                Approve
              </Button>
            }
          />
        ) : null}

        <SettingsRow
          title={placementCopy[placement.state]}
          description={
            placement.state !== 'local' && placement.message ? (
              <span className='text-feature'>{placement.message}</span>
            ) : undefined
          }
          control={
            <Button size='sm' variant='outline' disabled={placement.state === 'local'} onClick={selectLocalCompute}>
              Use local
            </Button>
          }
        />

        {devices.map((device) => (
          <SettingsRow
            key={device.id}
            title={device.label}
            description={device.online ? `Online · ${device.runtimeVersion ?? 'version unknown'}` : 'Offline'}
            control={
              <>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={busy || !device.online}
                  onClick={() => {
                    selectRemoteComputeDevice(device.id);
                  }}
                >
                  <Cpu className='size-4' aria-hidden='true' /> Use
                </Button>
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={`Revoke ${device.label}`}
                  disabled={busy}
                  onClick={async () => {
                    await revoke(device.id);
                  }}
                >
                  <Trash2 className='size-4' aria-hidden='true' />
                </Button>
              </>
            }
          />
        ))}
      </SettingsGroup>
      {error ? (
        <p role='alert' className='text-sm text-feature'>
          {error}
        </p>
      ) : null}
    </div>
  );
}
