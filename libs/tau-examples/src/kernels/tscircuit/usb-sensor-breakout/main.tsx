/**
 * USB-C sensor breakout, sized to drop into `replicad/usb-sensor-shell`.
 *
 * The outline is 42 mm by 26 mm by 1.6 mm. A USB-C mid-mount feeds a SOIC-8,
 * a decoupling capacitor, an indicator LED and a four-pin I2C header. Every
 * footprint is the built-in footprinter, so the board renders offline.
 */
export const defaultParameters = {
  /** Series resistor for the indicator LED, in ohms. */
  seriesOhms: 1000,
  /** I2C pull-up, in ohms. */
  pullupOhms: 10_000,
};

type Parameters = typeof defaultParameters;

// oxlint-disable-next-line typescript/explicit-module-boundary-types -- The board element type comes from the kernel's injected React runtime, not this workspace.
export default function UsbSensorBreakout({
  seriesOhms = defaultParameters.seriesOhms,
  pullupOhms = defaultParameters.pullupOhms,
}: Parameters) {
  return (
    <board
      width='42mm'
      height='26mm'
      thickness='1.6mm'
      title='USB-C Sensor Breakout'
      solderMaskColor='black'
      silkscreenColor='white'
    >
      <connector
        name='J1'
        standard='usb_c'
        footprint='usbcmidmount'
        pcbX={-15}
        pcbY={0}
        pcbRotation={-90}
      />
      <capacitor
        name='C1'
        capacitance='100nF'
        footprint='0402'
        pcbX={-6}
        pcbY={6}
      />
      <chip
        name='U1'
        footprint='soic8'
        pcbX={0}
        pcbY={-1}
        pinLabels={{
          pin1: 'SDA',
          pin2: 'SCL',
          pin3: 'NC',
          pin4: 'GND',
          pin5: 'NC2',
          pin6: 'NC3',
          pin7: 'LED',
          pin8: 'VCC',
        }}
        pinAttributes={{
          pin8: { requiresPower: true },
          pin4: { requiresGround: true },
        }}
        noConnect={['NC', 'NC2', 'NC3']}
      />
      <resistor
        name='R1'
        resistance={`${seriesOhms}`}
        footprint='0402'
        pcbX={8}
        pcbY={7}
      />
      <led name='D1' color='green' footprint='0603' pcbX={14} pcbY={7} />
      <resistor
        name='R2'
        resistance={`${pullupOhms}`}
        footprint='0402'
        pcbX={8}
        pcbY={-8}
      />
      <pinheader
        name='J2'
        pinCount={4}
        footprint='pinrow4'
        pcbX={15}
        pcbY={-4}
        pinLabels={{ pin1: 'VCC', pin2: 'GND', pin3: 'SDA', pin4: 'SCL' }}
      />
      <net name='VCC' />
      <net name='GND' />
      <trace name='J1_VCC' from='.J1 > .pin1' to='net.VCC' />
      <trace name='J1_GND' from='.J1 > .pin2' to='net.GND' />
      <trace name='C1_VCC' from='.C1 > .pin1' to='net.VCC' />
      <trace name='C1_GND' from='.C1 > .pin2' to='net.GND' />
      <trace name='U1_VCC' from='.U1 > .VCC' to='net.VCC' />
      <trace name='U1_GND' from='.U1 > .GND' to='net.GND' />
      <trace name='J2_VCC' from='.J2 > .VCC' to='net.VCC' />
      <trace name='J2_GND' from='.J2 > .GND' to='net.GND' />
      <trace name='R2_VCC' from='.R2 > .pin1' to='net.VCC' />
      <trace name='R2_SDA' from='.R2 > .pin2' to='.U1 > .SDA' />
      <trace name='J2_SDA' from='.J2 > .SDA' to='.U1 > .SDA' />
      <trace name='J2_SCL' from='.J2 > .SCL' to='.U1 > .SCL' />
      <trace name='U1_LED' from='.U1 > .LED' to='.R1 > .pin1' />
      <trace name='R1_LED' from='.R1 > .pin2' to='.D1 > .anode' />
      <trace name='LED_GND' from='.D1 > .cathode' to='net.GND' />
    </board>
  );
}
