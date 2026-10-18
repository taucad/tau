import page from '#content/agent/llms.md?raw';
import { appOrigin } from '#www/environment.js';

/** What the agent page names that a build or a release decides. */
export type AgentPageSlots = {
  /** The origin serving the page; its own links use it. Empty falls back to the production app origin. */
  origin: string;
  /** A line naming the current release (ONB-6). Absent, the page names only the `beta` tag. */
  release?: string;
};

/**
 * Render the agent entry point served at `/llms.txt`: what Tau is, how an agent installs and checks the plugin,
 * troubleshooting, which kernel to pick, prompts to offer and links, as llmstxt.org-shaped Markdown.
 * @param slots - The values the page text leaves open.
 * @returns The page text.
 */
export function agentPage({ origin, release }: AgentPageSlots): string {
  return page.replace('{release}\n\n', release ? `${release}\n\n` : '').replaceAll('{origin}', origin || appOrigin);
}
