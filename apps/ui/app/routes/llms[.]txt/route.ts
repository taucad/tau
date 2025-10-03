// make sure to include this route in `routes.ts` & pre-rendering!
import { ENV, metaConfig } from '#config.js';
import { getLLMRefText } from '#lib/fumadocs/get-llms-text.js';

export async function loader(): Promise<Response> {
  const content = await getLLMRefText({
    siteTitle: `${metaConfig.name} Documentation`,
    siteUrl: ENV.TAU_FRONTEND_URL,
  });

  return new Response(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

