/**
 * The tab's side panel (agent plugin UI blueprint W10): structure, properties, parameters and view options as
 * collapsible sections, without the app's dockview panes or project context.
 */
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentReference } from '@taucad/types';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@taucad/ui/components/accordion';
import { SwitchRow } from '@taucad/ui/components/switch';
import { PartPropertiesPanel } from '@taucad/viewer/cad/part-properties-panel';
import { useGraphicsSelector } from '@taucad/viewer/hooks/use-graphics';
import { getModelInteractionUnitState } from '@taucad/viewer/machines/model-interaction.machine';
import { StructureSection } from '@taucad/viewer/panels/structure-section';
import type { HostBridge } from '#app/host-bridge.js';
import { ParametersSection } from '#app/parameters-section.jsx';

/** The display switches the view section offers. */
export type ViewOptions = Readonly<{
  enableGrid: boolean;
  enableAxes: boolean;
  enableLines: boolean;
  enableSurfaces: boolean;
}>;

const viewSwitches = [
  ['enableGrid', 'Grid'],
  ['enableAxes', 'Axes'],
  ['enableLines', 'Edges'],
  ['enableSurfaces', 'Surfaces'],
] as const;

type SidePanelProps = Readonly<{
  bridge: HostBridge;
  model: TauViewerModel | undefined;
  selected: GeometryComponentReference | undefined;
  viewOptions: ViewOptions;
  onViewOptionsChange: (options: ViewOptions) => void;
  /** Show the model again after a parameter edit is written. */
  onParametersWritten: () => void;
}>;

/**
 * The sections, for whichever model the tab shows.
 *
 * @param props - The bridge, the shown model, the selection and the view options.
 * @returns The panel.
 */
export function SidePanel({
  bridge,
  model,
  selected,
  viewOptions,
  onViewOptionsChange,
  onParametersWritten,
}: SidePanelProps): React.JSX.Element {
  const modelInteractionRef = useGraphicsSelector((state) => state.context.modelInteractionRef);
  const unitId = useGraphicsSelector((state) => state.context.modelInteractionUnitId);
  const node = useGraphicsSelector((state) => {
    const id = state.context.modelInteractionUnitId;
    if (id === undefined || selected === undefined) {
      return undefined;
    }
    const unit = getModelInteractionUnitState(state.context.modelInteractionRef.getSnapshot().context, id);
    return unit.manifest?.nodesById[selected.componentId];
  });
  /* A GLB or SVG opened as itself has no source to read parameters from. */
  const parameterSource = model?.sourceFile;

  return (
    <aside aria-label='Model panels' className='flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l bg-sidebar'>
      <Accordion type='multiple' defaultValue={['structure', 'properties', 'parameters']}>
        <AccordionItem value='structure'>
          <AccordionTrigger className='px-3'>Structure</AccordionTrigger>
          <AccordionContent>
            <StructureSection modelInteractionRef={modelInteractionRef} unitId={unitId} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value='parameters'>
          <AccordionTrigger className='px-3'>Parameters</AccordionTrigger>
          <AccordionContent>
            {model === undefined || parameterSource === undefined ? (
              <p className='p-3 text-xs text-muted-foreground'>This file has no parameters.</p>
            ) : (
              <ParametersSection
                bridge={bridge}
                sourceFile={parameterSource}
                modelKey={model.sha256}
                onWritten={onParametersWritten}
              />
            )}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value='properties'>
          <AccordionTrigger className='px-3'>Properties</AccordionTrigger>
          <AccordionContent>
            <PartPropertiesPanel node={node} entryPath={model?.sourceFile} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value='view'>
          <AccordionTrigger className='px-3'>View</AccordionTrigger>
          <AccordionContent className='flex flex-col gap-1 px-3'>
            {viewSwitches.map(([key, label]) => (
              <SwitchRow
                key={key}
                isChecked={viewOptions[key]}
                onIsCheckedChange={(isChecked) => {
                  onViewOptionsChange({ ...viewOptions, [key]: isChecked });
                }}
              >
                {label}
              </SwitchRow>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </aside>
  );
}
