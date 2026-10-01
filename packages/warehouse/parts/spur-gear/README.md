# Involute spur gear

Metric-module, 20-degree involute transmission geometry with real teeth and a declared datum. Tooth profiles are reused from Tau’s planetary gear design.

Actual tooth geometry: involute B-spline flanks with root/tip arcs, transverse metric module and 20-degree pressure angle. Helical version uses a 15-degree total twist over the face width. KHK dimensional reference: https://khkgears.net/gear-knowledge/gear-technical-reference/calculation-gear-dimensions/ . Profile approximation, backlash and root blends follow the local Tau example; these are assembly parts, not certified production gear cutters. Load, undercut and mating-pair qualification are separate.

All dimensions are millimetres. Edit main.ts and its local model.ts or use Tau parameters. Domains and qualified combinations are in parameters.ts. Defaults and every declared domain boundary/discrete value are tested by main.geospec.ts through STEP and GLB. These finite checks do not prove every intermediate real-valued combination.
