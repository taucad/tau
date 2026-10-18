# smlibpy — viewer

1 top-level symbols. Signatures are verbatim python.

# Category: viewer
# Show shapes (parts, sketches, faces, edges, wires, meshes, lists) in a 3D viewer
# Remarks: In Jupyter the viewer is displayed inline; elsewhere an HTML file is written (to ``path`` or a temporary file) and opened in the default browser. Returns the path, or the IPython display object in a notebook.
# smlibpy.viewer.show (function)
show(*shapes: Any, title: str = 'smlibpy', path: str | None = None, open_browser: bool = True, tolerance: float | None = None, angle: float = 12.0, edges: bool = True) -> Any
