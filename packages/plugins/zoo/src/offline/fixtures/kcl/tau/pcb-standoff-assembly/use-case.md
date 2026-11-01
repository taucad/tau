# PCB mounting plate assembly (imported part)

**Who asks:** an agent asked to reuse a standoff part it already wrote in the project.

**Prompt:** "Using the standoff from `standoff.kcl`, make a 100 × 70 × 3 mm mounting plate for a PCB with
3.2 mm holes 8 mm in from each corner, and stand an M3 hex standoff (5.5 mm across flats, 10 mm tall) on top of each
hole. Keep the plate and the standoffs as separate parts."

**Dimensions and constraints:** plate centred, z ∈ [0, 3], Ø3.2 holes at (±42, ±27); `standoff(height, acrossFlats,
holeDiameter)` exported by the module, built at the origin from z = 0, placed with `translate` at each hole on
z = 3.

**What right looks like:** five solids (plate and four standoffs), each standoff's tap hole on its plate hole's axis;
the module is imported, not copied.

**Hand calculation (mm³):**

| Term                                         | Value         |
| -------------------------------------------- | ------------- |
| Plate 100·70·3 − 4 · π · 1.6² · 3            | 20 903.49     |
| Standoffs 4 · (√3/2 · 5.5² − π · 1.25²) · 10 | +851.54       |
| **Expected volume**                          | **21 755.03** |

**Module location:** the module sits beside `main.kcl`. kcl-lib rejects an import of any file in a subdirectory
other than a `main.kcl` ("import path to a subdirectory must only refer to main.kcl"), so `inputs/standoff.kcl` is not
legal KCL; a project with a subdirectory would need `inputs/standoff/main.kcl`.

## Offline result

5 solids, volume 21 755.03 mm³, area 16 322.87 mm².

Against the hand calculation (21 755.03): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
