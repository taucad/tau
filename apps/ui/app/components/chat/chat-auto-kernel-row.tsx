import { resolveKernel } from '@taucad/types/constants';
import { KernelPreferenceSelector } from '#components/chat/chat-kernel-selector.js';
import { AutoKernelGlyph } from '#components/chat/kernel-pill.js';
import { useChatComposer } from '#hooks/active-chat-provider.js';

/**
 * The transcript row Auto adds once a kernel binds (automatic kernel selection blueprint D2): "Auto is using Replicad.
 * Change kernel". A vendor agent may not announce its choice, so the host says it, from the runtime's binding and with
 * no stored record. It sits under the chat's first turn and leaves once the chat has a manual pick.
 */
export function ChatAutoKernelRow(): React.JSX.Element | undefined {
  const {
    kernel: { preference, owner },
  } = useChatComposer();
  if (preference !== 'auto' || owner === undefined) {
    return undefined;
  }
  const { name } = resolveKernel(owner);
  return (
    <div
      role='note'
      data-slot='auto-kernel-row'
      className='mx-4 flex items-center gap-1.5 text-xs text-muted-foreground'
    >
      <AutoKernelGlyph className='size-3.5' />
      <span>Auto is using {name}.</span>
      <KernelPreferenceSelector popoverProperties={{ align: 'start' }}>
        <button type='button' className='text-xs text-foreground underline-offset-4 hover:underline'>
          Change kernel
        </button>
      </KernelPreferenceSelector>
    </div>
  );
}
