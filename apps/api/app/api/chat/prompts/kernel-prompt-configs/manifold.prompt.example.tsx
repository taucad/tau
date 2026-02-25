import { traceHints } from "@tscircuit/math-utils";

export const defaultParams = {
  boardWidthMm: 48,
  boardHeightMm: 32,
  resistorOhms: "1k",
};

export default function main(parameters = defaultParams) {
  const width = Number(parameters.boardWidthMm) || 48;
  const height = Number(parameters.boardHeightMm) || 32;

  circuit.add(
    <board width={`${width}mm`} height={`${height}mm`} routingDisabled>
      <resistor
        name="R1"
        resistance={parameters.resistorOhms}
        footprint="0402"
        pcbX={-6}
        pcbY={0}
      />
      <capacitor
        name="C1"
        capacitance="100nF"
        footprint="0402"
        pcbX={6}
        pcbY={0}
      />
      <trace from=".R1 > .pin1" to=".C1 > .pin1" routeHint={traceHints.straight} />
    </board>,
  );
}
