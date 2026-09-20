/* oxlint-disable tau-lint/no-hardcoded-color -- Fixture colors are test-only visual sentinels for the image carousel e2e harness. */
import * as React from 'react';
import { ChatTextareaAttachmentRail } from '#components/chat/chat-textarea-image-strip.js';
import { createAttachmentStore } from '#db/attachment-store.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { Attachment } from '#utils/attachment.utils.js';
import { getEnvironment } from '#environment.config.js';

type FixtureImage = {
  readonly label: string;
  readonly color: string;
};

const fixtureImages: readonly FixtureImage[] = [
  { label: 'Uploaded 1', color: '#e85d75' },
  { label: 'Uploaded 2', color: '#3a86ff' },
  { label: 'Uploaded 3', color: '#19a974' },
  { label: 'Uploaded 4', color: '#f4a261' },
  { label: 'Uploaded 5', color: '#7b2cbf' },
];

// The rail renders stored attachments, so the fixture draws each image as a PNG and stores it like a paste would.
const fixtureDirectory = '/.tau/composers/e2e-chat-image-carousel/attachments';

const drawFixtureImage = async ({ color, label }: FixtureImage): Promise<Uint8Array<ArrayBuffer>> => {
  const canvas = new OffscreenCanvas(960, 720);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The fixture needs a 2D canvas.');
  }
  context.fillStyle = color;
  context.fillRect(0, 0, 960, 720);
  context.strokeStyle = 'rgba(255,255,255,0.86)';
  context.lineWidth = 18;
  context.strokeRect(64, 64, 832, 592);
  context.fillStyle = 'white';
  context.font = '700 96px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(label, 480, 384);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
};

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();

  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown Response objects for route control-flow.
    throw new Response('Not found', { status: 404 });
  }

  return Response.json({ ok: true });
};

const ChatImageCarouselDebugRoute = (): React.JSX.Element => {
  const { recordFiles } = useFileManager();
  const [images, setImages] = React.useState<readonly Attachment[]>();

  React.useEffect(() => {
    const store = createAttachmentStore(recordFiles, fixtureDirectory);
    const storeFixtures = async (): Promise<void> => {
      setImages(
        await Promise.all(
          fixtureImages.map(async (fixtureImage) => store.put(await drawFixtureImage(fixtureImage), 'image/png')),
        ),
      );
    };
    // async-iife: bootstrap — the fixture renders nothing until its images are stored.
    void storeFixtures();
  }, [recordFiles]);

  return (
    <main className='flex min-h-screen items-end justify-center bg-background p-10'>
      <section className='w-80 rounded-xl border bg-background p-4 shadow-sm'>
        {images ? (
          <ChatTextareaAttachmentRail
            attachments={images}
            directory={fixtureDirectory}
            size='desktop'
            onRemove={(index) => {
              setImages((currentImages) => currentImages?.filter((_, imageIndex) => imageIndex !== index));
            }}
          />
        ) : undefined}
      </section>
    </main>
  );
};

export default ChatImageCarouselDebugRoute;
