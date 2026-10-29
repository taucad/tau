# Coat Hook

A screw-on coat hook: rounded wall plate, two clearance holes, grip swept out and up.

SMLib is the showcase because the grip is `Circle.sweep` along a `Spline`. The path is a NURBS edge, so a STEP export still carries the curve. JSCAD's hull and OpenSCAD's `rotate_extrude` can look similar and then throw the curve away. Replicad can sweep too; SMLib is the kernel whose surfaces are NURBS rather than OpenCascade faces.

The product catalog also has **SMLibPy**, the same API in native Python for the desktop. It is not in the example-thumbnail runtime, and this browser model is the one the launch set renders. Parameters: `plateWidth`, `plateHeight`, `plateThickness`, `cornerRadius`, `reach`, `rise`, `gripRadius`, `screwDiameter`, `screwSpacing`.
