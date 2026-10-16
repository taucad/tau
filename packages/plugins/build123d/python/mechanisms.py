"""Project native Build123D joints into portable intent and Tau's playback profile.

Native shapes and joints remain primary. motion(model) supplies only metadata
that native Build123D does not retain: coupling, grounding and clips. Playback values
are deltas from the exported pose. Ball values are the final composed intrinsic XYZ
chart that native Build123D range-checks, not the pre-reference input angles.
"""
from __future__ import annotations

import copy
import math
from typing import Any
from urllib.parse import quote

import numpy as np
from build123d import BallJoint, CylindricalJoint, Joint, LinearJoint, Location, RevoluteJoint, RigidJoint, Rotation

_KINDS = {RigidJoint: "fixed", RevoluteJoint: "revolute", LinearJoint: "prismatic", CylindricalJoint: "cylindrical", BallJoint: "spherical"}
_C = np.array([[1., 0., 0., 0.], [0., 0., 1., 0.], [0., -1., 0., 0.], [0., 0., 0., 1.]])


def _matrix(location: Any) -> np.ndarray:
    transform = location.wrapped.Transformation()
    result = np.eye(4)
    for row in range(3):
        for column in range(4):
            result[row, column] = transform.Value(row + 1, column + 1)
    return result


def _wire(matrix: np.ndarray) -> list[float]:
    result = _C @ matrix @ _C.T
    result[:3, 3] *= 0.001
    return result.T.reshape(-1).tolist()


def _frame(matrix: np.ndarray) -> list[float]:
    # Attachment axes remain the joint coordinate axes; only the containing
    # component basis changes from CAD Z-up to glTF Y-up.
    result = _C @ matrix
    result[:3, 3] *= 0.001
    return result.T.reshape(-1).tolist()


def _point(vector: Any) -> list[float]:
    return (_C[:3, :3] @ np.asarray(vector) * 0.001).tolist()


def _axis(vector: Any) -> list[float]:
    return (_C[:3, :3] @ np.asarray(vector)).tolist()


def _range(bounds: Any, reference: float = 0., scale: float = 1.) -> dict[str, float]:
    lower, upper = bounds
    if math.isnan(lower) or math.isnan(upper) or lower > upper or lower == math.inf or upper == -math.inf:
        raise ValueError("Joint bounds require lower <= upper, a finite admissible coordinate, and cannot contain NaN")
    return {key: (value - reference) * scale for key, value in (("lower", lower), ("upper", upper)) if math.isfinite(value)}


def _local(joint: Any) -> np.ndarray:
    if hasattr(joint, "relative_location"):
        return _matrix(joint.relative_location)
    return _matrix(joint.relative_axis.location)


def _interface(joint: Any) -> dict[str, Any]:
    kind = _KINDS.get(type(joint))
    if kind is None:
        raise ValueError(f"Unsupported native joint class {type(joint).__name__}")
    result: dict[str, Any] = {"kind": kind, "frame": _frame(_local(joint))}
    ranges: dict[str, Any] = {}
    if isinstance(joint, BallJoint):
        result["chart"] = "intrinsic-xyz"
        reference = _matrix(joint.angle_reference.location)
        reference[:3, 3] *= 0.001
        result["referenceFrame"] = reference.T.reshape(-1).tolist()
        ranges = {axis: _range(bounds) for axis, bounds in zip("xyz", joint.angular_range, strict=True)}
    else:
        if hasattr(joint, "angular_range"):
            ranges["angle"] = _range(joint.angular_range)
        if hasattr(joint, "linear_range"):
            ranges["distance"] = _range(joint.linear_range, scale=0.001)
        if hasattr(joint, "angle_reference"):
            result["angleReference"] = _axis(tuple(joint.angle_reference))
    if ranges:
        result["ranges"] = ranges
    return result


def _walk(shapes: tuple[Any, ...]) -> list[tuple[Any, str]]:
    result: list[tuple[Any, str]] = []
    seen: set[int] = set()
    def visit(shape: Any, path: str) -> None:
        if id(shape) in seen:
            raise ValueError("The same native shape occurs twice; copy it before placing another occurrence")
        seen.add(id(shape))
        result.append((shape, path))
        for index, child in enumerate(shape.children):
            visit(child, f"{path}/{index}")
    for index, shape in enumerate(shapes):
        visit(shape, str(index))
    return result


def _reference(source: Any, target: Any) -> tuple[Any, dict[str, Any]]:
    """Read native retained state; never call relative_to on the author's objects."""
    moving = target if isinstance(source, RigidJoint) else source
    if isinstance(moving, BallJoint):
        # Build123D retains no angles on BallJoint. Recover the final chart from
        # the two assembled owner frames, exactly the chart native range-checks.
        relative = np.linalg.inv(_matrix(moving.parent.global_location)) @ _matrix((source if moving is target else target).parent.global_location)
        if moving is target:
            relative = np.linalg.inv(np.linalg.inv(_matrix(source.parent.global_location)) @ _matrix(target.parent.global_location))
        other = source if moving is target else target
        rotation = np.linalg.inv(_local(moving)) @ relative @ _local(other)
        from OCP.gp import gp_Trsf
        transform = gp_Trsf()
        transform.SetValues(*rotation[:3, :].reshape(-1).tolist())
        angles = tuple(Location(transform).orientation)
        if not np.allclose(rotation[:3, 3], 0., atol=1e-7):
            raise ValueError("Connected ball attachment positions no longer coincide in the final assembly")
        return moving, {"angles": angles}
    state: dict[str, Any] = {}
    if isinstance(moving, RevoluteJoint):
        angle = moving._angle
        if angle is None:
            raise ValueError("A connected revolute joint has no retained coordinate")
        state["angle"] = angle
    if isinstance(moving, (LinearJoint, CylindricalJoint)):
        state["position"] = moving.position
        if state["position"] is None:
            raise ValueError("A connected linear joint has no retained coordinate")
        if isinstance(moving, CylindricalJoint) or isinstance(target, RevoluteJoint):
            state["angle"] = moving.angle
    return moving, state


def _relative(source: Any, target: Any, state: dict[str, Any]) -> np.ndarray:
    return _matrix(copy.copy(source).relative_to(copy.copy(target), **state))


def _motion_joints(source: Any, target: Any, parent: str, child: str, key: str) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, float], dict[str, str]]:
    """Lower one physical pair to exact baked-frame delta joints."""
    moving, state = _reference(source, target)
    owner = _matrix(source.parent.global_location)
    common = {"parent": parent, "child": child, "name": source.label}
    reference: dict[str, float] = {}
    coordinate_ids: dict[str, str] = {}
    if isinstance(source, RigidJoint) and isinstance(target, RigidJoint):
        if not np.allclose(_relative(source, target, {}), np.linalg.inv(owner) @ _matrix(target.parent.global_location), atol=1e-7):
            raise ValueError("Native fixed connection no longer matches final occurrence placement")
        return [(key, {**common, "type": "fixed", "origin": _point((owner @ _local(source))[:3, 3])})], reference, coordinate_ids
    if isinstance(moving, BallJoint):
        angles = state["angles"]
        reference = dict(zip("xyz", angles, strict=True))
        frame = _matrix(moving.parent.global_location) @ _local(moving)
        basis = frame[:3, :3]
        rx = _matrix(Rotation(angles[0], 0, 0))[:3, :3]
        ry = _matrix(Rotation(0, angles[1], 0))[:3, :3]
        axes = [basis[:, 0], (basis @ rx)[:, 1], (basis @ rx @ ry)[:, 2]]
        order = list(range(3))
        sign = 1
        if moving is target:
            # Inverse motion is the reversed ordered product of inverse factors.
            order.reverse()
            sign = -1
        result = []
        previous = parent
        for index, axis_index in enumerate(order):
            axis_name = "xyz"[axis_index]
            joint_key = f"{key}/{axis_name}"
            next_link = child if index == 2 else f"virtual:{quote(key, safe='')}/{index}"
            bounds = _range(moving.angular_range[axis_index], angles[axis_index])
            result.append((joint_key, {"type": "revolute", "parent": previous, "child": next_link, "name": f"{moving.label} / {axis_name.upper()} (composed)", "origin": _point(frame[:3, 3]), "axis": _axis(axes[axis_index] * sign), **({"limits": bounds} if bounds else {})}))
            coordinate_ids[axis_name] = joint_key
            previous = next_link
        return result, reference, coordinate_ids
    for coordinate, value in state.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f"Native {coordinate} must be finite")
    base = _relative(source, target, state)
    actual = np.linalg.inv(owner) @ _matrix(target.parent.global_location)
    if not np.allclose(base, actual, atol=1e-7):
        raise ValueError("Native connection no longer matches final occurrence placement; connect final instances after placement")
    # Test native matrix differences, rather than reconstructing angle-reference
    # implementation details. This is done once at export, never during playback.
    origin = (owner @ _local(source))[:3, 3]
    joints = []
    for coordinate, suffix, kind, scale in (("position", "distance", "prismatic", 0.001), ("angle", "angle", "revolute", 1.)):
        if coordinate not in state:
            continue
        value = state[coordinate]
        bounds_owner = target if coordinate == "angle" and isinstance(target, RevoluteJoint) and isinstance(source, LinearJoint) else moving
        bounds = bounds_owner.angular_range if coordinate == "angle" else bounds_owner.linear_range
        # Derivative comes from unrestricted COPIES: native limits must not prevent
        # probing at a boundary, and author state is never mutated.
        a, b = copy.copy(source), copy.copy(target)
        for joint in (a, b):
            if hasattr(joint, "angular_range"):
                joint.angular_range = (-math.inf, math.inf)
            if hasattr(joint, "linear_range"):
                joint.linear_range = (-math.inf, math.inf)
        delta_state = {**state, coordinate: value + (90. if coordinate == "angle" else 1.)}
        delta = owner @ _relative(a, b, delta_state) @ np.linalg.inv(base) @ np.linalg.inv(owner)
        if coordinate == "angle":
            rotation = delta[:3, :3]
            axis = np.array([rotation[2, 1] - rotation[1, 2], rotation[0, 2] - rotation[2, 0], rotation[1, 0] - rotation[0, 1]]) / 2
            axis /= np.linalg.norm(axis)
            # Solve (I-R)o=t with the point nearest the source attachment.
            origin = origin + np.linalg.lstsq(np.eye(3) - rotation, delta[:3, 3] - (np.eye(3) - rotation) @ origin, rcond=None)[0]
        else:
            axis = delta[:3, 3]
            axis /= np.linalg.norm(axis)
        joint_key = key if len(state) == 1 else f"{key}/{suffix}"
        limit = _range(bounds, value, scale)
        joints.append((joint_key, {**common, "type": kind, "origin": _point(origin), "axis": _axis(axis), **({"limits": limit} if limit else {})}))
        reference[suffix] = value * scale
        coordinate_ids[suffix] = joint_key
    if len(joints) == 2:
        virtual = f"virtual:{quote(key, safe='')}/0"
        joints[0][1]["child"] = virtual
        joints[1][1]["parent"] = virtual
    return joints, reference, coordinate_ids


def project_mechanism(shapes: tuple[Any, ...], components: list[dict[str, Any]], supplement: dict[str, Any] | None = None, *, meshes: dict[str, Any] | None = None) -> dict[str, Any]:
    """Project final occurrences and native connections without mutating native shapes.

    Native connected_to is discovered automatically. Explicit endpoint pairs can
    replace that list when its single-last-edge state cannot describe a model.
    Unsupported mechanical graphs keep their intent with explicit diagnostics.
    """
    supplement = {} if supplement is None else supplement
    if not isinstance(supplement, dict):
        raise ValueError("motion(model) must return a dictionary")
    allowed = {"ground", "occurrence_ids", "connections", "couplings", "animations"}
    if set(supplement) - allowed:
        raise ValueError(f"Unknown motion fields: {sorted(set(supplement) - allowed)}")
    occurrences = _walk(shapes)
    if len(occurrences) != len(components):
        raise ValueError("Topology and mechanism occurrence traversals disagree")
    by_object = {id(shape): component for (shape, _), component in zip(occurrences, components, strict=True)}
    explicit: dict[int, str] = {}
    for key, shape in supplement.get("occurrence_ids", {}).items():
        if not isinstance(key, str) or not key or key == "__proto__" or id(shape) not in by_object or id(shape) in explicit:
            raise ValueError("occurrence_ids requires unique nonempty strings mapped to distinct returned occurrences")
        explicit[id(shape)] = f"occurrence:{quote(key, safe='')}"
    rename = {component["id"]: explicit.get(id(shape), f"occurrence:path/{path}") for (shape, path), component in zip(occurrences, components, strict=True)}
    for (shape, _), component in zip(occurrences, components, strict=True):
        component["id"] = rename[component["id"]]
        if "parentId" in component:
            component["parentId"] = rename[component["parentId"]]
        if "childIds" in component:
            component["childIds"] = [rename[key] for key in component["childIds"]]
        component["placement"] = _wire(_matrix(shape.global_location))
        interfaces = {}
        for name, joint in shape.joints.items():
            if joint.parent is not shape:
                raise ValueError(f"Joint {name!r} belongs to a different occurrence; expose descendants through ordinary Python properties")
            interfaces[name] = _interface(joint)
        if interfaces:
            component["jointInterfaces"] = interfaces
    if meshes is not None:
        remapped = {rename[key]: value for key, value in meshes.items()}
        meshes.clear()
        meshes.update(remapped)
    def endpoint(joint: Any) -> None:
        if not isinstance(joint, Joint):
            raise ValueError("A connection endpoint must be a native Build123D joint")
        if id(joint.parent) not in by_object:
            raise ValueError("A connection endpoint is outside the returned occurrences; connect the final instances")
        if joint.parent.joints.get(joint.label) is not joint:
            raise ValueError("A connection endpoint was replaced or removed from its native owner")

    def pair_key(value: Any) -> tuple[int, int]:
        if not isinstance(value, (tuple, list)) or len(value) != 2:
            raise ValueError("A connection must be a pair of native joints")
        source, target = value
        endpoint(source)
        endpoint(target)
        if source.parent is target.parent:
            raise ValueError("A connection must join distinct native occurrences")
        return tuple(sorted((id(source), id(target))))

    pairs = []
    seen_pairs: set[tuple[int, int]] = set()
    # Explicit metadata is authoritative, never silently unioned with stale native
    # last-edge pointers. Otherwise recover the exact native retained pairs.
    declared = supplement.get("connections")
    if declared is not None and not isinstance(declared, (tuple, list)):
        raise ValueError("connections must be a sequence of native joint pairs")
    candidates = declared if declared is not None else [(joint, joint.connected_to) for shape, _ in occurrences for joint in shape.joints.values() if joint.connected_to is not None]
    for value in candidates:
        state = None
        if isinstance(value, dict):
            if not {"source", "target"} <= set(value) or set(value) - {"source", "target", "angle", "position", "angles"}:
                raise ValueError("An explicit connection record requires source, target and native angle, position or angles")
            source, target = value["source"], value["target"]
            state = {key: item for key, item in value.items() if key not in ("source", "target")}
        else:
            pair_key(value)
            source, target = value
        key = pair_key((source, target))
        if key in seen_pairs and declared is not None:
            raise ValueError("Explicit connections cannot repeat a native endpoint pair")
        if key not in seen_pairs:
            pairs.append((source, target, state))
            seen_pairs.add(key)
    if not pairs:
        if any(supplement.get(field) for field in ("couplings", "animations")):
            raise ValueError("Motion declarations require connected native joints")
        return {}
    diagnostics = []
    intent: dict[str, Any] = {"schemaVersion": 1, "units": {"length": "m", "angle": "deg"}, "connections": []}
    links: dict[str, Any] = {}
    joints: dict[str, Any] = {}
    pair_coordinates: dict[tuple[int, int], tuple[dict[str, str], dict[str, float]]] = {}
    joint_pairs: dict[int, list[tuple[int, int]]] = {}
    parents: dict[str, str] = {}
    owner_ids = {id(joint.parent) for source, target, _ in pairs for joint in (source, target)}
    for source, target, state in pairs:
        parent = by_object[id(source.parent)]["id"]
        child = by_object[id(target.parent)]["id"]
        key = f"{parent}/joint/{quote(source.label, safe='')}/{child}/{quote(target.label, safe='')}"
        connection: dict[str, Any] = {"id": key, "parent": {"componentId": parent, "interfaceId": source.label}, "child": {"componentId": child, "interfaceId": target.label}}
        intent["connections"].append(connection)
        projected_source, projected_target = source, target
        if state is not None:
            projected_source, projected_target = copy.copy(source), copy.copy(target)
            for field, value in state.items():
                values = tuple(value.orientation) if isinstance(value, Rotation) else value if field == "angles" and isinstance(value, tuple) else (value,)
                if any(isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number) for number in values):
                    raise ValueError("Explicit native coordinates must be finite numbers")
            try:
                declared_relative = _matrix(projected_source.relative_to(projected_target, **state))
            except (ValueError, TypeError) as error:
                raise ValueError(f"Invalid explicit native connection coordinates: {error}") from error
            actual_relative = np.linalg.inv(_matrix(source.parent.global_location)) @ _matrix(target.parent.global_location)
            if not np.allclose(declared_relative, actual_relative, atol=1e-7):
                raise ValueError("Explicit native connection coordinates do not match final occurrence placement")
        try:
            lowered, reference, ids = _motion_joints(projected_source, projected_target, parent, child, key)
            connection["referenceCoordinates"] = reference
            connection["coordinateChart"] = "intrinsic-xyz" if any(isinstance(j, BallJoint) for j in (source, target)) else "axis"
            connection["playbackCoordinates"] = ids
            joints.update(lowered)
            identity = pair_key((source, target))
            pair_coordinates[identity] = ids, reference
            for endpoint_joint in (source, target):
                joint_pairs.setdefault(id(endpoint_joint), []).append(identity)
            parents[child] = parent
            for _, joint in lowered:
                links.setdefault(joint["parent"], {"components": []})
                links.setdefault(joint["child"], {"components": []})
        except (ValueError, TypeError, AttributeError) as error:
            diagnostics.append({"code": "UNSUPPORTED_MECHANISM", "path": f"/mechanismIntent/connections/{len(intent['connections']) - 1}", "message": str(error), "recovery": "Inspect the retained connection intent and author a supported native joint tree for playback."})
    # Containment supplies rigid placement for a body mounted on a native assembly;
    # it never joins sibling bodies or guesses a connection from coincident frames.
    for shape, _ in occurrences:
        component = by_object[id(shape)]
        owner = shape
        while id(owner) not in owner_ids and owner.parent is not None and id(owner.parent) in by_object:
            owner = owner.parent
        body_id = by_object[id(owner)]["id"]
        if id(owner) in owner_ids and not shape.children:
            links.setdefault(body_id, {"components": []})["components"].append(component["id"])
    physical_ids = {component["id"] for component in components}
    roots = [key for key in links if key not in parents and key in physical_ids]
    ground = supplement.get("ground")
    root = by_object.get(id(ground), {}).get("id") if ground is not None else (roots[0] if len(roots) == 1 else None)
    if root is not None:
        intent["ground"] = root
    if root is not None and root in links:
        # Ground is assembly intent, independent of which endpoint called connect_to.
        # Reversing an ordered joint chain reverses its factors and negates each
        # axis, preserving the native coordinate and its travel bounds.
        adjacency = {key: [] for key in links}
        for key, joint in joints.items():
            adjacency[joint["parent"]].append((key, joint["child"]))
            adjacency[joint["child"]].append((key, joint["parent"]))
        reached = {root}
        queue = [root]
        for current in queue:
            for key, child in adjacency[current]:
                if child in reached:
                    continue
                reached.add(child)
                queue.append(child)
                joint = joints[key]
                if joint["parent"] != current:
                    joint["parent"], joint["child"] = current, child
                    if "axis" in joint:
                        joint["axis"] = [-value for value in joint["axis"]]
        if len(joints) != len(links) - 1 or reached != set(links):
            diagnostics.append({"code": "UNSUPPORTED_MECHANISM", "path": "/mechanismIntent/connections", "message": "A closed or disconnected mechanical graph cannot be evaluated by the tree playback profile.", "recovery": "Inspect the retained intent; provide an acyclic connected tree for playback."})
    if root is None or root not in links:
        diagnostics.append({"code": "UNSUPPORTED_MECHANISM", "path": "/mechanismIntent/ground", "message": "The retained graph needs one unambiguous root; ground must name that native occurrence.", "recovery": "Connect all moving bodies to a single ground, preserving assembly mounts."})
    def dof(value: Any) -> tuple[str, float, float]:
        if not isinstance(value, tuple) or len(value) != 2 or value[1] not in ("angle", "distance", "x", "y", "z"):
            raise ValueError("A coordinate reference must be (native_joint, coordinate_name) or ((source, target), coordinate_name)")
        reference, coordinate = value
        if isinstance(reference, Joint):
            endpoint(reference)
            candidates = joint_pairs.get(id(reference), [])
            if len(candidates) != 1:
                raise ValueError("A motion joint reference must name exactly one exported connection; use an explicit endpoint pair for ambiguity")
            identity = candidates[0]
        else:
            identity = pair_key(reference)
        resolved = pair_coordinates.get(identity)
        if resolved is None or coordinate not in resolved[0]:
            raise ValueError("A motion reference must name an exported native connection coordinate")
        ids, references = resolved
        scale = .001 if coordinate == "distance" else 1.
        return ids[coordinate], references[coordinate], scale
    couplings = []
    for entry in supplement.get("couplings", []):
        if not isinstance(entry, dict) or set(entry) - {"driver", "follower", "ratio", "offset"} or not {"driver", "follower", "ratio"} <= set(entry):
            raise ValueError("A coupling requires driver, follower, ratio and optional offset")
        ratio, phase = entry["ratio"], entry.get("offset", 0.)
        if any(isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) for value in (ratio, phase)):
            raise ValueError("Coupling ratio and offset must be finite numbers")
        driver, qd, sd = dof(entry["driver"])
        follower, qf, sf = dof(entry["follower"])
        offset = ratio * qd * sf / sd + phase * sf - qf
        if not math.isclose(offset, 0., abs_tol=1e-8 * sf):
            raise ValueError("Coupling phase does not match the authored reference pose")
        couplings.append({"driver": driver, "follower": follower, "ratio": ratio * sf / sd})
    animations = []
    for entry in supplement.get("animations", []):
        frames = []
        for frame in entry["keyframes"]:
            coordinates = {}
            for key, value in frame["coordinates"].items():
                coordinate, reference, scale = dof(key)
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError("Animation coordinates must be finite native values")
                coordinates[coordinate] = value * scale - reference
            frames.append({**frame, "coordinates": coordinates})
        animations.append({**entry, "keyframes": frames})
    if couplings:
        intent["couplings"] = couplings
    if animations:
        intent["animations"] = animations
    assigned = {key for link in links.values() for key in link["components"]}
    unassigned = [component["id"] for component in components if not component.get("childIds") and component["id"] not in assigned]
    if unassigned:
        diagnostics.append({"code": "UNSUPPORTED_MECHANISM", "path": "/mechanismIntent/rigidBodies", "message": "Some geometry has no connected native rigid body.", "recovery": "Group passive geometry under its connected native rigid Compound; product containment cannot choose an articulated base."})
    result: dict[str, Any] = {"mechanismIntent": intent}
    if diagnostics:
        result["mechanismDiagnostics"] = diagnostics
    else:
        result["mechanism"] = {"schemaVersion": 1, "units": intent["units"], "root": root, "links": links, "joints": joints, **({"couplings": couplings} if couplings else {}), **({"animations": animations} if animations else {})}
    component_ids = {component["id"] for component in components}
    intent["rigidBodies"] = {key: list(body["components"]) for key, body in links.items() if key in component_ids}
    return result
