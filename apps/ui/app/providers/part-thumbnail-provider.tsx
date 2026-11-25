import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { isCodeLoadFailure, loadCode } from '@taucad/ui-core/lib/code-loading';
import { useProject } from '#hooks/use-project.js';
import { useOptionalHeadlessImageService } from '#providers/headless-image-provider.js';
import type { PartThumbnailService } from '#services/part-thumbnail.service.js';

type PartThumbnailServiceClass = typeof PartThumbnailService;

/**
 * The part preview service's code, which is optional (PL7 staging verification 2026-11-21, row 5): when it cannot load
 * in this page, the Model pane, the viewer's part menus and the part gallery show no previews, as they do with no image
 * service, instead of failing the viewer and the route that hold them. The page's recovery hears of the failure and
 * never reloads for it.
 *
 * @returns The service class, or `undefined` when its code could not load.
 */
export const loadPartThumbnailService = async (): Promise<PartThumbnailServiceClass | undefined> => {
  try {
    const module = await loadCode(async () => import('#services/part-thumbnail.service.js'), { optional: true });
    return module.PartThumbnailService;
  } catch (error) {
    if (isCodeLoadFailure(error)) {
      return undefined;
    }
    throw error;
  }
};

class PartThumbnailRegistry {
  private readonly services = new Map<string, PartThumbnailService>();
  // oxlint-disable-next-line typescript/parameter-properties -- The app's erasableSyntaxOnly compiler forbids parameter properties.
  private readonly Service: PartThumbnailServiceClass;
  // oxlint-disable-next-line typescript/parameter-properties -- The app's erasableSyntaxOnly compiler forbids parameter properties.
  private readonly imageService: ConstructorParameters<PartThumbnailServiceClass>[0];
  public constructor(
    Service: PartThumbnailServiceClass,
    imageService: ConstructorParameters<PartThumbnailServiceClass>[0],
  ) {
    this.Service = Service;
    this.imageService = imageService;
  }
  public get(unitId: string): PartThumbnailService {
    let service = this.services.get(unitId);
    if (!service) {
      service = new this.Service(this.imageService);
      this.services.set(unitId, service);
    }
    return service;
  }
  public dispose(): void {
    for (const service of this.services.values()) {
      service.dispose();
    }
    this.services.clear();
  }
}

const PartThumbnailContext = createContext<PartThumbnailRegistry | undefined>(undefined);

/** One project-scoped preview scheduler shared by Model and viewer menus. */
export function PartThumbnailProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const project = useProject({ enableNoContext: true });
  const projectId = project?.projectId;
  const imageService = useOptionalHeadlessImageService();
  const [registryRecord, setRegistryRecord] = useState<{ projectId: string; registry: PartThumbnailRegistry }>();
  useEffect(() => {
    if (!imageService || !projectId) {
      return undefined;
    }
    let next: PartThumbnailRegistry | undefined;
    const effectRelease = new AbortController();
    const start = async (): Promise<void> => {
      const Service = await loadPartThumbnailService();
      if (effectRelease.signal.aborted || Service === undefined) {
        return;
      }
      next = new PartThumbnailRegistry(Service, imageService);
      setRegistryRecord({ projectId, registry: next });
    };
    // async-iife: fire-and-forget; the previews arrive with their code, or never when it cannot load.
    void start();
    return () => {
      effectRelease.abort();
      const released = next;
      released?.dispose();
      setRegistryRecord((current) => (current?.registry === released ? undefined : current));
    };
  }, [imageService, projectId]);
  return (
    <PartThumbnailContext.Provider
      value={registryRecord && registryRecord.projectId === projectId ? registryRecord.registry : undefined}
    >
      {children}
    </PartThumbnailContext.Provider>
  );
}

export const useOptionalPartThumbnailService = (unitId: string): PartThumbnailService | undefined =>
  useContext(PartThumbnailContext)?.get(unitId);
