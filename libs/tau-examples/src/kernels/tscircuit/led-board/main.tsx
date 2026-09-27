/**
 * A SOIC-8 controller sinking a resistor-limited LED on pin 1, with a pull-down
 * input on pin 2 and explicit VCC/GND traces on a 30 mm × 20 mm board. Every
 * footprint comes from the built-in footprinter, so the board renders offline.
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types -- The board element type comes from the kernel's injected React runtime, not this workspace.
export default function LedBoard() {
  return (
    <board width='30mm' height='20mm'>
      <schematicsheet />
      <resistor name='R1' resistance='1k' footprint='0402' pcbX={-8} pcbY={4} />
      <resistor
        name='R2'
        resistance='10k'
        footprint='0402'
        pcbX={-8}
        pcbY={-4}
      />
      <led name='LED1' footprint='0603' pcbX={0} pcbY={6} />
      <chip
        name='U1'
        footprint='soic8'
        pcbX={6}
        pcbY={0}
        pinAttributes={{
          pin8: { requiresPower: true },
          pin4: { requiresGround: true },
        }}
      />
      <net name='VCC' />
      <net name='GND' />
      <trace name='R1_VCC' from='.R1 > .pin1' to='net.VCC' />
      <trace name='U1_VCC' from='.U1 > .pin8' to='net.VCC' />
      <trace name='R2_GND' from='.R2 > .pin2' to='net.GND' />
      <trace name='U1_GND' from='.U1 > .pin4' to='net.GND' />
      <trace name='R1_LED1' from='.R1 > .pin2' to='.LED1 > .anode' />
      <trace name='LED1_U1' from='.LED1 > .cathode' to='.U1 > .pin1' />
      <trace name='R2_U1' from='.R2 > .pin1' to='.U1 > .pin2' />
    </board>
  );
}
