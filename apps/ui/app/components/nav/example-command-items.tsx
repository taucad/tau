import { LayoutGrid } from 'lucide-react';
import { formatSharePath } from '@taucad/share/locator';
import { kernelConfigurations } from '@taucad/types/constants';
import { CommandPaletteThumbnail, useCommandPaletteItems } from '#components/layout/command-palette.js';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { galleryProjects } from '#constants/project-examples.js';

const kernelName = (kernelId: string): string =>
  kernelConfigurations.find(({ id }) => id === kernelId)?.name ?? kernelId;

/* The curated catalog is static, so its rows are built once. */
const exampleItems: CommandPaletteItem[] = [
  {
    id: 'browse-examples',
    label: 'Browse examples',
    searchValue: 'Browse examples community gallery',
    group: 'Examples',
    icon: <LayoutGrid aria-hidden />,
    link: '/community',
  },
  ...galleryProjects.map((project) => ({
    id: `example-${project.locator}`,
    label: project.name,
    // The kernel tells same-named examples apart (two planetary gear systems).
    searchValue: `${project.name} ${project.description} ${kernelName(project.kernel)}`,
    detail: kernelName(project.kernel),
    group: 'Examples',
    icon: <CommandPaletteThumbnail src={project.thumbnail} />,
    link: formatSharePath({ providerId: 'builtin', reference: project.locator }),
  })),
];

/** Registers the examples gallery and each curated example with global search. */
export function ExampleCommandPaletteItems(): undefined {
  useCommandPaletteItems('examples', () => exampleItems, []);

  return undefined;
}
