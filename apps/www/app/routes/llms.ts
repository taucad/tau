import { siteConfiguration } from '#app/config.server.js';
import { agentPage } from '#www/agent-page.js';

export function loader(): Response {
  const version = import.meta.env.WWW_PLUGIN_VERSION;
  return new Response(
    agentPage({
      origin: siteConfiguration().origin,
      release: version ? `Current release: ${version} (npm tag \`beta\`).` : undefined,
    }),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}
