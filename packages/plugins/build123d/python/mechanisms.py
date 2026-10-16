"""Project native Build123D joints into portable intent and Tau's playback profile.

Native shapes and joints remain primary. Tau Assembly retains named occurrences,
connections and authored couplings. motion(model) supplies root ground and clips. Playback values
are deltas from the exported pose. Ball values are the final composed intrinsic XYZ
chart that native Build123D range-checks, not the pre-reference input angles.
"""
from __future__ import annotations

import copy
import math
from typing import Any
from urllib.parse import quote

import numpy as np
from build123d import BallJoint, CylindricalJoint, LinearJoint, Location, RevoluteJoint, RigidJoint, Rotation
from tau_assembly import Assembly, Connection, _coordinate

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
        names = {id(child): quote(name, safe="") for name, child in shape.parts.items()} if isinstance(shape, Assembly) else {}
        if isinstance(shape, Assembly) and {id(child) for child in shape.children} != set(names):
            raise ValueError("Assembly children changed outside its named occurrence mapping")
        for index, child in enumerate(shape.children):
            visit(child, f"{path}/{names.get(id(child), str(index))}")
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


def _motion_joints(source: Any, target: Any, parent: str, child: str, key: str, reference_coordinates: dict[str, float] | None = None) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, float], dict[str, str]]:
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
        if reference_coordinates is not None:
            authored = tuple(reference_coordinates[axis] for axis in "xyz")
            if not np.allclose(_matrix(Rotation(*angles)), _matrix(Rotation(*authored)), atol=1e-7):
                raise ValueError("Native ball connection no longer matches its authored reference pose")
            angles = authored
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
        if not isinstance(value, (int, float)) or not math.isfinite(value):
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

    Assembly owns named occurrences, durable connections and authored couplings.
    Plain native shapes retain structural path identity and connected_to capture.
    Unsupported mechanical graphs keep their intent with explicit diagnostics.
    """
    supplement = {} if supplement is None else supplement
    if not isinstance(supplement, dict):
        raise ValueError("motion(model) must return a dictionary")
    allowed = {"ground", "animations"}
    if set(supplement) - allowed:
        raise ValueError(f"Unknown motion fields: {sorted(set(supplement) - allowed)}")
    occurrences = _walk(shapes)
    if len(occurrences) != len(components):
        raise ValueError("Topology and mechanism occurrence traversals disagree")
    by_object = {id(shape): component for (shape, _), component in zip(occurrences, components, strict=True)}
    prefix = "occurrence:" if any(isinstance(shape, Assembly) for shape, _ in occurrences) else "occurrence:path/"
    rename = {component["id"]: f"{prefix}{path}" for (_, path), component in zip(occurrences, components, strict=True)}
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
                raise ValueError(f"Joint {name!r} belongs to a different occurrence; use Assembly.expose_joint")
            interfaces[name] = _interface(joint)
        if isinstance(shape, Assembly):
            for name, endpoint in shape.interfaces.items():
                joint = endpoint.joint
                if joint.parent.joints.get(joint.label) is not joint:
                    raise ValueError("An exposed native joint was replaced or removed")
                if id(joint.parent) not in by_object or not any(ancestor is shape for ancestor in joint.parent.ancestors):
                    raise ValueError("Exposed joint must still belong to a descendant occurrence")
                component.setdefault("jointInterfaceAliases", {})[name] = {"componentId": rename.get(by_object[id(joint.parent)]["id"], by_object[id(joint.parent)]["id"]), "interfaceId": joint.label}
        if interfaces:
            component["jointInterfaces"] = interfaces
    if meshes is not None:
        remapped = {rename[key]: value for key, value in meshes.items()}
        meshes.clear()
        meshes.update(remapped)
    pairs = []
    handles = [connection for shape, _ in occurrences if isinstance(shape, Assembly) for connection in shape.connections.values()]
    seen_pairs: set[tuple[int, int]] = set()
    for handle in handles:
        source, target = handle.source, handle.target
        for joint, saved in ((source, handle._source_state), (target, handle._target_state)):
            if joint.parent.joints.get(joint.label) is not joint or _interface(joint) != _interface(saved):
                raise ValueError("A connected native joint was replaced, removed or changed after connect")
        if id(source.parent) not in by_object or id(target.parent) not in by_object:
            raise ValueError("A connection endpoint is outside the returned occurrences; connect the final copies")
        pairs.append((*handle._pair(), handle))
        seen_pairs.add(tuple(sorted((id(source), id(target)))))
    for source, target in ((joint, joint.connected_to) for shape, _ in occurrences for joint in shape.joints.values() if joint.connected_to is not None):
        if id(source.parent) not in by_object or id(target.parent) not in by_object:
            raise ValueError("A connection endpoint is outside the returned occurrences; connect the final copies")
        pair = tuple(sorted((id(source), id(target))))
        if pair not in seen_pairs:
            pairs.append((source, target, None))
            seen_pairs.add(pair)
    if not pairs:
        if supplement.get("animations"):
            raise ValueError("Motion declarations require connected native joints")
        return {}
    diagnostics = []
    intent: dict[str, Any] = {"schemaVersion": 1, "units": {"length": "m", "angle": "deg"}, "connections": []}
    links: dict[str, Any] = {}
    joints: dict[str, Any] = {}
    handle_ids: dict[Connection, dict[str, str]] = {}
    references: dict[Connection, dict[str, float]] = {}
    parents: dict[str, str] = {}
    owner_ids = {id(joint.parent) for source, target, _ in pairs for joint in (source, target)}
    for source, target, handle in pairs:
        parent = by_object[id(source.parent)]["id"]
        child = by_object[id(target.parent)]["id"]
        key = f"{parent}/joint/{quote(source.label, safe='')}/{child}/{quote(target.label, safe='')}"
        if handle is not None:
            key = f"{by_object[id(handle.assembly)]['id']}/connection/{quote(handle.name, safe='')}"
        connection: dict[str, Any] = {"id": key, "parent": {"componentId": parent, "interfaceId": source.label}, "child": {"componentId": child, "interfaceId": target.label}}
        intent["connections"].append(connection)
        try:
            lowered, reference, ids = _motion_joints(source, target, parent, child, key, dict(handle.coordinates) if handle is not None else None)
            connection["referenceCoordinates"] = reference
            connection["coordinateChart"] = "intrinsic-xyz" if any(isinstance(j, BallJoint) for j in (source, target)) else "axis"
            connection["playbackCoordinates"] = ids
            joints.update(lowered)
            if handle is not None:
                handle_ids[handle] = ids
                references[handle] = reference
            parents[child] = parent
            for _, joint in lowered:
                links.setdefault(joint["parent"], {"components": []})
                links.setdefault(joint["child"], {"components": []})
        except (ValueError, TypeError, AttributeError) as error:
            if handle is not None:
                reference = {name: value * (.001 if name == "distance" else 1.) for name, value in handle.coordinates.items()}
                ids = {name: key if len(reference) == 1 else f"{key}/{name}" for name in reference}
                connection.update(referenceCoordinates=reference, playbackCoordinates=ids, coordinateChart="intrinsic-xyz" if any(isinstance(j, BallJoint) for j in (source, target)) else "axis")
                handle_ids[handle], references[handle] = ids, reference
            diagnostics.append({"code": "UNSUPPORTED_MECHANISM", "path": f"/mechanismIntent/connections/{len(intent['connections']) - 1}", "message": str(error), "recovery": "Inspect the retained connection intent and author a supported native joint tree for playback."})
    # Product containment cannot choose a rigid body in an articulated module.
    # Explicit local base ownership is independent of native call direction and
    # of whichever public port an enclosing assembly connects. Fixed-only groups
    # are unambiguous because all their bodies have identical playback transforms.
    assembly_bases: dict[int, Any] = {}
    ambiguous_bases: set[int] = set()
    fixed_parents = {key: key for key in links}
    def fixed_root(key: str) -> str:
        while fixed_parents[key] != key:
            key = fixed_parents[key]
        return key
    for joint in joints.values():
        if joint["type"] == "fixed":
            fixed_parents[fixed_root(joint["child"])] = fixed_root(joint["parent"])
    for shape, _ in occurrences:
        if not isinstance(shape, Assembly):
            continue
        if shape.base is not None:
            if id(shape.base) not in by_object or not any(parent is shape for parent in shape.base.ancestors):
                raise ValueError("Assembly base must remain an owned descendant occurrence")
            if id(shape.base) not in owner_ids:
                raise ValueError("Assembly base must participate in its mechanism graph")
            assembly_bases[id(shape)] = shape.base
        else:
            candidates = [body for body, _ in occurrences if id(body) in owner_ids and any(parent is shape for parent in body.ancestors)]
            groups = {fixed_root(by_object[id(body)]["id"]) for body in candidates if by_object[id(body)]["id"] in fixed_parents}
            if len(groups) == 1:
                assembly_bases[id(shape)] = candidates[0]
            elif candidates:
                ambiguous_bases.add(id(shape))
    # Containment supplies rigid placement for a body mounted on a native assembly;
    # it never joins sibling bodies or guesses a connection from coincident frames.
    for shape, _ in occurrences:
        component = by_object[id(shape)]
        owner = shape
        while id(owner) not in owner_ids and owner.parent is not None and id(owner.parent) in by_object:
            owner = owner.parent
            if id(owner) in owner_ids:
                break
            if id(owner) in assembly_bases:
                owner = assembly_bases[id(owner)]
                break
            if id(owner) in ambiguous_bases and not shape.children:
                diagnostics.append({"code": "UNSUPPORTED_MECHANISM", "path": "/mechanismIntent/connections", "message": "An unjointed assembly part has no unambiguous local base body.", "recovery": "Set Assembly(base=...) or group static geometry beneath a connected native Compound; containment does not choose a body."})
                break
        body_id = by_object[id(owner)]["id"]
        if id(owner) in owner_ids and not shape.children:
            links.setdefault(body_id, {"components": []})["components"].append(component["id"])
        if id(shape) in owner_ids and component["id"] not in parents:
            ancestor = shape.parent
            while ancestor is not None and id(ancestor) not in owner_ids:
                ancestor = ancestor.parent
            if ancestor is not None and id(ancestor) in by_object:
                parent_id = by_object[id(ancestor)]["id"]
                joints[f"{component['id']}/mount"] = {"type": "fixed", "parent": parent_id, "child": component["id"], "origin": [0., 0., 0.]}
                parents[component["id"]] = parent_id
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
        handle, coordinate = _coordinate(value)
        ids = handle_ids.get(handle)
        if ids is None or coordinate not in ids:
            raise ValueError("A motion reference must name an exported assembly connection coordinate")
        scale = .001 if coordinate == "distance" else 1.
        return ids[coordinate], references[handle][coordinate], scale
    couplings = []
    for shape, _ in occurrences:
        if isinstance(shape, Assembly):
            for entry in shape._couplings:
                driver, qd, sd = dof(entry.driver)
                follower, qf, sf = dof(entry.follower)
                # Native authored f = ratio*d + offset becomes delta coordinates.
                # Validate again so mutated native poses cannot quietly change phase.
                offset = entry.ratio * qd * sf / sd + entry.offset * sf - qf
                if not math.isclose(offset, 0., abs_tol=1e-8 * sf):
                    raise ValueError("Coupling phase does not match the authored reference pose")
                couplings.append({"driver": driver, "follower": follower, "ratio": entry.ratio * sf / sd})
    animations = []
    for entry in supplement.get("animations", []):
        frames = []
        for frame in entry["keyframes"]:
            coordinates = {}
            for key, value in frame["coordinates"].items():
                coordinate, reference, scale = dof(key)
                if not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError("Animation coordinates must be finite native values")
                coordinates[coordinate] = value * scale - reference
            frames.append({**frame, "coordinates": coordinates})
        animations.append({**entry, "keyframes": frames})
    if couplings:
        intent["couplings"] = couplings
    if animations:
        intent["animations"] = animations
    result: dict[str, Any] = {"mechanismIntent": intent}
    if diagnostics:
        result["mechanismDiagnostics"] = diagnostics
    else:
        # Static leaves remain on the ground and do not create hidden grounds.
        assigned = {key for link in links.values() for key in link["components"]}
        links[root]["components"].extend(component["id"] for component in components if not component.get("childIds") and component["id"] not in assigned)
        result["mechanism"] = {"schemaVersion": 1, "units": intent["units"], "root": root, "links": links, "joints": joints, **({"couplings": couplings} if couplings else {}), **({"animations": animations} if animations else {})}
    component_ids = {component["id"] for component in components}
    intent["rigidBodies"] = {key: list(body["components"]) for key, body in links.items() if key in component_ids}
    return result
