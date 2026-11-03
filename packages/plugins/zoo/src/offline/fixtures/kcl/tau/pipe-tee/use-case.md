# Equal pipe tee

**Who asks:** a garden-irrigation planner who wants a printable 20 mm tee.

**Prompt:** "Design an equal tee fitting for 20 mm ID tubing: 26 mm outside diameter, the run 80 mm long, and the
branch coming out at 90° to 40 mm from the run's centreline. Hollow it so all three bores meet."

**Dimensions and constraints:** run along X, Ø26, x ∈ [−40, 40]; branch along +Z from the run axis to z = 40, Ø26;
bores Ø20 through the run and up the branch.

**What right looks like:** one solid; the three bores are open and meet in the middle.

**Hand calculation (mm³):** two perpendicular equal cylinders, the branch starting on the run's axis, overlap in
half a Steinmetz solid, 8R³/3. Bores are subtracted the same way.

| Term                               | Value         |
| ---------------------------------- | ------------- |
| Shells π(13² − 10²) · (80 + 40)    | 26 012.39     |
| Overlap correction −8(13³ − 10³)/3 | −3 192.00     |
| **Expected volume**                | **22 820.39** |

## Offline result

1 solid, volume 22 820.39 mm³, area 15 839.90 mm².

Against the hand calculation (22 820.39): -0.000 %.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
