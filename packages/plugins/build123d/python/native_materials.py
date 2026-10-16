"""Project native Build123D surface meshes into Tau's glTF coordinate frame."""

from __future__ import annotations

from typing import Any
from pathlib import Path


def material_dependencies(shapes: tuple[Any, ...], workspace: Path, declared_paths: list[str]) -> list[str]:
    """Validate native texture files against the model's declared closure.

    Bundled material catalogue assets belong to the pinned runtime. Model image
    files must be declared so edits invalidate evaluation and export caches.
    """
    import threejs_materials

    bundled = Path(threejs_materials.__file__).resolve().parent
    workspace = workspace.resolve()
    declared = {(workspace / path).resolve() for path in declared_paths}
    dependencies: set[str] = set()
    pending = list(shapes)
    while pending:
        shape = pending.pop()
        pending.extend(shape.children)
        material = shape.material
        if material is None or material.pbr is None:
            continue
        pbr = material.pbr
        for source in pbr.maps.to_dict().values():
            if source.startswith("data:"):
                continue
            if "://" in source:
                raise ValueError("Material textures must be embedded data or declared project files")
            if pbr.maps_dir is None:
                raise ValueError("File material textures require maps_dir=Path(__file__).parent (or another project directory)")
            path = (Path(pbr.maps_dir) / source).resolve()
            if path.is_relative_to(bundled):
                continue
            if not path.is_relative_to(workspace):
                raise ValueError("Material texture path must stay inside the project")
            relative = path.relative_to(workspace).as_posix()
            if path not in declared:
                raise ValueError(f"Declare material texture '{relative}' in __tau__.dependencies")
            if not path.is_file():
                raise ValueError(f"Material texture does not exist: {relative}")
            dependencies.add(relative)
    return sorted(dependencies)


def tessellate_surface(shape: Any, linear_tolerance: float, angular_tolerance: float, *, pretriangulated: bool = False) -> dict[str, Any]:
    """Use native normals and face-local UVs while retaining exact face ranges.

    The caller supplies detached geometry so meshing cannot mutate a retained BRep.
    Each face maps independently to [0, 1]; a whole-part atlas would lose the
    public face-range provenance needed by topology selection.
    """
    positions: list[float] = []
    normals: list[float] = []
    uvs: list[float] = []
    indices: list[int] = []
    face_groups: list[dict[str, int]] = []
    for face_id, face in enumerate(shape.faces(), 1):
        tolerance = linear_tolerance
        if pretriangulated:
            # Native mesh() checks the stored achieved deflection, which can be
            # slightly above its requested value. Admit that existing absolute
            # triangulation for extraction; never let UV extraction remesh in
            # Build123D's relative mode after the triangle budget was checked.
            from OCP.BRep import BRep_Tool
            from OCP.TopLoc import TopLoc_Location
            mesh = BRep_Tool.Triangulation_s(face.wrapped, TopLoc_Location())
            tolerance = max(tolerance, mesh.Deflection()) * (1 + 1e-12)
        vertices, triangles, native_normals, native_uvs = face.tessellate_with_uvs(
            tolerance, angular_tolerance, atlas_packing=False
        )
        offset = len(positions) // 3
        start = len(indices)
        for vertex in vertices:
            positions.extend((vertex.X / 1000, vertex.Z / 1000, -vertex.Y / 1000))
        for normal in native_normals:
            normals.extend((normal.X, normal.Z, -normal.Y))
        for uv in native_uvs:
            uvs.extend(uv)
        for triangle in triangles:
            indices.extend(index + offset for index in triangle)
        face_groups.append({"start": start, "count": len(indices) - start, "faceId": face_id})
    return {"positions": positions, "normals": normals, "uvs": uvs, "indices": indices, "faceGroups": face_groups}
