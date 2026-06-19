import { useCallback } from 'react';
import { useSelector } from '@xstate/react';
import type { RJSFSchema } from '@rjsf/utils';
import { ExportSelector } from '#components/files/export-selector.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';
import { cn } from '#utils/ui.utils.js';
import type { ParsedPublication } from '#routes/v.$id/parsed-publication.js';

const viewerUnits: Units = { length: { symbol: 'mm', factor: 1 } };

type PublicationParamsPaneProps = {
  readonly publication: ParsedPublication;
  readonly className?: string;
};

/**
 * Side-rail Parameters + Downloads pane for the sharing route. Full-height
 * column that fills its grid cell and scrolls internally when the parameter
 * form overflows. Mounted by the desktop shell and reused inside the mobile
 * drawer (`publication-mobile-sheet.tsx`).
 */
export function PublicationParamsPane({ publication, className }: PublicationParamsPaneProps): React.JSX.Element {
  const { cadRef, defaultParameters, geometries, jsonSchema, setParameters } = useCadPreview();
  const parameterOverrides = useSelector(cadRef, (snapshot) => snapshot.context.parameters);

  const handleParametersChange = useCallback(
    (modified: Record<string, unknown>) => {
      setParameters(modified);
    },
    [setParameters],
  );

  return (
    <aside
      data-slot='publication-params-pane'
      className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-background', className)}
    >
      <div className='shrink-0 border-b px-3 py-2 text-xs font-medium text-muted-foreground'>Parameters</div>
      <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3'>
        <section
          role='region'
          aria-label='Parameters'
          data-slot='publication-params-card'
          className='flex flex-col gap-2'
        >
          <Parameters
            parameters={parameterOverrides}
            defaultParameters={defaultParameters}
            jsonSchema={jsonSchema as RJSFSchema | undefined}
            onParametersChange={handleParametersChange}
            units={viewerUnits}
            enableSearch={false}
          />
        </section>
        <section
          role='region'
          aria-label='Downloads'
          data-slot='publication-downloads-card'
          className='flex flex-col gap-2 border-t pt-4'
        >
          <h2 className='text-sm font-medium'>Downloads</h2>
          {geometries.length === 0 ? (
            <p className='text-xs text-muted-foreground'>Render the geometry to enable export.</p>
          ) : (
            <ExportSelector
              cadActor={cadRef}
              filenameBase={publication.title}
              defaultEntryFile={publication.entryFile}
              variant='inline'
            />
          )}
        </section>
      </div>
    </aside>
  );
}
