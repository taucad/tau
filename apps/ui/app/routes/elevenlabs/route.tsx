import { useRef } from 'react';
import type { Route } from './+types/route.js';
import { ENV } from '#config.js';
import type { HeroViewerHandle } from '#routes/elevenlabs/voice-viewer.js';
import type { Handle } from '#types/matches.types.js';
import { VoiceViewer } from '#routes/elevenlabs/voice-viewer.js';
import { ClientOnly } from '#components/ui/utils/client-only.js';

export const handle: Handle = {
  enableFloatingSidebar: true,
  noPageWrapper: true,
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- loaders are inferred types by design.
export function loader(_args: Route.LoaderArgs) {
  const rawAgentId = ENV.ELEVENLABS_AGENT_ID;
  const agentId: string | undefined = typeof rawAgentId === 'string' && rawAgentId.length > 0 ? rawAgentId : undefined;

  return {
    agentId,
    name: 'Customer Support',
    description: 'AI Voice Assistant',
  };
}

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
