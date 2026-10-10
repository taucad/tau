# @tscircuit/core — Helpers

6 top-level symbols. Signatures are verbatim typescript.

// Category: Helpers
// Typed selector builder — sel.U1.VCC is ".U1 > .VCC", sel.net.GND is "net.GND", sel("U1").VCC takes any reference designator
// sel (function)
export declare function sel<P extends string>(refdes: string): Record<P, string>;

// Category: Helpers
// useChip (function)
export declare function useChip<PinLabel extends string>(pinLabels: Record<string, PinLabel[]>): <PropsFromHook extends Omit<ChipProps, "name"> | undefined = undefined>(name: string, props?: PropsFromHook | undefined) => ComponentWithPins<ChipProps, string | PinLabel, PropsFromHook>;

// Category: Helpers
// useResistor (function)
export declare function useResistor<PropsFromHook extends Omit<ResistorProps<string>, "name"> | undefined = undefined>(name: string, props?: PropsFromHook | undefined): ComponentWithPins<ResistorProps<string>, "left" | "right" | "pin1" | "pin2", PropsFromHook>;

// Category: Helpers
// useCapacitor (function)
export declare function useCapacitor<PropsFromHook extends Omit<CapacitorProps<string>, "name"> | undefined = undefined>(name: string, props?: PropsFromHook | undefined): ComponentWithPins<CapacitorProps<string>, "left" | "right" | "pin1" | "pin2" | "anode" | "cathode" | "pos" | "neg", PropsFromHook>;

// Category: Helpers
// useDiode (function)
export declare function useDiode<PropsFromHook extends Omit<DiodeProps<string>, "name"> | undefined = undefined>(name: string, props?: PropsFromHook | undefined): ComponentWithPins<DiodeProps<string>, "left" | "right" | "pin1" | "pin2" | "anode" | "cathode" | "pos" | "neg", PropsFromHook>;

// Category: Helpers
// createUseComponent (function)
export declare function createUseComponent<Props, PinLabel extends string | never = never>(Component: react__default.ComponentType<Props>, pins: readonly PinLabel[]): <PropsFromHook extends Omit<Props, "name"> | undefined = undefined>(name: string, props?: PropsFromHook) => ComponentWithPins<Props, PinLabel, PropsFromHook>;
export declare function createUseComponent<Props, PinLabel extends string | never = never, PinNumberKey extends string = never>(Component: react__default.ComponentType<Props>, pins: Record<PinNumberKey, readonly PinLabel[] | PinLabel[]>): <PropsFromHook extends Omit<Props, "name"> | undefined = undefined>(name: string, props?: PropsFromHook) => ComponentWithPins<Props, PinLabel | PinNumberKey, PropsFromHook>;
