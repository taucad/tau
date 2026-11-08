import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { ProjectLibrary } from '#components/project-library/project-library.js';
import { HomepageChatHero } from '#routes/_index/homepage-chat-hero.js';
import type { Handle } from '#types/matches.types.js';
import { metaConfig } from '#constants/meta.constants.js';
import { readProjectListCountFromHeader } from '#lib/project-list-shape.lib.js';
import type { ProjectListShapeLoaderData } from '#hooks/use-project-list-shape.js';

export const meta: MetaFunction = () => [
  { title: metaConfig.name },
  { name: 'description', content: metaConfig.description },
];

/**
 * The remembered project count (audit R5), so the server reserves the list's rows and
 * cards, or renders its empty state, before the file-manager worker lists anything.
 * A device-local presentation cookie, not session state: the render stays session-neutral.
 *
 * @param args - The request.
 * @returns The count, or `undefined` when this browser has never listed its projects.
 */
export const loader = ({ request }: LoaderFunctionArgs): ProjectListShapeLoaderData => ({
  projectListCount: readProjectListCountFromHeader(request.headers.get('Cookie') ?? undefined),
});

export const handle: Handle = {
  enableOverflowY: true,
  enablePageWrapper: true,
};

/** Session-neutral app home; the marketing site (`apps/www`) is served by the edge before this app. */
export default function WebHome(): React.JSX.Element {
  return (
    <div className='pb-10'>
      <HomepageChatHero />
      <ProjectLibrary headingLevel={2} />
    </div>
  );
}
