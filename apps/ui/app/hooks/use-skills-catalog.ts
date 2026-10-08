import { useMemo, useCallback } from 'react';
import { ObservationService } from '@taucad/fs-client/observation-service';
import type { ObservationSnapshot } from '@taucad/fs-client/observation-service';
import { useObservation, useObservationValue } from '@taucad/fs-client/react/use-observation';
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
    const settled = new Map<string, () => void>();
    let invalidateSettled: (() => void) | undefined;
    service = new ObservationService({
      resource: '.agents/catalog',
      watch: (invalidate, reset) => {
        invalidateSettled = invalidate;
        const watch = content.watchReady({ paths: ['.agents'], recursive: true }, (event) => {
          if (event.type === 'reset') {
            reset();
          } else {
            invalidate();
          }
        });
        return {
          ready: watch.ready,
          closed: watch.closed,
          dispose: () => {
            invalidateSettled = undefined;
            for (const off of settled.values()) {
              off();
            }
            settled.clear();
            watch.dispose();
          },
        };
      },
      read: async ({ isCurrent }) => {
        const seen = new Set<string>();
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
            const value = await entries;
            seen.add(path);
            if (isCurrent() && invalidateSettled && !settled.has(path)) {
              settled.set(
                path,
                tree.subscribePath(path, () => {
                  invalidateSettled?.();
                }),
              );
            }
            return value;
          },
        });
        const [commands, prompt] = await Promise.all([resolver.listSkills(), resolver.getPromptSkillListing()]);
        if (isCurrent()) {
          for (const [path, off] of settled) {
            if (!seen.has(path)) {
              off();
              settled.delete(path);
            }
          }
        }
        return { commands, prompt };
      },
      equal: (previous, next) => JSON.stringify(previous) === JSON.stringify(next),
    });
    readers.set(readFile, service);
  }
  return service;
}

function useCatalogService(): ObservationService<Catalog> | undefined {
  const { readFile, treeService, contentService } = useFileManager();
  const service = useMemo(
    () => (treeService && contentService ? catalogFor(treeService, readFile, contentService) : undefined),
    [readFile, treeService, contentService],
  );
  return service;
}

/** Merged user-priority slash command catalog, shared with the prompt selector. */
export function useSkillsCatalog(): SkillMetadata[] {
  return useObservationValue(useCatalogService())?.commands ?? emptySkills;
}

/** Bounded prompt listing over the same acquisition as the command catalog. */
export function usePromptSkillsCatalog(): SkillMetadata[] {
  return useObservationValue(useCatalogService())?.prompt ?? emptySkills;
}

export type SkillsCatalogState = Catalog & Pick<ObservationSnapshot<Catalog>, 'status' | 'error'> & { retry(): void };

/** Functional catalog selection with truthful authority health and same-owner retry. */
export function useSkillsCatalogState(): SkillsCatalogState {
  const service = useCatalogService();
  const snapshot = useObservation(service);
  const retry = useCallback(() => {
    service?.refresh();
  }, [service]);
  return useMemo(
    () => ({
      commands: snapshot.value?.commands ?? emptySkills,
      prompt: snapshot.value?.prompt ?? emptySkills,
      status: snapshot.status,
      error: snapshot.error,
      retry,
    }),
    [snapshot, retry],
  );
}
