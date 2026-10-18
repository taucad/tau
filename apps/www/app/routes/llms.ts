import { siteConfiguration } from '#app/config.server.js';
import { agentPage } from '#www/agent-page.js';

export function loader(): Response {
  return new Response(agentPage({ origin: siteConfiguration().origin }), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
