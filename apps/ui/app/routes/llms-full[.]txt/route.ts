// make sure to include this route in `routes.ts` & pre-rendering!
import { source } from '#lib/fumadocs/source.js';
import { getLLMText } from '#lib/fumadocs/get-llms-text.js';

export async function loader(): Promise<Response> {
  const scan = source.getPages().map(getLLMText);
  const scanned = await Promise.all(scan);

  return new Response(scanned.join('\n\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
