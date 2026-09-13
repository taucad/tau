import { ChatInterfaceGraphicsMeasure } from '#routes/projects_.$id/chat-interface-graphics-measure.js';
import { ChatInterfaceGraphicsSectionView } from '#routes/projects_.$id/chat-interface-graphics-section-view.js';
import { GraphicsPanel } from '#routes/projects_.$id/chat-interface-graphics-panel.js';
import { cn } from '#utils/ui.utils.js';
import { useGraphicsSelector } from '#hooks/use-graphics.js';

type ChatInterfaceGraphicsProps = {
  readonly className?: string;
};

/**
 * Derives a stable string for the current operational mode.
 * Using a primitive return avoids re-renders on unrelated state machine
 * context changes (e.g. controlsChanged during resize).
 */
type OperationalMode = 'ready' | 'section-view' | 'measure' | 'unknown';

function useOperationalMode(): OperationalMode {
  return useGraphicsSelector((state) => {
    if (state.matches({ operational: 'ready' })) {
      return 'ready';
    }

    if (state.matches({ operational: 'section-view' })) {
      return 'section-view';
    }

    if (state.matches({ operational: 'measure' })) {
      return 'measure';
    }

    return 'unknown';
  });
}

const titleFromMode: Record<OperationalMode, string> = {
  ready: '',
  'section-view': 'Section View',
  measure: 'Measure',
  unknown: 'Unknown',
};

export function ChatInterfaceGraphics({ className }: ChatInterfaceGraphicsProps): React.ReactNode {
  const mode = useOperationalMode();

  if (mode === 'ready') {
    return null;
  }

  return (
    <GraphicsPanel title={titleFromMode[mode]} className={cn('max-w-80', className)}>
      <ChatInterfaceGraphicsInner mode={mode} />
    </GraphicsPanel>
  );
}

function ChatInterfaceGraphicsInner({ mode }: { readonly mode: OperationalMode }): React.JSX.Element {
  switch (mode) {
    case 'section-view': {
      return <ChatInterfaceGraphicsSectionView />;
    }

    case 'measure': {
      return <ChatInterfaceGraphicsMeasure />;
    }

    default: {
      return <div>Unknown graphics state</div>;
    }
  }
}
