import { Folder, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';
import { CommandPaletteThumbnail, useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { useAllChats } from '#hooks/use-all-chats.js';
import { useProjects } from '#hooks/use-projects.js';
import { useProjectThumbnail } from '#hooks/use-project-thumbnail.js';
import { formatRelativeTime } from '#utils/date.utils.js';
import { projectChatUrl, projectUrl } from '#utils/project-url.utils.js';
import type { ProjectListItem } from '#types/project-library.types.js';
import { compareChatsByRecency } from '#utils/chat-recency.utils.js';

const hasSlugs = (
  project: ProjectListItem,
): project is ProjectListItem & { slugs: NonNullable<ProjectListItem['slugs']> } => project.slugs !== undefined;

function ProjectThumbnail({ projectId }: { readonly projectId: string }): React.JSX.Element {
  const thumbnail = useProjectThumbnail(projectId);
  useCommandPaletteItems(
    `thumbnail-health-${projectId}`,
    () =>
      thumbnail.status === 'error' || thumbnail.status === 'closed'
        ? [
            {
              id: `retry-thumbnail-${projectId}`,
              label: 'Retry project thumbnail',
              detail: thumbnail.error,
              group: 'Projects',
              icon: <Folder aria-hidden />,
              action: thumbnail.refresh,
            },
          ]
        : [],
    [projectId, thumbnail.status, thumbnail.error, thumbnail.refresh],
  );
  return (
    <span title={thumbnail.error}>
      <CommandPaletteThumbnail src={thumbnail.url} fallback={<Folder aria-hidden />} />
    </span>
  );
}

/** Registers every navigable project and non-deleted chat with global search. */
export function ProjectNavigationCommandItems(): undefined {
  const { projects, error: projectError, retry: retryProjects } = useProjects();
  const { chats, error: chatError, retry: retryChats } = useAllChats();
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
      ...(projectError
        ? [
            {
              id: 'retry-project-observation',
              label: 'Retry project updates',
              detail: projectError.message,
              group: 'Projects',
              icon: <Folder aria-hidden />,
              action: () => {
                void retryProjects();
              },
            },
          ]
        : []),
      ...(chatError
        ? [
            {
              id: 'retry-chat-observation',
              label: 'Retry chat updates',
              detail: chatError.message,
              group: 'Chats',
              icon: <MessageSquare aria-hidden />,
              action: () => {
                void retryChats();
              },
            },
          ]
        : []),
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
    [chats, navigableProjects, projectsById, projectError, chatError, retryProjects, retryChats],
  );

  return undefined;
}
