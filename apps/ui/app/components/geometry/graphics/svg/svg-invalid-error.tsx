import type { GeometrySvg } from '@taucad/types';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '#components/ui/collapsible.js';

type SvgInvalidErrorProps = {
  readonly invalidGeometries: GeometrySvg[];
  readonly totalGeometries: number;
};

export function SvgInvalidError({ invalidGeometries, totalGeometries }: SvgInvalidErrorProps): React.JSX.Element {
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-4">
      <Collapsible className="max-w-2xl rounded-lg border border-destructive bg-destructive/10 backdrop-blur-sm">
        <div className="px-6 py-4">
          <div className="flex items-center gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 shrink-0 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="font-semibold text-destructive">Invalid Geometry Data</p>
              <p className="text-sm text-destructive/80">
                {invalidGeometries.length === totalGeometries
                  ? 'All geometries have invalid viewbox data'
                  : `${invalidGeometries.length} of ${totalGeometries} geometries have invalid viewbox data`}
              </p>
            </div>
            <CollapsibleTrigger className="ml-2 rounded p-1 hover:bg-destructive/20">
              <ChevronDown className="h-5 w-5 text-destructive transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-destructive/20 px-6 py-4">
            <p className="mb-2 text-sm font-medium text-destructive">Invalid Geometries:</p>
            <div className="max-h-60 overflow-y-auto">
              <ul className="space-y-1 text-xs text-destructive/80">
                {invalidGeometries.map((geometry, index) => {
                  return (
                    <li key={geometry.name || index} className="rounded bg-destructive/5 p-2 font-mono">
                      <span className="font-semibold">{geometry.name || `Unnamed ${index + 1}`}</span>
                      <br />
                      <span className="text-destructive/60">viewbox: {geometry.viewbox}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
