# Hose Adapter

A printable or machinable duct reducer: circular inlet, rounded rectangular outlet, constant wall, with the run bent by shifting the middle section.

OpenCascade is the showcase because `BRepOffsetAPI_ThruSections` builds one solid through three dissimilar wires (a circle and two rounded rectangles). A cylinder primitive only makes a cone. A mesh hull between the end sections misses the bend and faceting replaces the wall.

Parameters: `inletDiameter`, `outletWidth`, `outletHeight`, `outletCorner`, `length`, `wall`, `bend`. Defaults suit a small shop-vac to a rectangular tool port. The kernel id in the product catalog is `opencascadejs`; example locators use the directory name `opencascade`.
