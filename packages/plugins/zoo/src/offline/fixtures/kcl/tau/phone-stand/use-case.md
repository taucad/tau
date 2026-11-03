# Desk phone stand

**Who asks:** an office worker who wants their phone upright next to the monitor.

**Prompt:** "Design a simple desk phone stand from 4 mm thick material, 70 mm wide. Base 80 mm deep, a front lip
12 mm tall, and a back rest 90 mm long leaning back at 65° from the desk, starting 14 mm behind the lip so a phone in
a case fits. Cut a 12 mm wide slot in the middle of the lip for the charging cable, stopping 1 mm above the ledge."

**Dimensions and constraints:** side profile in the YZ plane (y = depth, z = height), extruded symmetrically 70 along
X. Base y ∈ [0, 80], z ∈ [0, 4]; lip y ∈ [0, 4], z up to 12; back rest's front face from (18, 4) at 65° for 90 mm, 4 mm
thick; slot x ∈ [−6, 6] through the lip from z = 5 up.

**What right looks like:** one solid that stands on its base; the phone rests on the 14 mm ledge against the back
rest; the cable passes through the lip.

**Hand calculation (mm³):** profile vertices (0, 0), (80, 0), (80, 4), (22.414, 4), (59.661, 83.877),
(56.036, 85.568), (18, 4), (4, 4), (4, 12), (0, 12); shoelace area 708.27 mm².

| Term                  | Value         |
| --------------------- | ------------- |
| Profile 708.27 · 70   | 49 578.87     |
| Cable slot 12 · 4 · 7 | −336.00       |
| **Expected volume**   | **49 242.87** |

## Offline result

1 solid, volume 49 242.87 mm³, area 26 625.03 mm².

Against the hand calculation (49 242.87): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
