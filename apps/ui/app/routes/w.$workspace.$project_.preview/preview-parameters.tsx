import { useState, useCallback } from 'react';
import { useSelector } from '@xstate/react';
import { RefreshCcw, ChevronRight, Search } from 'lucide-react';
import { hasJsonSchemaObjectProperties } from '@taucad/utils/schema';
import { Button } from '#components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '#components/ui/tooltip.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { cn } from '#utils/ui.utils.js';
import { useCadPreview } from '#hooks/use-cad-preview.js';

export function PreviewParameters(): React.JSX.Element {
  const { cadRef, graphicsRef, defaultParameters, jsonSchema, setParameters } = useCadPreview();
  const parameters = useSelector(cadRef, (snapshot) => snapshot.context.parameters);
  const units = useSelector(graphicsRef, (state) => state.context.units);

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isAllExpanded, setIsAllExpanded] = useState(true);

  const handleParametersChange = useCallback(
    (newParameters: Record<string, unknown>) => {
      setParameters(newParameters);
    },
    [setParameters],
  );

  const toggleSearch = useCallback(() => {
    setIsSearchVisible((current) => !current);
  }, []);

  const toggleAllExpanded = useCallback(() => {
    setIsAllExpanded((current) => !current);
  }, []);

  const resetAllParameters = useCallback(() => {
    setParameters({});
  }, [setParameters]);

  const hasModifiedParameters = Object.keys(parameters).length > 0;

  return (
    <div className='flex h-full flex-col'>
      <div className='flex items-center justify-between border-b p-2'>
        <h3 className='text-sm font-semibold'>Parameters</h3>
        <div className='flex items-center gap-1'>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className={cn('size-6 rounded-sm', isSearchVisible && 'text-primary')}
                aria-label={isSearchVisible ? 'Hide search' : 'Show search'}
                onClick={toggleSearch}
              >
                <Search className='size-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent side='top'>{isSearchVisible ? 'Hide search' : 'Search parameters'}</TooltipContent>
          </Tooltip>
          {hasModifiedParameters ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-6 rounded-sm'
                  aria-label='Reset all parameters'
                  onClick={resetAllParameters}
                >
                  <RefreshCcw className='size-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>Reset all parameters</TooltipContent>
            </Tooltip>
          ) : null}
          {jsonSchema && hasJsonSchemaObjectProperties(jsonSchema) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant='ghost'
                  size='icon'
                  className='size-6 rounded-sm'
                  aria-expanded={isAllExpanded}
                  aria-label={isAllExpanded ? 'Collapse all' : 'Expand all'}
                  onClick={toggleAllExpanded}
                >
                  <ChevronRight
                    className={cn('size-4 transition-transform duration-300 ease-in-out', isAllExpanded && 'rotate-90')}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side='top'>{isAllExpanded ? 'Collapse all' : 'Expand all'}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <div className='flex-1 overflow-hidden'>
        <Parameters
          parameters={parameters}
          defaultParameters={defaultParameters}
          jsonSchema={jsonSchema}
          units={units}
          enableSearch={isSearchVisible}
          isAllExpanded={isAllExpanded}
          emptyDescription='This model has no parameters'
          onParametersChange={handleParametersChange}
        />
      </div>
    </div>
  );
}
