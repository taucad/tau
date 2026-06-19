/* oxlint-disable tau-lint/no-hardcoded-color -- Fixture colors are test-only visual sentinels for the image carousel e2e harness. */
import * as React from 'react';
import { ChatTextareaImageStrip } from '#components/chat/chat-textarea-image-strip.js';
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

const createFixtureImageUrl = ({ color, label }: FixtureImage): string => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720">
  <rect width="960" height="720" fill="${color}"/>
  <rect x="64" y="64" width="832" height="592" rx="42" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.86)" stroke-width="18"/>
  <text x="480" y="384" fill="white" font-family="Arial, sans-serif" font-size="96" font-weight="700" text-anchor="middle">${label}</text>
</svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const initialImages = fixtureImages.map((fixtureImage) => createFixtureImageUrl(fixtureImage));

export const loader = async (): Promise<Response> => {
  const environment = await getEnvironment();

  if (!environment.TAU_DEBUG) {
    // oxlint-disable-next-line typescript/only-throw-error -- React Router uses thrown Response objects for route control-flow.
    throw new Response('Not found', { status: 404 });
  }

  return Response.json({ ok: true });
};

const ChatImageCarouselDebugRoute = (): React.JSX.Element => {
  const [images, setImages] = React.useState(initialImages);

  return (
    <main className='flex min-h-screen items-end justify-center bg-background p-10'>
      <section className='w-full max-w-3xl rounded-xl border bg-background p-4 shadow-sm'>
        <ChatTextareaImageStrip
          images={images}
          size='desktop'
          onRemoveImage={(index) => {
            setImages((currentImages) => currentImages.filter((_, imageIndex) => imageIndex !== index));
          }}
        />
      </section>
    </main>
  );
};

export default ChatImageCarouselDebugRoute;
