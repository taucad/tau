# Machined block: fillet, then chamfer

**Who asks:** a machinist modelling an aluminium spacer block before CAM.

**Prompt:** "Model a 60 × 40 × 25 mm aluminium block. Round the four vertical edges with a 6 mm radius, then break
the whole top edge with a 1 mm chamfer."

**Dimensions and constraints:** block centred on the origin in XY, z ∈ [0, 25]; R6 on the four vertical edges; a
1 × 1 mm chamfer on the top perimeter, which after the fillet is four straight edges joined by four arcs; the chamfer
is asked for on the straight top edges and runs on round the tangent arcs.

**What right looks like:** one solid; the chamfer runs continuously around the top, through the rounded corners.

**Hand calculation (mm³):**

| Term                                                    | Value         |
| ------------------------------------------------------- | ------------- |
| Block 60·40·25                                          | 60 000.00     |
| Four fillets 4 · (6² − π·6²/4) · 25                     | −772.57       |
| Chamfer on the straight edges 2 · (48 + 28) · 0.5       | −76.00        |
| Chamfer on the arcs 2π · 6 · 0.5 · (6 − 1/3)/6 (Pappus) | −17.80        |
| **Expected volume**                                     | **59 133.63** |

## Offline result

Fails offline: `engine: command Solid3dCutEdges resulted in errors: Unknown edge <id>`.

A `chamfer` call whose edges include two non-adjacent edges fails, with or without the fillet before it: on a plain block, chamfering the front and right top edges builds, but front and back, all four top edges, or two vertical edges fail with this message (a `fillet` of all four top edges builds). Pinned gap, new: multi-edge chamfer, close to G2.

Expected once the gap closes: 59 133.63 mm³.

No Zoo oracle: `ZOO_API_TOKEN` was not set when the fixture was recorded.
