# @tscircuit/core — Simulation

7 top-level symbols. Signatures are verbatim typescript.

// Category: Simulation
// JSX element <analogsimulation> with AnalogSimulationProps
<analogsimulation>: AnalogSimulationProps

  name?: string

  simulationType?: "spice_transient_analysis"

  duration?: number | string

  startTime?: number | string

  timePerStep?: number | string

  spiceEngine?: AutocompleteString<"spicey" | "ngspice">

  spiceOptions?: SpiceOptions

  graphIndependentAxes?: boolean

// Category: Simulation
// JSX element <analogtransientsimulation> with AnalogTransientSimulationProps
<analogtransientsimulation>: AnalogTransientSimulationProps

  // Simulation duration
  duration?: number | string

  // Time at which recording starts
  startTime?: number | string

  // Maximum simulation timestep
  timePerStep?: number | string

  // Stable identity for the simulation experiment
  name?: string

  // SPICE implementation used to run this analysis
  spiceEngine?: AutocompleteString<"spicey" | "ngspice">

  // Numerical solver settings forwarded to the selected SPICE engine
  spiceOptions?: SpiceOptions

  // Render each probe with an independent vertical graph scale
  graphIndependentAxes?: boolean

  // Optional nested sweep parameter for repeated analysis runs
  children?: ReactNode

// Category: Simulation
// JSX element <analogdcoperatingpointsimulation> with AnalogDcOperatingPointSimulationProps
<analogdcoperatingpointsimulation>: AnalogDcOperatingPointSimulationProps

  // Stable identity for the simulation experiment
  name?: string

  // SPICE implementation used to run this analysis
  spiceEngine?: AutocompleteString<"spicey" | "ngspice">

  // Numerical solver settings forwarded to the selected SPICE engine
  spiceOptions?: SpiceOptions

  // Render each probe with an independent vertical graph scale
  graphIndependentAxes?: boolean

  // Optional nested sweep parameter for repeated analysis runs
  children?: ReactNode

// Category: Simulation
// JSX element <analogdcsweepsimulation> with AnalogDcSweepSimulationProps, required sweepSource, sweepStart, sweepStop, sweepStep
<analogdcsweepsimulation>: AnalogDcSweepSimulationProps

  // Selector for the independent voltage or current source being swept
  sweepSource: string

  // First source level
  sweepStart: number | string

  // Last source level
  sweepStop: number | string

  // Nonzero increment directed from sweepStart toward sweepStop
  sweepStep: number | string

  // Stable identity for the simulation experiment
  name?: string

  // SPICE implementation used to run this analysis
  spiceEngine?: AutocompleteString<"spicey" | "ngspice">

  // Numerical solver settings forwarded to the selected SPICE engine
  spiceOptions?: SpiceOptions

  // Render each probe with an independent vertical graph scale
  graphIndependentAxes?: boolean

  // Optional nested sweep parameter for repeated analysis runs
  children?: ReactNode

// Category: Simulation
// JSX element <analogacsweepsimulation> with AnalogAcSweepSimulationProps, required sweepType, startFrequency, stopFrequency
<analogacsweepsimulation>: AnalogAcSweepSimulationProps

  // Frequency spacing used by the AC analysis
  sweepType: "linear" | "decade" | "octave"

  // First positive frequency
  startFrequency: number | string

  // Last frequency, which must be greater than startFrequency
  stopFrequency: number | string

  // Samples per decade or octave
  samplesPerInterval?: number

  // Total samples
  sampleCount?: number

  // Stable identity for the simulation experiment
  name?: string

  // SPICE implementation used to run this analysis
  spiceEngine?: AutocompleteString<"spicey" | "ngspice">

  // Numerical solver settings forwarded to the selected SPICE engine
  spiceOptions?: SpiceOptions

  // Render each probe with an independent vertical graph scale
  graphIndependentAxes?: boolean

  // Optional nested sweep parameter for repeated analysis runs
  children?: ReactNode

// Category: Simulation
// JSX element <analogsweepparameter> with AnalogSweepParameterProps, required parameterType
<analogsweepparameter>: AnalogSweepParameterProps

  parameterType: "resistance"

  // Selector for the resistor whose simulation-only resistance is swept
  resistorRef: string

  // Stable identity for this sweep parameter
  name?: string

  // Explicit parameter coordinates
  values?: Array<number | string>

  // First generated parameter coordinate
  start?: number | string

  // Last generated parameter coordinate
  stop?: number | string

  // Nonzero parameter increment directed from start toward stop
  step?: number | string

  // Selector for the capacitor whose simulation-only capacitance is swept
  capacitorRef: string

  // Selector for the inductor whose simulation-only inductance is swept
  inductorRef: string

  // Net whose simulation-only voltage is swept
  net: string

  // Selector for the current source whose simulation-only current is swept
  currentSourceRef: string

// Category: Simulation
// JSX element <spicemodel> with SpiceModelProps, required source
<spicemodel>: SpiceModelProps

  source: string

  spicePinMapping?: Record<string, string>
