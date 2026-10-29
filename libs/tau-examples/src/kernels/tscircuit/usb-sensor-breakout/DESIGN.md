# USB-C Sensor Breakout

A small open-hardware-shaped board: USB-C power in, a SOIC-8 as the sensor or ADC, 100 nF decoupling, a green indicator, and a 4-pin header (VCC, GND, SDA, SCL). The outline is **42 mm × 26 mm × 1.6 mm**, which is the cavity the Replicad `usb-sensor-shell` is drawn around. The two files do not share a geometry kernel; they share those three numbers.

tscircuit is the showcase because the same component tree is the schematic, the PCB and the 3D board. No other Tau kernel places a footprint.

Parameters: `seriesOhms` (LED resistor) and `pullupOhms` (SDA pull-up). Footprints are the built-in footprinter (`usbcmidmount`, `soic8`, `0402`, `0603`, `pinrow4`) so the board builds offline. USB data pins are left to the connector's own unconnected-pin report; power is pins 1 and 2 of the mid-mount footprint.
