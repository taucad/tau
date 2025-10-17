import type {
  EngineeringDiscipline,
  KernelProvider,
  ManufacturingMethod,
  MessageAnnotation,
  MessageStatus,
  ToolWithSelection,
} from '@taucad/types';

declare module '@ai-sdk/react' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interface is necessary to augment the Message type
  interface Message {
    model: string;
    metadata?: {
      toolChoice?: ToolWithSelection;
      kernel?: KernelProvider;
      manufacturingMethod?: ManufacturingMethod;
      engineeringDiscipline?: EngineeringDiscipline;
    };
    // The AI SDK doesn't have valid support for module augmentation of MessageAnnotation.
    // @ts-expect-error -- Subsequent property declarations must have the same type.  Property 'annotations' must be of type 'JSONValue[] | undefined', but here has type 'MessageAnnotation[] | undefined'.
    annotations?: MessageAnnotation[];
  }
}
