/* oxlint-disable tau-lint/no-hardcoded-color -- Fixture colors are test-only visual sentinels for the mark up e2e harness. */
import * as React from 'react';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import { ImageMarkupDialog } from '#components/comments/image-markup-dialog.js';
import { getEnvironment } from '#environment.config.js';

/* Mark up over a drawn fixture image, with its record held here, for e2e specs and a look without a model. */

const drawFixture = (): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const context = canvas.getContext('2d')!;
  const gradient = context.createLinearGradient(0, 0, 1200, 800);
  gradient.addColorStop(0, '#dfe7ef');
  gradient.addColorStop(1, '#9fb3c8');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1200, 800);
  context.fillStyle = '#5b6b7a';
  context.fillRect(380, 260, 440, 300);
  context.beginPath();
  context.arc(600, 410, 90, 0, Math.PI * 2);
  context.fillStyle = '#e5e9ee';
  context.fill();
  return canvas.toDataURL('image/png');
};

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();
  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown Response objects for route control-flow.
    throw new Response('Not found', { status: 404 });
  }
  return Response.json({ ok: true });
};

const ImageMarkupDebugRoute = (): React.JSX.Element => {
  const [url, setUrl] = React.useState<string>();
  const [annotations, setAnnotations] = React.useState<MessageAnnotations>();
  const [isOpen, setIsOpen] = React.useState(true);
  React.useEffect(() => {
    setUrl(drawFixture());
  }, []);
  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-10'>
      <button
        type='button'
        onClick={() => {
          setIsOpen(true);
        }}
      >
        Open mark up
      </button>
      <output data-testid='markup-record' className='max-w-xl text-xs break-all'>
        {JSON.stringify(annotations ?? null)}
      </output>
      <ImageMarkupDialog
        image={isOpen && url ? { url, mediaType: 'image/png' } : undefined}
        directory={undefined}
        record={{ annotations, setAnnotations, dropAttachments: () => undefined }}
        onClose={() => {
          setIsOpen(false);
        }}
      />
    </main>
  );
};

export default ImageMarkupDebugRoute;
