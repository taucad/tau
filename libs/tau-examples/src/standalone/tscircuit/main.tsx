export default function Board() {
  return (
    <board width='20mm' height='20mm'>
      <resistor name='R1' resistance='1k' footprint='0402' pcbX={-4} pcbY={0} />
      <led name='LED1' color='red' footprint='0603' pcbX={4} pcbY={0} />
      <trace name='R1_LED1' from='.R1 > .pin2' to='.LED1 > .anode' />
    </board>
  );
}
