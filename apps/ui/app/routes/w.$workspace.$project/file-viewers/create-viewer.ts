import type { ReactNode } from 'react';

import type {
  FileViewerProbe,
  FileViewerPresentation,
  FileViewerRenderRequest,
  ViewerDefinition,
} from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

/** Define one typed viewer while exposing the erased routing adapter. */
export const createViewer = <Match>(definition: {
  readonly id: string;
  readonly fallbackFor?: FileViewerProbe['content']['kind'];
  readonly requestsFiles?: boolean;
  readonly presentation?: FileViewerPresentation;
  readonly match: (probe: FileViewerProbe) => Match | undefined;
  readonly render: (request: FileViewerRenderRequest, match: Match) => ReactNode;
}): ViewerDefinition<Match> => ({
  ...definition,
  resolve: (probe) => {
    const match = definition.match(probe);
    if (match === undefined) {
      return undefined;
    }
    return {
      id: definition.id,
      requestsFiles: definition.requestsFiles ?? false,
      presentation: definition.presentation,
      render: (request): ReactNode => definition.render(request, match),
    };
  },
});
