import { useRef } from 'react';
import type { HeroViewerHandle } from '#routes/elevenlabs/voice-viewer.js';
import type { Handle } from '#types/matches.types.js';
import { VoiceViewer } from '#routes/elevenlabs/voice-viewer.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';

export const handle: Handle = {
  enableFloatingSidebar: true,
  noPageWrapper: true,
};

export default function ElevenLabsPage(): React.JSX.Element {
  const viewerRef = useRef<HeroViewerHandle>(null);

  return (
    <ClientOnly>
      <div className="relative h-dvh w-dvw">
        <VoiceViewer ref={viewerRef} />
      </div>
    </ClientOnly>
  );
}
