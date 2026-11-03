# Finned heat sink (patterned ribs)

**Who asks:** an electronics engineer cooling a 40 mm square chip.

**Prompt:** "Make a heat sink 40 × 40 mm with a 3 mm base and nine fins, 1.2 mm thick and 15 mm tall, running the
full length and spread evenly so the outer fins are flush with the base edges."

**Dimensions and constraints:** base centred, z ∈ [0, 3]; fins along Y, the first at x ∈ [−20, −18.8], pitch
(40 − 1.2)/8 = 4.85 mm, z ∈ [3, 18].

**What right looks like:** one solid; nine equal fins fused to the base, the outer faces flush with the base sides.

**Hand calculation (mm³):**

| Term                   | Value         |
| ---------------------- | ------------- |
| Base 40·40·3           | 4 800.00      |
| Fins 9 · 1.2 · 40 · 15 | +6 480.00     |
| **Expected volume**    | **11 280.00** |

## Offline result

1 solid, volume 11 280.00 mm³, area 14 804.00 mm².

Against the hand calculation (11 280.00): +0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
