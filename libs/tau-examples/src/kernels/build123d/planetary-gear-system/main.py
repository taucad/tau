"""The Replicad planetary stage, authored as native build123d parts and assemblies.

Millimetres and degrees. ``main`` returns one labelled Compound assembly;
``planet_unit`` returns a self-contained, reusable subassembly at the origin.
See README.md for provenance, verification and transport limitations.
"""

from copy import copy
from dataclasses import dataclass
from math import acos, atan, atan2, cos, hypot, pi, sin, sqrt, tan

from build123d import (
    Axis, Color, Compound, Edge, Face, Location, Part, Plane,
    RigidJoint, Solid, Vector, Wire,
)


@dataclass(frozen=True)
class Params:
    module: float = 2.0
    face_width: float = 14.0
    input_angle: float = 0.0


RAD = pi / 180


def polar(radius, angle):
    return (radius * cos(angle), radius * sin(angle), 0)


def mirror_y(point):
    return (point[0], -point[1], 0)


def capsule(length, width):
    c, r = (length - width) / 2, width / 2
    return Face(Wire([
        Edge.make_line((-c, -r, 0), (c, -r, 0)),
        Edge.make_three_point_arc((c, -r, 0), (c + r, 0, 0), (c, r, 0)),
        Edge.make_line((c, r, 0), (-c, r, 0)),
        Edge.make_three_point_arc((-c, r, 0), (-c - r, 0, 0), (-c, -r, 0)),
    ]))


def tooth_profile(teeth, module, internal_space=False):
    """One analytical involute period, repeated as edges into one closed wire."""
    pitch = module * teeth / 2
    base = pitch * cos(20 * RAD)
    root = pitch - (1 if internal_space else 1.25) * module
    tip = pitch + (1.25 if internal_space else 1) * module
    root_blend = 0.3 * module
    tip_blend = (0.3 if internal_space else 0.09) * module
    half_at_base = pi / (2 * teeth) + (0.1 if internal_space else -0.1) / (2 * pitch) + tan(20 * RAD) - 20 * RAD

    def half_angle(r):
        t = sqrt(max(0, (r / base) ** 2 - 1))
        return half_at_base - t + atan(t)

    def flank_point(r):
        return polar(r, -half_angle(r))

    if root + root_blend < base:
        root_join = sqrt((root + root_blend) ** 2 - root_blend ** 2)
        a = -half_at_base
        q = polar(root_join, a)
        root_center = (q[0] + root_blend * sin(a), q[1] - root_blend * cos(a), 0)
        root_contact = q
    else:
        lo, hi = max(root, base), root + root_blend
        for _ in range(45):
            r = (lo + hi) / 2
            a = acos(base / r)
            c = sqrt(r * r + root_blend ** 2 + 2 * r * root_blend * sin(a))
            if c > root + root_blend:
                hi = r
            else:
                lo = r
        root_join = (lo + hi) / 2
        root_contact = flank_point(root_join)
        tangent = -half_angle(root_join) + acos(base / root_join)
        root_center = (root_contact[0] + root_blend * sin(tangent), root_contact[1] - root_blend * cos(tangent), 0)
    root_foot = polar(root, atan2(root_center[1], root_center[0]))

    lo, hi = max(base, tip - 2 * tip_blend), tip
    for _ in range(45):
        r = (lo + hi) / 2
        a = acos(base / r)
        c = sqrt(r * r + tip_blend ** 2 - 2 * r * tip_blend * sin(a))
        if c > tip - tip_blend:
            hi = r
        else:
            lo = r
    tip_join = (lo + hi) / 2
    tip_contact = flank_point(tip_join)
    tangent = -half_angle(tip_join) + acos(base / tip_join)
    tip_center = (tip_contact[0] - tip_blend * sin(tangent), tip_contact[1] + tip_blend * cos(tangent), 0)
    tip_foot = polar(tip, atan2(tip_center[1], tip_center[0]))

    def arc_middle(a, b, c):
        dx, dy = a[0] + b[0] - 2 * c[0], a[1] + b[1] - 2 * c[1]
        radius, distance = hypot(a[0] - c[0], a[1] - c[1]), hypot(dx, dy)
        return (c[0] + radius * dx / distance, c[1] + radius * dy / distance, 0)

    root_mid = arc_middle(root_foot, root_contact, root_center)
    tip_mid = arc_middle(tip_contact, tip_foot, tip_center)
    t0 = sqrt(max(0, (max(base, root_join) / base) ** 2 - 1))
    t1 = sqrt((tip_join / base) ** 2 - 1)
    flank = [polar(base * sqrt(1 + t * t), -half_at_base + t - atan(t)) for t in [t0 + (t1 - t0) * i / 8 for i in range(9)]]
    edges = [Edge.make_three_point_arc(root_foot, root_mid, root_contact)]
    if root_join < base:
        edges.append(Edge.make_line(root_contact, flank[0]))
    edges.extend([
        Edge.make_spline(flank),
        Edge.make_three_point_arc(tip_contact, tip_mid, tip_foot),
        Edge.make_three_point_arc(tip_foot, (tip, 0, 0), mirror_y(tip_foot)),
        Edge.make_three_point_arc(mirror_y(tip_foot), mirror_y(tip_mid), mirror_y(tip_contact)),
        Edge.make_spline([mirror_y(point) for point in reversed(flank)]),
    ])
    if root_join < base:
        edges.append(Edge.make_line(mirror_y(flank[0]), mirror_y(root_contact)))
    edges.extend([
        Edge.make_three_point_arc(mirror_y(root_contact), mirror_y(root_mid), mirror_y(root_foot)),
        Edge.make_three_point_arc(mirror_y(root_foot), polar(root, pi / teeth), polar(root, 2 * pi / teeth + atan2(root_foot[1], root_foot[0]))),
    ])
    return Face(Wire([edge.rotate(Axis.Z, i * 360 / teeth) for i in range(teeth) for edge in edges]))


def cylinder(radius, height, z=0, x=0, y=0):
    return Solid.make_cylinder(radius, height, Plane((x, y, z)))


def extrude(face, height, z=0):
    return Solid.extrude(face, (0, 0, height)).translate((0, 0, z))


def edges_at(shape, z):
    return [edge for edge in shape.edges() if abs(edge.bounding_box().min.Z - z) < 1e-5 and abs(edge.bounding_box().max.Z - z) < 1e-5]


def chamfer(shape, radius, z=None):
    return shape.chamfer(radius, None, shape.edges() if z is None else edges_at(shape, z))


def part(name, shape, color):
    """A native Part containing solid geometry; children are reserved for assemblies."""
    result = Part(shape.solids(), label=name, color=Color(color))
    RigidJoint("axis", result, Location())
    return result


def carrier_plate(a):
    spider = Face(Wire.make_circle(18))
    for i in range(3):
        spider = spider.fuse(capsule(a + 16, 16).translate((a / 2, 0, 0)).rotate(Axis.Z, i * 120))
    hub_corner = sqrt(18 ** 2 - 8 ** 2)
    corners = [Vector(hub_corner * cos(i * 120 * RAD) - y * sin(i * 120 * RAD), hub_corner * sin(i * 120 * RAD) + y * cos(i * 120 * RAD), 0) for i in range(3) for y in (8, -8)]
    spider = spider.fillet_2d(3, [v for v in spider.vertices() if any((v.center() - c).length < 1e-5 for c in corners)])
    for i in range(3):
        spider = spider.cut(Face(Wire.make_circle(4.01)).translate((a, 0, 0)).rotate(Axis.Z, i * 120))
        spider = spider.cut(capsule(a - 26, 5.5).translate(((a + 14) / 2, 0, 0)).rotate(Axis.Z, i * 120))
    plate = extrude(spider, 5)
    return chamfer(chamfer(plate, 0.35, 0), 0.35, 5)


def planet_unit(p, gear_blank):
    """A complete bearing/pin/gear stack, placed by its parent assembly."""
    f = p.face_width
    gear = gear_blank.cut(cylinder(7.015, f + 2, -1)).rotate(Axis.Z, 7.5 - 3 * p.input_angle / 4)
    points = [(0, 0, -7.9), (3.745, 0, -7.9), (3.995, 0, -7.65), (3.995, 0, -3), (5, 0, -3), (5, 0, f + 3), (3.995, 0, f + 3), (3.995, 0, f + 7.65), (3.745, 0, f + 7.9), (0, 0, f + 7.9)]
    pin_face = Face(Wire.make_polygon(points, close=True))
    pin_face = pin_face.fillet_2d(0.15, [v for v in pin_face.vertices() if abs(v.center().X - 3.995) < 1e-6 and (abs(v.center().Z + 3) < 1e-6 or abs(v.center().Z - f - 3) < 1e-6)])
    pin = Solid.revolve(pin_face, 360, Axis.Z).cut(cylinder(2.525, 13.1, -8.1), cylinder(2.525, 13.1, f - 5))
    bushing = cylinder(7, f).fuse(cylinder(9, 1.5, f)).cut(cylinder(5.02, f + 3, -0.5))
    bushing = chamfer(chamfer(bushing, 0.12, 0), 0.2, f + 1.5)
    washer = chamfer(cylinder(9, 1.5, -1.5).cut(cylinder(5.05, 1.5, -1.5)), 0.12)
    washer = washer.cut(*[extrude(capsule(4.5, 0.7).translate((7.1, 0, 0)).rotate(Axis.Z, i * 120), 0.4, -0.2) for i in range(3)])
    spacer = chamfer(cylinder(7, 1.3).cut(cylinder(5.02, 1.3)), 0.1)
    screw_washer = chamfer(cylinder(5, 1).cut(cylinder(2.65, 1)), 0.1)
    head = cylinder(4.25, 5)
    head = chamfer(head.fillet(0.35, edges_at(head, 5)), 0.15, 0)
    screw = head.fuse(chamfer(cylinder(2.48, 12, -12), 0.25, -12))
    socket = Face(Wire.make_polygon([polar(4 / sqrt(3), (30 + i * 60) * RAD) for i in range(6)], close=True))
    screw = screw.cut(extrude(socket, 3, 2.5))
    unit = Compound(label="Planet Unit", children=[
        part("Planet Gear", gear, "#B7C1CA"),
        part("Planet Pin", pin, "#8C9AA7"),
        part("Flanged Bushing", bushing, "#BE974E"),
        part("Thrust Washer", washer, "#BE974E"),
        part("Front Thrust Spacer", spacer.translate((0, 0, f + 1.7)), "#8C9AA7"),
        part("Rear Thrust Spacer", spacer.translate((0, 0, -3)), "#8C9AA7"),
        part("Front Screw Washer", screw_washer.translate((0, 0, f + 8)), "#8C9AA7"),
        part("Rear Screw Washer", screw_washer.translate((0, 0, -9)), "#8C9AA7"),
        part("Front Socket Screw", screw.translate((0, 0, f + 9)), "#313B46"),
        part("Rear Socket Screw", screw.rotate(Axis.X, 180).translate((0, 0, -9)), "#313B46"),
    ])
    RigidJoint("mount", unit, Location())
    return unit


def main(p: Params = Params()):
    if not (1.5 <= p.module <= 3 and 10 <= p.face_width <= 24):
        raise ValueError("This spike supports module 1.5–3 mm and face_width 10–24 mm.")
    f, a = p.face_width, 24 * p.module
    gear_blank = extrude(tooth_profile(24, p.module), f)
    shaft = chamfer(cylinder(8, f + 30, -28), 0.5)
    sun = gear_blank.fuse(shaft, chamfer(cylinder(12, 2, -2), 0.25), chamfer(cylinder(12, 2, f), 0.25))
    keyseat = capsule(16, 5).rotate(Axis.Z, 90).rotate(Axis.X, 90).translate((0, 5, -18))
    sun = sun.cut(Solid.extrude(keyseat, (0, 5, 0)), cylinder(2.5, 9.1, -28.1)).rotate(Axis.Z, p.input_angle)
    ring_void = extrude(tooth_profile(72, p.module, True).rotate(Axis.Z, 2.5), f + 4, -2)
    holes = []
    for i in range(6):
        x, y, _ = polar(36 * p.module + 9, (30 + 60 * i) * RAD)
        holes.extend([cylinder(2.75, f + 4, -2, x, y), cylinder(4.75, 3.2, f - 2, x, y)])
    ring = chamfer(cylinder(36 * p.module + 15, f + 2, -1), 0.6).cut(ring_void, *holes)
    plate = carrier_plate(a)
    rear = plate.cut(cylinder(9, 7, -1)).translate((0, 0, -8))
    output_hub = chamfer(cylinder(15, 18, f + 8), 0.6, f + 26)
    front = plate.translate((0, 0, f + 3)).fuse(output_hub)
    front = front.fillet(1, [e for e in edges_at(front, f + 8) if abs(e.length - 2 * pi * 15) < 1e-4])
    front = front.cut(cylinder(6, 25, f + 2), Solid.make_box(4, 7.8, 25, Plane((-2, 0, f + 2))), Solid.make_cylinder(2, 11, Plane(origin=(15.1, 0, f + 18), z_dir=(-1, 0, 0))))

    prototype = planet_unit(p, gear_blank)
    units = []
    for i in range(3):
        # A fresh assembly container avoids build123d 0.11.1 STEP child duplication
        # when copy(Compound) shares its root TShape. Copy leaves to retain reuse.
        unit = Compound(label=f"Planet Unit {i + 1}", children=[copy(child) for child in prototype.children])
        RigidJoint("mount", unit, prototype.joints["mount"].relative_location)
        unit.move(Location(polar(a, i * 120 * RAD)))
        units.append(unit)
    carrier = Compound(label="Carrier", children=[
        part("Carrier Rear", rear, "#285E88"),
        part("Carrier Front And Output Hub", front, "#285E88"),
        *units,
    ])
    RigidJoint("output", carrier, Location((0, 0, f + 26)))
    carrier.move(Location((0, 0, 0), (0, 0, p.input_angle / 4)))
    result = Compound(label="Planetary Gear System", children=[
        part("Internal Ring Gear", ring, "#718293"),
        part("Sun Gear And Input Shaft", sun, "#D0D6DD"),
        carrier,
    ])
    RigidJoint("mount", result, Location())
    return result
