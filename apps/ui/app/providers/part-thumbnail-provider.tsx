import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useProject } from '#hooks/use-project.js';
import { useOptionalHeadlessImageService } from '#providers/headless-image-provider.js';
import { PartThumbnailService } from '#services/part-thumbnail.service.js';

class PartThumbnailRegistry {
  private readonly services = new Map<string, PartThumbnailService>();
  // oxlint-disable-next-line typescript/parameter-properties -- The app's erasableSyntaxOnly compiler forbids parameter properties.
  private readonly imageService: ConstructorParameters<typeof PartThumbnailService>[0];
  public constructor(imageService: ConstructorParameters<typeof PartThumbnailService>[0]) {
    this.imageService = imageService;
  }
  public get(unitId: string): PartThumbnailService {
    let service = this.services.get(unitId);
    if (!service) {
      service = new PartThumbnailService(this.imageService);
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
    const next = new PartThumbnailRegistry(imageService);
    // oxlint-disable-next-line react/set-state-in-effect -- This effect owns the StrictMode and project lifecycle.
    setRegistryRecord({ projectId, registry: next });
    return () => {
      next.dispose();
      setRegistryRecord((current) => (current?.registry === next ? undefined : current));
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
