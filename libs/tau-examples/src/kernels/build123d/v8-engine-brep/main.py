"""BRep-native cross-plane 90 degree V8 engine reference in build123d.

This is a Python/build123d sibling of the Replicad ``v8-engine-brep`` fixture.
It intentionally mirrors the same part layout and BRep-native construction
patterns so Tau can compare Replicad/libcascade against native
build123d/OCP without changing the visible reference model.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, hypot, pi, sin, sqrt
from typing import Literal

from build123d import Axis, Edge, Face, Plane, Shape, Solid, Vector, Wire


Point2 = tuple[float, float]
Point3 = tuple[float, float, float]
PlaneName = Literal["XY", "YZ", "XZ"]
CurveSegment = tuple[Literal["line"], Point2] | tuple[Literal["arc"], Point2, Point2]


@dataclass(frozen=True)
class Params:
    bank_angle: float = 90.0
    bore: float = 94.0
    stroke: float = 90.0
    deck_height: float = 232.0

    main_journal_dia: float = 60.0
    main_journal_len: float = 28.0
    crankpin_dia: float = 52.0
    crankpin_len: float = 30.0
    crank_throw: float = 45.0
    web_thickness: float = 22.0
    web_hub_main_dia: float = 68.0
    web_hub_pin_dia: float = 60.0
    counterweight_dia: float = 150.0
    counterweight_offset: float = 30.0
    snout_dia: float = 38.0
    snout_len: float = 60.0
    flange_dia: float = 120.0
    flange_thk: float = 16.0
    flange_bolts: int = 8
    flange_bolt_dia: float = 11.0
    flange_bolt_circle: float = 90.0
    oil_gallery_dia: float = 6.0
    end_chamfer: float = 2.0

    crown_dia: float = 93.6
    dome_rise: float = 3.5
    piston_comp_height: float = 32.0
    piston_skirt_len: float = 30.0
    ring_groove_depth: float = 1.2
    ring_groove_width: float = 2.0
    pin_bore_dia: float = 22.0
    wrist_pin_outer_dia: float = 22.0
    wrist_pin_inner_dia: float = 12.0
    wrist_pin_len: float = 64.0
    rod_big_end_dia: float = 56.0
    rod_big_end_bore_dia: float = 52.0
    rod_small_end_dia: float = 30.0
    rod_small_end_bore_dia: float = 22.0
    rod_length: float = 155.0
    rod_beam_width: float = 18.0
    rod_beam_thk: float = 10.0

    bores: int = 4
    bore_pitch: float = 102.0
    block_deck_thk: float = 12.0
    block_wall_thk: float = 7.0
    main_web_thk: float = 18.0

    head_thk: float = 110.0
    valve_cover_height: float = 55.0
    plenum_dia: float = 90.0
    runner_dia: float = 34.0
    throttle_dia: float = 70.0

    damper_outer_dia: float = 170.0
    damper_thk: float = 34.0
    damper_grooves: int = 6
    flywheel_outer_dia: float = 320.0
    flywheel_thk: float = 28.0
    flywheel_clutch_dia: float = 240.0
    ring_gear_teeth: int = 120
    flywheel_tooth_detail: Literal["preview", "exact"] = "preview"

    plug_thread_dia: float = 14.0
    plug_reach: float = 19.0
    plug_hex_across: float = 16.0


@dataclass(frozen=True)
class CrankStations:
    snout_start: float
    main_start: tuple[float, ...]
    pin_start: tuple[float, ...]
    pin_center: tuple[float, ...]
    web_start: tuple[float, ...]
    flange_start: float
    total_len: float
    main_center: tuple[float, ...]


@dataclass(frozen=True)
class BankLayout:
    side: Literal["L", "R"]
    deck_angle: float
    x_shift: float


@dataclass(frozen=True)
class PartSpec:
    name: str
    shape: Shape
    color: str
    alpha: float = 1.0


default_params = Params()
PIN_PHASE = (0.0, 90.0, 270.0, 180.0)


def deg_to_rad(deg: float) -> float:
    return deg * pi / 180.0


def cosd(deg: float) -> float:
    return cos(deg_to_rad(deg))


def sind(deg: float) -> float:
    return sin(deg_to_rad(deg))


def bank_layouts(p: Params) -> tuple[BankLayout, BankLayout]:
    half_angle = p.bank_angle / 2.0
    return (
        BankLayout("L", 90.0 + half_angle, 0.0),
        BankLayout("R", 90.0 - half_angle, p.bore_pitch * 0.147),
    )


def crank_stations(p: Params) -> CrankStations:
    x = 0.0
    snout_start = x
    x += p.snout_len

    main_start: list[float] = []
    pin_start: list[float] = []
    pin_center: list[float] = []
    web_start: list[float] = []

    for i in range(p.bores + 1):
        main_start.append(x)
        x += p.main_journal_len
        if i < p.bores:
            web_start.append(x)
            x += p.web_thickness
            pin_start.append(x)
            pin_center.append(x + p.crankpin_len / 2.0)
            x += p.crankpin_len
            web_start.append(x)
            x += p.web_thickness

    flange_start = x
    x += p.flange_thk

    return CrankStations(
        snout_start=snout_start,
        main_start=tuple(main_start),
        pin_start=tuple(pin_start),
        pin_center=tuple(pin_center),
        web_start=tuple(web_start),
        flange_start=flange_start,
        total_len=x,
        main_center=tuple(start + p.main_journal_len / 2.0 for start in main_start),
    )


def make_part(name: str, shape: Shape, color: str, alpha: float = 1.0) -> PartSpec:
    shape.label = name
    return PartSpec(name=name, shape=shape, color=color, alpha=alpha)


def box(minimum: Point3, maximum: Point3) -> Solid:
    return Solid.make_box(
        maximum[0] - minimum[0],
        maximum[1] - minimum[1],
        maximum[2] - minimum[2],
        Plane(minimum),
    )


def cylinder(radius: float, height: float, start: Point3, direction: Point3) -> Solid:
    return Solid.make_cylinder(radius, height, Plane(origin=start, z_dir=direction))


def _axis(name: Literal["X", "Y", "Z"]) -> Axis:
    if name == "X":
        return Axis((0, 0, 0), (1, 0, 0))
    if name == "Y":
        return Axis((0, 0, 0), (0, 1, 0))
    return Axis((0, 0, 0), (0, 0, 1))


def _point_on_plane(point: Point2, plane: PlaneName, origin: float | Point3 | None = None) -> Point3:
    if isinstance(origin, tuple):
        ox, oy, oz = origin
    else:
        ox = oy = oz = 0.0
        if origin is not None:
            if plane == "XY":
                oz = origin
            elif plane == "YZ":
                ox = origin
            else:
                oy = origin

    if plane == "XY":
        return (ox + point[0], oy + point[1], oz)
    if plane == "YZ":
        return (ox, oy + point[0], oz + point[1])
    return (ox + point[0], oy, oz + point[1])


def profile_wire_from_points(
    points: list[Point2] | tuple[Point2, ...],
    plane: PlaneName,
    origin: float | Point3 | None = None,
) -> Wire:
    return Wire.make_polygon((_point_on_plane(point, plane, origin) for point in points), close=True)


def profile_wire_from_curve_path(
    start: Point2,
    segments: list[CurveSegment] | tuple[CurveSegment, ...],
    plane: PlaneName,
    origin: float | Point3 | None = None,
) -> Wire:
    start3 = _point_on_plane(start, plane, origin)
    current = start3
    edges: list[Edge] = []

    for segment in segments:
        if segment[0] == "line":
            end3 = _point_on_plane(segment[1], plane, origin)
            edges.append(Edge.make_line(current, end3))
            current = end3
            continue

        end3 = _point_on_plane(segment[1], plane, origin)
        via3 = _point_on_plane(segment[2], plane, origin)
        edges.append(Edge.make_three_point_arc(current, via3, end3))
        current = end3

    if (Vector(current) - Vector(start3)).length > 1e-7:
        edges.append(Edge.make_line(current, start3))

    return Wire(edges, sequenced=True)


def circle_wire(
    radius: float,
    plane: PlaneName,
    origin: float | Point3 | None = None,
    center: Point2 = (0.0, 0.0),
) -> Wire:
    center3 = _point_on_plane(center, plane, origin)
    if plane == "XY":
        circle_plane = Plane(origin=center3, z_dir=(0, 0, 1))
    elif plane == "YZ":
        circle_plane = Plane(origin=center3, z_dir=(1, 0, 0))
    else:
        circle_plane = Plane(origin=center3, z_dir=(0, 1, 0))
    return Wire.make_circle(radius, circle_plane)


def rectangle_wire(
    minimum: Point2,
    maximum: Point2,
    plane: PlaneName,
    origin: float | Point3 | None = None,
) -> Wire:
    return profile_wire_from_points(
        (
            (minimum[0], minimum[1]),
            (maximum[0], minimum[1]),
            (maximum[0], maximum[1]),
            (minimum[0], maximum[1]),
        ),
        plane,
        origin,
    )


def extrude_direction(plane: PlaneName, height: float) -> Point3:
    if plane == "XY":
        return (0, 0, height)
    if plane == "YZ":
        return (height, 0, 0)
    return (0, height, 0)


def compound_extrude(outer: Wire, holes: list[Wire] | tuple[Wire, ...], plane: PlaneName, height: float) -> Solid:
    return Solid.extrude(Face(outer, holes), extrude_direction(plane, height))


def revolved_x(points: list[Point2] | tuple[Point2, ...]) -> Solid:
    return Solid.revolve(Face(profile_wire_from_points(points, "XZ")), 360, _axis("X"))


def revolved_z_from_curve_path(start: Point2, segments: list[CurveSegment] | tuple[CurveSegment, ...]) -> Solid:
    return Solid.revolve(Face(profile_wire_from_curve_path(start, segments, "XZ")), 360, _axis("Z"))


def tube_x(outer_radius: float, inner_radius: float, length: float) -> Solid:
    return revolved_x(((0, inner_radius), (0, outer_radius), (length, outer_radius), (length, inner_radius)))


def tube_z(outer_radius: float, inner_radius: float, z_start: float, z_end: float) -> Solid:
    return Solid.revolve(
        Face(
            profile_wire_from_points(
                (
                    (inner_radius, z_start),
                    (outer_radius, z_start),
                    (outer_radius, z_end),
                    (inner_radius, z_end),
                ),
                "XZ",
            )
        ),
        360,
        _axis("Z"),
    )


def capsule_wire(
    first_center: Point2,
    first_radius: float,
    second_center: Point2,
    second_radius: float,
    plane: PlaneName,
    origin: float | Point3 | None = None,
) -> Wire:
    dx = second_center[0] - first_center[0]
    dy = second_center[1] - first_center[1]
    distance = hypot(dx, dy)
    if distance <= abs(first_radius - second_radius):
        raise ValueError("A two-circle capsule requires neither circle to fully contain the other.")

    ux = dx / distance
    uy = dy / distance
    radius_delta = (first_radius - second_radius) / distance
    side = sqrt(max(0.0, 1.0 - radius_delta * radius_delta))
    normals = (
        (ux * radius_delta - uy * side, uy * radius_delta + ux * side),
        (ux * radius_delta + uy * side, uy * radius_delta - ux * side),
    )
    first_a = (first_center[0] + normals[0][0] * first_radius, first_center[1] + normals[0][1] * first_radius)
    second_a = (second_center[0] + normals[0][0] * second_radius, second_center[1] + normals[0][1] * second_radius)
    first_b = (first_center[0] + normals[1][0] * first_radius, first_center[1] + normals[1][1] * first_radius)
    second_b = (second_center[0] + normals[1][0] * second_radius, second_center[1] + normals[1][1] * second_radius)
    second_outer = (second_center[0] + ux * second_radius, second_center[1] + uy * second_radius)
    first_outer = (first_center[0] - ux * first_radius, first_center[1] - uy * first_radius)

    return profile_wire_from_curve_path(
        first_a,
        (
            ("line", second_a),
            ("arc", second_b, second_outer),
            ("line", first_b),
            ("arc", first_a, first_outer),
        ),
        plane,
        origin,
    )


def capsule_extrude(
    first_center: Point2,
    first_radius: float,
    second_center: Point2,
    second_radius: float,
    plane: PlaneName,
    origin: float | Point3 | None,
    height: float,
) -> Solid:
    return Solid.extrude(
        Face(capsule_wire(first_center, first_radius, second_center, second_radius, plane, origin)),
        extrude_direction(plane, height),
    )


def tube_between(a: Point3, b: Point3, radius: float) -> Solid:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    dz = b[2] - a[2]
    length = hypot(hypot(dx, dy), dz)
    return cylinder(radius, length, a, (dx / length, dy / length, dz / length))


def rectangular_tube_z(x0: float, x1: float, y0: float, y1: float, z0: float, z1: float, wall: float) -> Solid:
    return compound_extrude(
        rectangle_wire((x0, y0), (x1, y1), "XY", z0),
        (rectangle_wire((x0 + wall, y0 + wall), (x1 - wall, y1 - wall), "XY", z0),),
        "XY",
        z1 - z0,
    )


def hex_prism_z(across_flats: float, z_start: float, height: float) -> Solid:
    radius = across_flats / sqrt(3.0)
    points = tuple(
        (radius * cosd(60.0 * index + 30.0), radius * sind(60.0 * index + 30.0))
        for index in range(6)
    )
    return Solid.extrude(Face(profile_wire_from_points(points, "XY", z_start)), (0, 0, height))


def make_web(p: Params, x_start: float, phase_deg: float) -> Solid:
    dir_y = cosd(phase_deg)
    dir_z = sind(phase_deg)
    return capsule_extrude(
        (-p.counterweight_offset * dir_y, -p.counterweight_offset * dir_z),
        p.counterweight_dia / 2.0,
        (p.crank_throw * dir_y, p.crank_throw * dir_z),
        p.web_hub_pin_dia / 2.0,
        "YZ",
        x_start,
        p.web_thickness,
    )


def make_crankshaft(p: Params = default_params) -> Shape:
    st = crank_stations(p)
    crank_parts: list[Shape] = [
        cylinder(p.snout_dia / 2.0, p.snout_len, (st.snout_start, 0, 0), (1, 0, 0)),
    ]

    for i in range(p.bores + 1):
        crank_parts.append(cylinder(p.main_journal_dia / 2.0, p.main_journal_len, (st.main_start[i], 0, 0), (1, 0, 0)))

    for i in range(p.bores):
        phase = PIN_PHASE[i % len(PIN_PHASE)]
        pin_y = p.crank_throw * cosd(phase)
        pin_z = p.crank_throw * sind(phase)

        crank_parts.append(make_web(p, st.web_start[2 * i], phase))
        crank_parts.append(cylinder(p.crankpin_dia / 2.0, p.crankpin_len, (st.pin_start[i], pin_y, pin_z), (1, 0, 0)))
        crank_parts.append(make_web(p, st.web_start[2 * i + 1], phase))

    flange: Shape = cylinder(p.flange_dia / 2.0, p.flange_thk, (st.flange_start, 0, 0), (1, 0, 0))
    flange_cut_tools: list[Shape] = [
        cylinder(11, p.flange_thk + 4, (st.flange_start - 2, 0, 0), (1, 0, 0)),
    ]
    for bolt in range(p.flange_bolts):
        angle = 360.0 / p.flange_bolts * bolt
        flange_cut_tools.append(
            cylinder(
                p.flange_bolt_dia / 2.0,
                p.flange_thk + 4,
                (
                    st.flange_start - 2,
                    (p.flange_bolt_circle / 2.0) * cosd(angle),
                    (p.flange_bolt_circle / 2.0) * sind(angle),
                ),
                (1, 0, 0),
            )
        )
    flange = flange.cut(*flange_cut_tools)
    crank_parts.append(flange)

    first, *remaining = crank_parts
    crank = first.fuse(*remaining)

    oil_gallery_tools: list[Shape] = []
    for i in range(p.bores):
        phase = PIN_PHASE[i % len(PIN_PHASE)]
        pin_y = p.crank_throw * cosd(phase)
        pin_z = p.crank_throw * sind(phase)
        oil_gallery_tools.append(
            cylinder(
                p.oil_gallery_dia / 2.0,
                p.crank_throw + p.crankpin_dia,
                (st.pin_center[i], pin_y / 2.0, pin_z / 2.0),
                (0, pin_y or 1.0, pin_z),
            )
        )

    return crank.cut(*oil_gallery_tools)


def make_block(p: Params = default_params) -> Shape:
    st = crank_stations(p)
    x_front = -10.0
    x_rear = st.total_len + 10.0
    block_len = x_rear - x_front
    case_width = 200.0
    case_top = 30.0
    case_bot = -110.0
    deck = p.deck_height
    half_bank = p.bank_angle / 2.0
    deck_rise = deck * sind(half_bank)
    deck_reach = deck * cosd(half_bank)
    valley_half = 44.0
    deck_shoulder = case_width / 2.0 + 42.0
    deck_outer = deck_reach + 58.0
    deck_top = deck_rise + 28.0
    valley_top = case_top + 38.0

    block = Solid.extrude(
        Face(
            profile_wire_from_points(
                (
                    (-case_width / 2.0, case_bot),
                    (case_width / 2.0, case_bot),
                    (case_width / 2.0, case_top),
                    (deck_shoulder, valley_top),
                    (deck_outer, deck_top),
                    (deck_outer - 52.0, deck_top + 32.0),
                    (valley_half, valley_top + 24.0),
                    (0.0, valley_top + 10.0),
                    (-valley_half, valley_top + 24.0),
                    (-deck_outer + 52.0, deck_top + 32.0),
                    (-deck_outer, deck_top),
                    (-deck_shoulder, valley_top),
                    (-case_width / 2.0, case_top),
                ),
                "YZ",
                x_front,
            )
        ),
        (block_len, 0, 0),
    )

    cut_tools: list[Shape] = []
    for bank in bank_layouts(p):
        ny = cosd(bank.deck_angle)
        nz = sind(bank.deck_angle)
        for bore in range(p.bores):
            x = st.pin_center[bore] + bank.x_shift - 7.0
            cut_tools.append(cylinder(p.bore / 2.0, deck + 30.0, (x, ny * 15.0, nz * 15.0 + 10.0), (0, ny, nz)))

    cut_tools.append(cylinder(p.main_journal_dia / 2.0 + 1.0, block_len + 20.0, (x_front - 10.0, 0, 0), (1, 0, 0)))

    crank_clear_r = p.counterweight_dia / 2.0 + 4.0
    cut_tools.append(
        Solid.extrude(
            Face(
                profile_wire_from_curve_path(
                    (-case_width / 2.0, case_bot - 6.0),
                    (
                        ("line", (case_width / 2.0, case_bot - 6.0)),
                        ("line", (case_width / 2.0, 0.0)),
                        ("line", (crank_clear_r, 0.0)),
                        ("arc", (-crank_clear_r, 0.0), (0.0, -crank_clear_r)),
                        ("line", (-case_width / 2.0, 0.0)),
                    ),
                    "YZ",
                    x_front - 12.0,
                )
            ),
            (block_len + 24.0, 0, 0),
        )
    )
    cut_tools.append(box((x_front + 6.0, -70.0, case_bot - 1.0), (x_rear - 6.0, 70.0, case_bot + 25.0)))

    return block.cut(*cut_tools)


def make_conrod(p: Params = default_params) -> Shape:
    big_r = p.rod_big_end_dia / 2.0
    small_r = p.rod_small_end_dia / 2.0
    boss_w = p.rod_beam_thk + 18.0
    z_boss = (p.rod_beam_thk - boss_w) / 2.0

    rod = box(
        (-p.rod_beam_width / 2.0, 0.0, 0.0),
        (p.rod_beam_width / 2.0, p.rod_length, p.rod_beam_thk),
    ).fuse(
        cylinder(big_r, p.rod_beam_thk, (0, 0, 0), (0, 0, 1)),
        cylinder(small_r, p.rod_beam_thk, (0, p.rod_length, 0), (0, 0, 1)),
    )

    big_boss = tube_z(big_r, p.rod_big_end_bore_dia / 2.0, z_boss, z_boss + boss_w)
    small_boss = tube_z(small_r, p.rod_small_end_bore_dia / 2.0, z_boss, z_boss + boss_w).translate(
        (0, p.rod_length, 0)
    )
    rod = rod.fuse(big_boss, small_boss)

    bolt_tools: list[Shape] = [
        cylinder(p.rod_big_end_bore_dia / 2.0, boss_w + 4.0, (0, 0, z_boss - 2.0), (0, 0, 1)),
        cylinder(p.rod_small_end_bore_dia / 2.0, boss_w + 4.0, (0, p.rod_length, z_boss - 2.0), (0, 0, 1)),
    ]
    return rod.cut(*bolt_tools)


def make_cylinder_head(p: Params = default_params) -> Shape:
    st = crank_stations(p)
    length = st.total_len - p.snout_len - p.flange_thk + 40.0
    width = 150.0
    thickness = p.head_thk
    x0 = st.main_start[0] - 10.0

    head = box((x0, -width / 2.0, 0), (x0 + length, width / 2.0, thickness))
    fuse_parts: list[Shape] = [
        box((x0, -58.0, thickness), (x0 + length, -22.0, thickness + 28.0)),
        box((x0, 22.0, thickness), (x0 + length, 58.0, thickness + 28.0)),
    ]
    cut_tools: list[Shape] = []

    for bore in range(p.bores):
        x = st.pin_center[bore] - 7.0
        fuse_parts.append(tube_z(13.0, p.plug_thread_dia / 2.0, thickness, thickness + 26.0).translate((x, 0, 0)))
        cut_tools.append(cylinder(p.plug_thread_dia / 2.0, thickness + 30.0, (x, 0, -1.0), (0, 0, 1)))
        cut_tools.append(cylinder(p.bore / 2.0 - 4.0, 8.0, (x, 0, -1.0), (0, 0, 1)))
        for valve_y in (-22.0, 22.0):
            cut_tools.append(cylinder(15.0, 6.0, (x, valve_y, -1.0), (0, 0, 1)))

    head = head.fuse(*fuse_parts)
    cut_tools.append(box((x0 + 6.0, -width / 2.0 + 8.0, -0.1), (x0 + length - 6.0, width / 2.0 - 8.0, 10.0)))
    return head.cut(*cut_tools)


def make_damper(p: Params = default_params) -> Shape:
    radius = p.damper_outer_dia / 2.0
    bore_r = p.snout_dia / 2.0
    thickness = p.damper_thk
    groove_pitch = (thickness - 6.0) / p.damper_grooves

    points: list[Point2] = [(0.0, bore_r), (0.0, radius)]
    for groove in range(p.damper_grooves):
        x = 3.0 + groove * groove_pitch
        points.extend(
            (
                (x, radius),
                (x + groove_pitch * 0.24, radius - 5.0),
                (x + groove_pitch * 0.56, radius - 5.0),
                (x + groove_pitch * 0.8, radius),
            )
        )

    points.extend(((thickness, radius), (thickness, bore_r + 13.0), (8.0, bore_r + 13.0), (8.0, bore_r), (0.0, bore_r)))
    return revolved_x(points)


def toothed_ring_profile(p: Params) -> Shape:
    outer_r = p.flywheel_outer_dia / 2.0 + 2.0
    root_r = p.flywheel_outer_dia / 2.0 - 5.0
    inner_r = p.flywheel_outer_dia / 2.0 - 13.0
    points: list[Point2] = []
    for tooth in range(p.ring_gear_teeth):
        a0 = 360.0 / p.ring_gear_teeth * tooth
        points.extend(
            (
                (root_r * cosd(a0), root_r * sind(a0)),
                (
                    outer_r * cosd(a0 + 360.0 / p.ring_gear_teeth / 2.0),
                    outer_r * sind(a0 + 360.0 / p.ring_gear_teeth / 2.0),
                ),
            )
        )

    return compound_extrude(profile_wire_from_points(points, "YZ", 0.0), (circle_wire(inner_r, "YZ", 0.0),), "YZ", 12.0)


def make_flywheel(p: Params = default_params) -> Shape:
    radius = p.flywheel_outer_dia / 2.0
    thickness = p.flywheel_thk
    bore_r = 18.0
    hub_r = p.flange_bolt_circle / 2.0 + 14.0
    clutch_r = p.flywheel_clutch_dia / 2.0

    flywheel: Shape = revolved_x(
        (
            (0.0, bore_r),
            (0.0, radius - 10.0),
            (8.0, radius - 10.0),
            (8.0, radius),
            (thickness, radius),
            (thickness, clutch_r),
            (thickness - 6.0, clutch_r),
            (thickness - 6.0, hub_r),
            (thickness, hub_r),
            (thickness, bore_r),
        )
    )

    if p.flywheel_tooth_detail == "exact":
        flywheel = flywheel.fuse(toothed_ring_profile(p))

    cut_tools: list[Shape] = []
    for bolt in range(p.flange_bolts):
        angle = 360.0 / p.flange_bolts * bolt
        cut_tools.append(
            cylinder(
                p.flange_bolt_dia / 2.0,
                thickness + 4.0,
                (-2.0, (p.flange_bolt_circle / 2.0) * cosd(angle), (p.flange_bolt_circle / 2.0) * sind(angle)),
                (1, 0, 0),
            )
        )

    return flywheel.cut(*cut_tools)


def make_intake_parts(p: Params = default_params) -> list[PartSpec]:
    st = crank_stations(p)
    plenum_r = p.plenum_dia / 2.0
    x0 = st.main_start[0]
    length = st.total_len - p.snout_len - p.flange_thk
    half_bank = p.bank_angle / 2.0
    plenum_z = p.deck_height * sind(half_bank) + 40.0
    parts = [
        make_part("Intake Plenum", cylinder(plenum_r, length, (x0, 0, plenum_z), (1, 0, 0)), "#7a2d2d", 0.9),
        make_part("Throttle Body", cylinder(p.throttle_dia / 2.0, 40.0, (x0 - 40.0, 0, plenum_z), (1, 0, 0)), "#7a2d2d", 0.9),
    ]

    for side in (-1.0, 1.0):
        for bore in range(p.bores):
            x = st.pin_center[bore] - 7.0
            port_y = side * (p.deck_height * cosd(half_bank) * 0.35 + 25.0)
            port_z = plenum_z - 60.0
            start = (x, side * plenum_r, plenum_z)
            mid = (x, port_y * 0.7, plenum_z - 20.0)
            end = (x, port_y, port_z)
            runner_name = f"Intake Runner {'L' if side < 0 else 'R'}{bore + 1}"
            parts.append(make_part(f"{runner_name} Upper", tube_between(start, mid, p.runner_dia / 2.0), "#7a2d2d", 0.9))
            parts.append(make_part(f"{runner_name} Lower", tube_between(mid, end, p.runner_dia / 2.0), "#7a2d2d", 0.9))

    return parts


def make_oil_pan(p: Params = default_params) -> Shape:
    st = crank_stations(p)
    x0 = -6.0
    x1 = st.total_len + 6.0
    rail_top = -100.0
    rail_width = 184.0
    wall = 4.0
    sump_x0 = st.total_len * 0.4
    sump_depth = 62.0

    pan = rectangular_tube_z(x0, x1, -rail_width / 2.0, rail_width / 2.0, rail_top - 10.0, rail_top, wall)
    shell_parts: list[Shape] = [
        rectangular_tube_z(sump_x0, sump_x0 + 200.0, -78.0, 78.0, rail_top - sump_depth, rail_top, wall),
        box((sump_x0, -78.0, rail_top - sump_depth), (sump_x0 + 200.0, 78.0, rail_top - sump_depth + wall)),
    ]
    return pan.fuse(*shell_parts)


def piston_profile(p: Params) -> tuple[Point2, tuple[CurveSegment, ...]]:
    radius = p.crown_dia / 2.0
    top = p.piston_comp_height
    bottom = -p.piston_skirt_len
    groove_depth = p.ring_groove_depth
    groove_width = p.ring_groove_width
    first_groove_z = top - 5.0
    grooves = [first_groove_z - index * (groove_width + 3.0) for index in (2, 1, 0)]

    start = (0.0, bottom)
    segments: list[CurveSegment] = [
        ("line", (radius * 0.92, bottom)),
        ("line", (radius, bottom + 4.0)),
    ]

    for groove_z in grooves:
        segments.extend(
            (
                ("line", (radius, groove_z)),
                ("line", (radius - groove_depth, groove_z + 0.15)),
                ("line", (radius - groove_depth, groove_z + groove_width - 0.15)),
                ("line", (radius, groove_z + groove_width)),
            )
        )

    segments.extend(
        (
            ("line", (radius, top)),
            ("arc", (0.0, top + p.dome_rise), (radius / 2.0, top + p.dome_rise * 0.75)),
        )
    )
    return start, tuple(segments)


def make_piston(p: Params = default_params) -> Shape:
    start, segments = piston_profile(p)
    piston = revolved_z_from_curve_path(start, segments)
    pin_bore = cylinder(p.pin_bore_dia / 2.0, p.crown_dia + 8.0, (-p.crown_dia / 2.0 - 4.0, 0, 0), (1, 0, 0))
    return piston.cut(pin_bore)


def make_spark_plug(p: Params = default_params) -> Shape:
    thread_r = p.plug_thread_dia / 2.0
    hex_z0 = p.plug_reach
    hex_z1 = hex_z0 + 14.0
    ceramic_z1 = hex_z1 + 22.0
    terminal_z1 = ceramic_z1 + 16.0
    plug = revolved_z_from_curve_path(
        (0.0, -3.5),
        (
            ("line", (1.2, -3.5)),
            ("line", (1.2, 0.0)),
            ("line", (thread_r, 0.0)),
            ("line", (thread_r, hex_z0)),
            ("line", (6.2, hex_z0)),
            ("line", (6.2, hex_z1)),
            ("line", (5.0, hex_z1)),
            ("line", (5.0, ceramic_z1)),
            ("line", (3.0, ceramic_z1)),
            ("line", (3.0, terminal_z1)),
            ("line", (0.0, terminal_z1)),
        ),
    )
    return plug.fuse(hex_prism_z(p.plug_hex_across, hex_z0, 14.0))


def make_valve_cover(p: Params = default_params) -> Shape:
    st = crank_stations(p)
    length = st.total_len - p.snout_len - p.flange_thk + 30.0
    width = 110.0
    height = p.valve_cover_height
    x0 = st.main_start[0] - 5.0
    wall = 4.0

    cover = box((x0 - 6.0, -width / 2.0 - 6.0, 0), (x0 + length + 6.0, width / 2.0 + 6.0, 6.0))
    parts: list[Shape] = [
        rectangular_tube_z(x0, x0 + length, -width / 2.0, width / 2.0, 6.0, height, wall),
        box((x0, -width / 2.0, height - wall), (x0 + length, width / 2.0, height)),
        box((x0 - 4.0, -width / 2.0 - 4.0, 4.0), (x0 + length + 4.0, width / 2.0 + 4.0, 12.0)),
    ]

    for rib in range(p.bores):
        x = x0 + (length * (rib + 0.5)) / p.bores
        parts.append(box((x - 3.0, -width / 2.0 + wall, height - wall), (x + 3.0, width / 2.0 - wall, height + 4.0)))

    parts.append(tube_z(16.0, 11.0, height, height + 18.0).translate((x0 + 30.0, 0, 0)))
    return cover.fuse(*parts)


def make_wrist_pin(p: Params = default_params) -> Shape:
    return tube_x(p.wrist_pin_outer_dia / 2.0, p.wrist_pin_inner_dia / 2.0, p.wrist_pin_len).translate(
        (-p.wrist_pin_len / 2.0, 0, 0)
    )


def make_engine(p: Params = default_params) -> list[PartSpec]:
    st = crank_stations(p)
    banks = bank_layouts(p)
    parts: list[PartSpec] = [
        make_part("Crankshaft", make_crankshaft(p), "#c3c3cc"),
        make_part("Block", make_block(p), "#5f6168", 0.55),
        make_part("Harmonic Damper", make_damper(p).translate((st.snout_start - p.damper_thk, 0, 0)), "#2b2b2e"),
        make_part("Flywheel", make_flywheel(p).translate((st.flange_start + p.flange_thk, 0, 0)), "#9a9aa2"),
        make_part("Oil Pan", make_oil_pan(p), "#3a3a40"),
        *make_intake_parts(p),
    ]

    piston_prototype = make_piston(p)
    pin_prototype = make_wrist_pin(p)
    rod_prototype = make_conrod(p)
    plug_prototype = make_spark_plug(p)
    head_prototype = make_cylinder_head(p)
    cover_prototype = make_valve_cover(p)

    rod_length = p.rod_length
    base_z = 10.0
    cylinder_index = 0

    for bank in banks:
        ny = cosd(bank.deck_angle)
        nz = sind(bank.deck_angle)
        for bore in range(p.bores):
            x = st.pin_center[bore] + bank.x_shift - 7.0
            phase = PIN_PHASE[bore % len(PIN_PHASE)]
            crank_y = p.crank_throw * cosd(phase)
            crank_z = p.crank_throw * sind(phase)
            a = crank_y
            b = crank_z - base_z
            k = ny * a + nz * b
            slider = k + sqrt(max(0.0, k * k - (a * a + b * b - rod_length * rod_length)))
            pin_y = slider * ny
            pin_z = base_z + slider * nz
            phi_deg = 180.0 / pi * atan2(pin_z - crank_z, pin_y - crank_y)

            parts.append(
                make_part(
                    f"Piston {cylinder_index + 1}",
                    piston_prototype.rotate(_axis("X"), bank.deck_angle - 90.0).translate((x, pin_y, pin_z)),
                    "#d9d9de",
                )
            )
            parts.append(
                make_part(
                    f"Wrist Pin {cylinder_index + 1}",
                    pin_prototype.translate((x, pin_y, pin_z)),
                    "#8f8f97",
                )
            )
            parts.append(
                make_part(
                    f"Con Rod {cylinder_index + 1}",
                    rod_prototype.rotate(_axis("Y"), 90.0).rotate(_axis("X"), phi_deg).translate((x, crank_y, crank_z)),
                    "#b0b0b8",
                )
            )
            parts.append(
                make_part(
                    f"Spark Plug {cylinder_index + 1}",
                    plug_prototype.rotate(_axis("X"), bank.deck_angle - 90.0).translate(
                        (x, ny * p.deck_height, base_z + nz * p.deck_height)
                    ),
                    "#cfcf66",
                )
            )
            cylinder_index += 1

    for bank in banks:
        parts.append(
            make_part(
                f"Cylinder Head {bank.side}",
                head_prototype.rotate(_axis("X"), bank.deck_angle - 90.0).translate(
                    (0, cosd(bank.deck_angle) * p.deck_height, sind(bank.deck_angle) * p.deck_height + 10.0)
                ),
                "#55575d",
            )
        )
        parts.append(
            make_part(
                f"Valve Cover {bank.side}",
                cover_prototype.rotate(_axis("X"), bank.deck_angle - 90.0).translate(
                    (
                        0,
                        cosd(bank.deck_angle) * (p.deck_height + p.head_thk),
                        sind(bank.deck_angle) * (p.deck_height + p.head_thk) + 10.0,
                    )
                ),
                "#43444a",
            )
        )

    return parts


def main(p: Params = default_params) -> list[PartSpec]:
    return make_engine(p)


if __name__ == "__main__":
    model = main()
    print(f"build123d V8 parts={len(model)}")
