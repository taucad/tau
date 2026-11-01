# Bottle

**Who asks:** a packaging designer blocking out a flat-sided bottle (the classic CAD bottle exercise).

**Prompt:** "Model a bottle: the body is a stadium shape (70 mm long with semicircular ends, 40 mm wide) and 150 mm
tall, with a 26 mm neck, 20 mm tall, sketched on the top of the body. Shell it to 2 mm walls with the mouth open."

**Dimensions and constraints:** body footprint 30 mm straight sides plus R20 ends, extruded 150; neck Ø26 × 20 on the
top face, centred; shell 2 mm inward removing the neck's end face.

**What right looks like:** one hollow solid, watertight except the mouth, uniform 2 mm walls; the inside of the neck
meets the inside of the shoulder.

**Hand calculation (mm³):**

| Term                              | Value                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| Body (30·40 + π·20²) · 150        | 368 495.56                                                                               |
| Neck π · 13² · 20                 | +10 618.58                                                                               |
| Body cavity (30·36 + π·18²) · 146 | −306 289.90                                                                              |
| Neck bore π · 11² · 22            | −8 362.92                                                                                |
| **Expected volume**               | **64 461.32** (an arc-joined offset at the neck's inner corner removes ≈ 67 more, 0.1 %) |

## Offline result

1 solid, volume 64 399.59 mm³, area 64 567.14 mm².

Against the hand calculation (64 461.32): -0.096 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
