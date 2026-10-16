"""Tau's native Compound-compatible assembly authoring extension.

Build123D owns geometry, joint definitions and placement mathematics. Assembly
retains named occurrences, connections and affine motion relationships; it is
provided by Tau, not by the upstream build123d package. Coordinates use native
millimetres/degrees. Ground and animation presentation belong to motion(model).
"""
from __future__ import annotations

import copy
import math
from collections.abc import Mapping
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any

from build123d import BallJoint, Compound, CylindricalJoint, Joint, LinearJoint, Location, RevoluteJoint, RigidJoint, Rotation, Shape


def _name(value: str) -> None:
    if not isinstance(value, str) or not value or value == "__proto__":
        raise ValueError("Assembly names must be nonempty strings other than __proto__")


def _contains(owner: Shape, shape: Shape) -> bool:
    return shape is owner or any(parent is owner for parent in shape.ancestors)


def _refresh(shape: Shape | None) -> None:
    """Rebuild native Compound caches bottom-up without losing their placement."""
    while shape is not None:
        location = shape.location
        shape.children = shape.children
        shape.locate(location)
        shape = shape.parent


def _coordinates(source: Joint, target: Joint) -> dict[str, float]:
    moving = target if isinstance(source, RigidJoint) else source
    if isinstance(moving, BallJoint):
        # Native BallJoint checks this composed chart, not its input Euler angles.
        relative = moving.parent.global_location.inverse() * (source if moving is target else target).parent.global_location
        rotation = moving.relative_location.inverse() * relative * (source if moving is target else target).relative_location
        return dict(zip("xyz", tuple(rotation.orientation), strict=True))
    result = {}
    if isinstance(moving, RevoluteJoint):
        result["angle"] = moving._angle
    if isinstance(moving, (LinearJoint, CylindricalJoint)):
        result["distance"] = moving.position
        if isinstance(moving, CylindricalJoint) or isinstance(target, RevoluteJoint):
            result["angle"] = moving.angle
    return result


@dataclass(frozen=True, eq=False)
class JointInterface:
    """Read-only public endpoint; native joint ownership remains on its part."""
    assembly: Assembly
    joint: Joint


@dataclass(frozen=True, eq=False)
class Connection:
    """One retained native placement operation, independent of connected_to."""
    assembly: Assembly
    name: str
    source: Joint
    target: Joint
    _source_state: Joint
    _target_state: Joint
    _coordinates: dict[str, float]

    @property
    def coordinates(self) -> Mapping[str, float]:
        """Authored reference coordinates in native millimetres/degrees."""
        return MappingProxyType(self._coordinates)

    def _pair(self) -> tuple[Joint, Joint]:
        a, b = copy.copy(self._source_state), copy.copy(self._target_state)
        a.parent, b.parent = self.source.parent, self.target.parent
        return a, b


@dataclass(frozen=True)
class Coupling:
    """Authored affine coordinate relation, before canonical-unit projection."""
    driver: tuple[Connection, str]
    follower: tuple[Connection, str]
    ratio: float
    offset: float


def _coordinate(value: Any) -> tuple[Connection, str]:
    if not isinstance(value, tuple) or len(value) != 2 or not isinstance(value[0], Connection) or not isinstance(value[1], str) or value[1] not in value[0].coordinates or value[0].assembly.connections.get(value[0].name) is not value[0]:
        raise ValueError("A coordinate reference must be (connection, coordinate_name) for an available native coordinate")
    return value


class Assembly(Compound):
    """A native Compound with named parts and an assembly-owned mechanism graph.

    children maps stable occurrence names to distinct native shapes. Native
    .children remains the ordinary tuple; .parts, .connections and .interfaces
    are read-only mappings. copy.copy, copy.deepcopy and moved() create independent
    assemblies whose public endpoints and connection handles bind to their copies.
    """

    def __init__(self, *, children: Mapping[str, Shape], label: str = "", base: Shape | None = None) -> None:
        if not isinstance(children, Mapping):
            raise TypeError("Assembly children must map occurrence names to native shapes")
        for name, child in children.items():
            _name(name)
            if not isinstance(child, Shape) or child.parent is not None:
                raise ValueError("Assembly children must be unparented native shapes; copy an existing occurrence before reuse")
        if len({id(child) for child in children.values()}) != len(children):
            raise ValueError("Assembly children must be distinct native occurrences")
        if base is not None and (not isinstance(base, Shape) or not any(_contains(child, base) for child in children.values())):
            raise ValueError("Assembly base must be an owned descendant occurrence")
        self._base = base
        self._parts = dict(children)
        self._connections: dict[str, Connection] = {}
        self._interfaces: dict[str, JointInterface] = {}
        self._couplings: list[Coupling] = []
        super().__init__(children=list(children.values()), label=label)

    @property
    def base(self) -> Shape | None:
        """Local body for passive descendants, never a global ground declaration."""
        return self._base

    @property
    def parts(self) -> Mapping[str, Shape]:
        """Stable occurrence names; labels remain display-only."""
        return MappingProxyType(self._parts)

    @property
    def connections(self) -> Mapping[str, Connection]:
        """Named durable connections owned by this assembly."""
        return MappingProxyType(self._connections)

    @property
    def interfaces(self) -> Mapping[str, JointInterface]:
        """Public descendant endpoints, separate from native .joints ownership."""
        return MappingProxyType(self._interfaces)

    def expose_joint(self, name: str, joint: Joint | JointInterface) -> JointInterface:
        """Expose a descendant endpoint without copying or reparenting its joint."""
        _name(name)
        native = joint.joint if isinstance(joint, JointInterface) else joint
        if name in self._interfaces:
            raise ValueError(f"Assembly interface {name!r} already exists")
        if not isinstance(native, Joint) or native.parent is self or not _contains(self, native.parent):
            raise ValueError("An exposed joint must belong to a descendant occurrence")
        endpoint = JointInterface(self, native)
        self._interfaces[name] = endpoint
        return endpoint

    def connect(self, name: str, source: Joint | JointInterface, target: Joint | JointInterface, **coordinates: Any) -> Connection:
        """Place the target using native connect_to and retain the connection.

        An exposed target moves its entire owning assembly, preserving internal
        articulation. A raw target moves its native owning shape. Native connect_to
        itself is untouched; temporary joint copies isolate its last-edge state.
        """
        _name(name)
        if name in self._connections:
            raise ValueError(f"Assembly connection {name!r} already exists")
        for endpoint in (source, target):
            if isinstance(endpoint, JointInterface) and (not _contains(self, endpoint.assembly) or not _contains(endpoint.assembly, endpoint.joint.parent)):
                raise ValueError("Exposed connection endpoint no longer belongs to this assembly")
        a = source.joint if isinstance(source, JointInterface) else source
        b = target.joint if isinstance(target, JointInterface) else target
        if not isinstance(a, Joint) or not isinstance(b, Joint) or not _contains(self, a.parent) or not _contains(self, b.parent):
            raise ValueError("Connection endpoints must belong to this assembly's occurrences")
        boundary = target.assembly if isinstance(target, JointInterface) else b.parent
        if boundary is self or _contains(boundary, a.parent):
            raise ValueError("A connection cannot move its own source occurrence")
        allowed = {"angle", "position", "angles"}
        if set(coordinates) - allowed:
            raise ValueError("Native connection coordinates are angle, position or angles")
        for value in coordinates.values():
            values = value if isinstance(value, (tuple, list)) else (value,)
            if not all(isinstance(number, (int, float)) and not isinstance(number, bool) and math.isfinite(number) for number in values):
                raise ValueError("Native connection coordinates must be finite numbers")
        # Native connect_to uses local parent locations. Temporary unparented
        # owners give it global frames when the endpoints have different parents.
        sa, sb = copy.copy(a), copy.copy(b)
        for joint in (sa, sb):
            for field in ("relative_axis", "relative_location", "angle_reference"):
                if hasattr(joint, field):
                    setattr(joint, field, copy.deepcopy(getattr(joint, field)))
        sa.parent, sb.parent = Compound([]), Compound([])
        sa.parent.location, sb.parent.location = a.parent.global_location, b.parent.global_location
        sa.connect_to(sb, **coordinates)
        reference = _coordinates(sa, sb)
        requested = {"distance" if key == "position" else key for key in coordinates}
        if "angles" in requested:
            requested = (requested - {"angles"}) | set("xyz")
        if not requested.issubset(reference):
            raise ValueError("Connection coordinate is not available on this native joint pairing")
        if not all(value is not None and math.isfinite(value) for value in reference.values()):
            raise ValueError("Native connection requires finite reference coordinates; supply an explicit pose")
        delta = sb.parent.global_location * b.parent.global_location.inverse()
        world = delta * boundary.global_location
        parent_world = boundary.parent.global_location if boundary.parent is not None else Location()
        boundary.locate(parent_world.inverse() * world)
        _refresh(boundary.parent)
        sa.parent, sb.parent = a.parent, b.parent
        sa.connected_to = None
        sb.connected_to = None
        connection = Connection(self, name, a, b, sa, sb, reference)
        self._connections[name] = connection
        return connection

    def couple(self, *, driver: tuple[Connection, str], follower: tuple[Connection, str], ratio: float, offset: float = 0.) -> None:
        """Declare follower = ratio * driver + offset in native authored units.

        Angular coordinates are degrees; distance is millimetres. A mixed-unit
        ratio therefore carries the corresponding native unit quotient. The
        exporter converts both the reference and ratio into metres/degrees.
        The as-built pose must already satisfy the relation; this is not a solver.
        """
        driver, follower = _coordinate(driver), _coordinate(follower)
        if not _contains(self, driver[0].assembly) or not _contains(self, follower[0].assembly):
            raise ValueError("Coupling connections must belong to this assembly or a descendant")
        if not isinstance(ratio, (int, float)) or isinstance(ratio, bool) or not math.isfinite(ratio) or ratio == 0 or not isinstance(offset, (int, float)) or isinstance(offset, bool) or not math.isfinite(offset):
            raise ValueError("Coupling ratio must be finite and nonzero; offset must be finite")
        existing = [coupling for shape in (self.root, *self.root.descendants) if isinstance(shape, Assembly) for coupling in shape._couplings]
        if any(item.follower == follower for item in existing):
            raise ValueError("A coordinate cannot have competing coupling drivers")
        edges = {item.follower: item.driver for item in existing}
        cursor = driver
        while cursor in edges:
            cursor = edges[cursor]
            if cursor == follower:
                raise ValueError("Coupling cycle is not supported")
        if cursor == follower:
            raise ValueError("Coupling cycle is not supported")
        expected = ratio * driver[0].coordinates[driver[1]] + offset
        if not math.isclose(expected, follower[0].coordinates[follower[1]], rel_tol=1e-10, abs_tol=1e-8):
            raise ValueError("Coupling phase does not match the authored reference pose")
        self._couplings.append(Coupling(driver, follower, ratio, offset))

    def __copy__(self) -> Assembly:
        return copy.deepcopy(self)

    def __deepcopy__(self, memo: dict[int, Any]) -> Assembly:
        # Never pull the containing product or external connection endpoints into
        # an independently copied subassembly. Internal references share memo.
        if self.parent is not None and id(self.parent) not in memo:
            memo[id(self.parent)] = None
        result = super().__deepcopy__(memo)
        # Native aggregate topology can be stale after child placement/copy.
        # Rebuild once from actual copied children, preserving each local pose.
        for shape in reversed((result, *result.descendants)):
            if shape.children:
                location = shape.location
                shape.children = shape.children
                shape.locate(location)
        return result
