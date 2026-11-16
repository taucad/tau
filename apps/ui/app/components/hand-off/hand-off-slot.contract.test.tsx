import { useLayoutEffect } from 'react';
import { HandOffSlot } from '#components/hand-off/hand-off-slot.js';
import { resetHandOffStoreForTest, useHandOffAdoption } from '#components/hand-off/hand-off-store.js';
import type { HandOffSnapshot } from '#components/hand-off/hand-off.js';
import { describeHandOffContract } from '#testing/hand-off-contract.js';

/* A store-backed surface: the native input lives in a placeholder's slot, and the adopter mounts beside the
 * placeholder still standing, as the project composer mounts under the persistent workspace frame. */
let mounts = 0;
let adopted: HandOffSnapshot | undefined;
const noteAdopted = (snapshot: HandOffSnapshot): void => {
  adopted = snapshot;
};

function Rich(): React.JSX.Element {
  useLayoutEffect(() => {
    mounts++;
  }, []);
  return <div>Rich surface</div>;
}

function Adopter(): React.ReactNode {
  const adoption = useHandOffAdoption({ surface: 'project-composer', scope: 'home/one' }, noteAdopted);
  return adoption.kind === 'waiting' ? null : <Rich />;
}

describeHandOffContract('Slot-hosted surface', {
  content: (adopterLoaded) => (
    <>
      <section aria-label='Placeholder'>
        <HandOffSlot surface='project-composer' scope='home/one' label='Chat message' placeholder='Ask Tau' />
      </section>
      {adopterLoaded ? <Adopter /> : null}
    </>
  ),
  mounts: () => mounts,
  adopted: () => adopted,
  queuesSubmit: true,
  reset: () => {
    mounts = 0;
    adopted = undefined;
    resetHandOffStoreForTest();
  },
});
