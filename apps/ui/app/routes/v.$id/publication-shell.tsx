import { useIsMobile } from '#hooks/use-mobile.js';
import { PublicationFilesPane } from '#routes/v.$id/publication-files-pane.js';
import { PublicationHeroStrip } from '#routes/v.$id/publication-hero-strip.js';
import { PublicationParamsPane } from '#routes/v.$id/publication-params-pane.js';
import { PublicationViewerPane } from '#routes/v.$id/publication-viewer-pane.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

type PublicationShellProps = {
  readonly publication: ParsedPublication;
  readonly publicationFiles: Record<string, string>;
};

/**
 * First-screen layout for the sharing route. Sized to one viewport
 * (`calc(100dvh - var(--publication-topbar-h))`) so the README scrolls below
 * the fold inside the parent scroll container.
 *
 * Desktop: three-column grid (Files | Viewer column | Parameters). The viewer
 * column is itself a flex stack with the viewer above and the hero strip
 * pinned to the bottom — Files / Params naturally span the full row height.
 *
 * Mobile: viewer-only with the hero strip overlaid at the bottom; the
 * parameters drawer (`publication-mobile-sheet.tsx`) is mounted by the route.
 */
export function PublicationShell({ publication, publicationFiles }: PublicationShellProps): React.JSX.Element {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className='relative h-[calc(100dvh-var(--publication-topbar-h))] shrink-0 overflow-hidden'>
        <PublicationViewerPane />
        <PublicationHeroStrip
          publication={publication}
          className='pointer-events-none absolute inset-x-0 bottom-0 border-t'
        />
      </div>
    );
  }

  return (
    <div className='grid h-[calc(100dvh-var(--publication-topbar-h))] min-h-0 shrink-0 grid-cols-[260px_minmax(0,1fr)_320px]'>
      <PublicationFilesPane
        entryFile={publication.entryFile}
        files={publicationFiles}
        visibility={publication.visibility}
        className='border-r'
      />
      <div className='relative flex min-h-0 flex-col'>
        <PublicationViewerPane className='min-h-0 flex-1' />
        <PublicationHeroStrip publication={publication} className='border-t' />
      </div>
      <PublicationParamsPane publication={publication} className='border-l' />
    </div>
  );
}
