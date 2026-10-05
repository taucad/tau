import { useMemo } from 'react';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useObservationValue } from '@taucad/fs-client/react/use-observation';
import type { SkillMetadata } from '@taucad/chat';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import { useFileManager } from '#hooks/use-file-manager.js';
import { createSkillResolver, titleFromSkillName } from '#lib/skill-resolver.js';

export function skillMetadataToSlashCommand(skill: SkillMetadata): {
  id: string;
  label: string;
  title: string;
  description: string;
  fullDescription: string | undefined;
  group: string;
  source: string | undefined;
} {
  const id = skill.name;
  const fullDescription = skill.whenToUse ? `${skill.description}. ${skill.whenToUse}` : skill.description;

  return {
    id,
    label: `/${id}`,
    title: titleFromSkillName(id),
    description: skill.description,
    fullDescription,
    group: 'Skills',
    source: skill.source,
  };
}

type Catalog = { readonly commands: SkillMetadata[]; readonly prompt: SkillMetadata[] };
type Reader = ReturnType<typeof useFileManager>['readFile'];
type Content = NonNullable<ReturnType<typeof useFileManager>['contentService']>;
const catalogs = new WeakMap<Content, WeakMap<FileTreeService, WeakMap<Reader, ObservationService<Catalog>>>>();
const emptySkills: SkillMetadata[] = [];

function catalogFor(tree: FileTreeService, readFile: Reader, content: Content): ObservationService<Catalog> {
  let trees = catalogs.get(content);
  if (!trees) {
    trees = new WeakMap();
    catalogs.set(content, trees);
  }
  let readers = trees.get(tree);
  if (!readers) {
    readers = new WeakMap();
    trees.set(tree, readers);
  }
  let service = readers.get(readFile);
  if (!service) {
    service = new ObservationService({
      resource: '.agents/catalog',
      watch: (invalidate, reset) =>
        content.watchReady({ paths: ['.agents'], recursive: true }, (event) => {
          if (event.type === 'reset') {
            reset();
          } else {
            invalidate();
          }
        }),
      read: async () => {
        // Both resolver selections acquire each file and directory once per refresh.
        const files = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
        const directories = new Map<string, ReturnType<FileTreeService['listDirectory']>>();
        const resolver = createSkillResolver({
          readFile: async (path) => {
            let bytes = files.get(path);
            if (!bytes) {
              bytes = readFile(path);
              files.set(path, bytes);
            }
            return bytes;
          },
          listDirectory: async (path) => {
            let entries = directories.get(path);
            if (!entries) {
              entries = tree.listDirectory(path);
              directories.set(path, entries);
            }
            return entries;
          },
        });
        const [commands, prompt] = await Promise.all([resolver.listSkills(), resolver.getPromptSkillListing()]);
        return { commands, prompt };
      },
      equal: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
    });
    readers.set(readFile, service);
  }
  return service;
}

function useCatalog(): Catalog | undefined {
  const { readFile, treeService, contentService } = useFileManager();
  const service = useMemo(
    () => (treeService && contentService ? catalogFor(treeService, readFile, contentService) : undefined),
    [readFile, treeService, contentService],
  );
  return useObservationValue(service);
}

/** Merged user-priority slash command catalog, shared with the prompt selector. */
export function useSkillsCatalog(): SkillMetadata[] {
  return useCatalog()?.commands ?? emptySkills;
}

/** Bounded prompt listing over the same acquisition as the command catalog. */
export function usePromptSkillsCatalog(): SkillMetadata[] {
  return useCatalog()?.prompt ?? emptySkills;
}
