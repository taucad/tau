import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { ENV } from '#environment.config.js';
import { HeadlessImageService } from '#services/headless-image.service.js';

const HeadlessImageContext = createContext<HeadlessImageService | undefined>(undefined);

export function HeadlessImageProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const service = useMemo(() => new HeadlessImageService({ debug: ENV.TAU_DEBUG }), []);

  return <HeadlessImageContext.Provider value={service}>{children}</HeadlessImageContext.Provider>;
}

export function useHeadlessImageService(): HeadlessImageService {
  const service = useContext(HeadlessImageContext);
  if (!service) {
    throw new Error('useHeadlessImageService must be used within HeadlessImageProvider');
  }
  return service;
}
