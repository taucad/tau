import { Folder, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useAllChats } from '#hooks/use-all-chats.js';
import { useProjects } from '#hooks/use-projects.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { projectChatUrl, projectUrl } from '#utils/project-url.utils.js';
import type { ProjectListItem } from '#types/project.types.js';
import { compareChatsByRecency } from '#utils/chat-recency.utils.js';

const hasSlugs = (
  project: ProjectListItem,
): project is ProjectListItem & { slugs: NonNullable<ProjectListItem['slugs']> } => project.slugs !== undefined;

function ProjectThumbnail({ projectId }: { readonly projectId: string }): React.JSX.Element {
  const thumbnailSource = useProjectThumbnail(projectId);
  return (
    <span className='flex size-9 items-center justify-center overflow-hidden rounded-md border bg-muted'>
      {thumbnailSource ? (
        <img src={thumbnailSource} alt='' className='size-full object-cover' />
      ) : (
        <Folder aria-hidden />
      )}
    </span>
  );
}

/** Registers every navigable project and non-deleted chat with global search. */
export function ProjectNavigationCommandItems(): undefined {
  const { projects } = useProjects();
  const { chats } = useAllChats();
  const navigableProjects = useMemo(
    () =>
      projects
        .filter((project) => hasSlugs(project))
        .sort((left, right) => right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id)),
    [projects],
  );
  const projectsById = useMemo(
    () => new Map(navigableProjects.map((project) => [project.id, project] as const)),
    [navigableProjects],
  );

  useCommandPaletteItems(
    'project-navigation',
    (): CommandPaletteItem[] => [
      ...navigableProjects.map((project) => ({
        id: `project-${project.id}`,
        label: project.name,
        // The description stays searchable without taking a row; the slug path and recency tell same-named projects apart.
        searchValue: `${project.name} ${project.description}`,
        detail: `${project.slugs.workspaceSlug}/${project.slugs.projectSlug} · ${formatRelativeTime(project.lastActivityAt)}`,
        group: 'Projects',
        icon: <ProjectThumbnail projectId={project.id} />,
        link: projectUrl(project.slugs),
      })),
      ...[...chats].sort(compareChatsByRecency).flatMap((chat): CommandPaletteItem[] => {
        const project = projectsById.get(chat.resourceId);
        if (!project?.slugs) {
          return [];
        }
        return [
          {
            id: `chat-${chat.id}`,
            label: chat.name,
            searchValue: `${chat.name} ${project.name}`,
            group: 'Chats',
            icon: <MessageSquare aria-hidden />,
            link: projectChatUrl(project.slugs, chat.id),
          },
        ];
      }),
    ],
    [chats, navigableProjects, projectsById],
  );

  return undefined;
}
