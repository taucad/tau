"""Compile an atopile project and print Tau's board IR as one JSON document on stdout.

Usage: python atopile_worker.py <project-dir> <entry-file>

`<entry-file>` is the `.ato` file Tau evaluates, relative to the project directory. The build whose
`entry` names that file is compiled; a project without `ato.yaml` gets one whose `default` build
enters the file's last module.

The worker runs `ato build --target bom` (the BOM target depends on the full design pipeline:
instantiate, ERC, part picking for non-atomic parts, nets and the KiCad PCB update) and reads the
resulting KiCad PCB and BOM JSON with atopile's own parsers. It never runs `kicad-cli`; Tau renders
the schematic, PCB and 3D views from the IR.
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

IR_VERSION = 1
# Steps that need network access or a desktop KiCad stay out of the build.
BUILD_TARGET = "bom"
MAX_EMBEDDED_MODEL_BYTES = 8 * 1024 * 1024
ANSI = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")


def issue(message: str, severity: str = "error", **details: object) -> dict:
    return {"message": message, "severity": severity, "details": details}


def run_build(project: Path, build: str) -> tuple[bool, str]:
    env = {
        **os.environ,
        "ATO_NON_INTERACTIVE": "1",
        "NO_COLOR": "1",
        "TERM": "dumb",
        "COLUMNS": "200",
    }
    completed = subprocess.run(
        [sys.executable, "-m", "atopile", "build", "--build", build, "--target", BUILD_TARGET, "--verbose"],
        cwd=project,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    return completed.returncode == 0, ANSI.sub("", completed.stdout + completed.stderr)


def build_errors(log: str) -> list[str]:
    """The messages under the build summary's `Errors (n):` heading, one per error."""
    lines = log.splitlines()
    for index, line in enumerate(lines):
        if re.search(r"Errors \(\d+\):", line):
            body: list[str] = []
            for raw in lines[index + 1 :]:
                text = raw.strip().strip("│").strip()
                if text.startswith("Total:") or text.startswith("╰"):
                    break
                body.append(text)
            blocks = [block.strip() for block in "\n".join(body).split("\n\n") if block.strip()]
            return [" ".join(block.split("\n")) for block in blocks]
    return []


def warnings(log: str) -> list[str]:
    return [
        re.sub(r"\s+", " ", line.split(" W ", 1)[1]).strip()
        for line in log.splitlines()
        if re.match(r"^\d\d:\d\d:\d\d\.\d+\s+W\s", line)
    ]


def xyr(value: object) -> tuple[float, float, float]:
    return float(value.x), float(value.y), float(getattr(value, "r", 0) or 0)


def rotate(x: float, y: float, degrees: float) -> tuple[float, float]:
    # KiCad rotates counter-clockwise on screen with Y pointing down.
    radians = math.radians(-degrees)
    return x * math.cos(radians) - y * math.sin(radians), x * math.sin(radians) + y * math.cos(radians)


def drill_diameter(pad: object) -> float | None:
    drill = getattr(pad, "drill", None)
    if drill is None:
        return None
    size = getattr(drill, "size_x", None)
    return float(size) if size is not None else None


def model_entry(model: object, layout_dir: Path) -> dict | None:
    raw = str(model.path)
    resolved = Path(raw.replace("${KIPRJMOD}", str(layout_dir))).resolve()
    entry: dict = {
        "path": raw,
        "offset": [float(model.offset.xyz.x), float(model.offset.xyz.y), float(model.offset.xyz.z)],
        "rotate": [float(model.rotate.xyz.x), float(model.rotate.xyz.y), float(model.rotate.xyz.z)],
        "scale": [float(model.scale.xyz.x), float(model.scale.xyz.y), float(model.scale.xyz.z)],
    }
    if resolved.is_file() and resolved.stat().st_size <= MAX_EMBEDDED_MODEL_BYTES:
        entry["format"] = resolved.suffix.lower().lstrip(".")
        entry["base64"] = base64.b64encode(resolved.read_bytes()).decode("ascii")
    return entry


def board_outline(pcb: object) -> list[list[float]]:
    points: list[list[float]] = []
    for line in pcb.gr_lines:
        if str(line.layer) == "Edge.Cuts":
            points += [[float(line.start.x), float(line.start.y)], [float(line.end.x), float(line.end.y)]]
    for rect in pcb.gr_rects:
        if str(rect.layer) == "Edge.Cuts":
            points += [[float(rect.start.x), float(rect.start.y)], [float(rect.end.x), float(rect.end.y)]]
    for arc in pcb.gr_arcs:
        if str(arc.layer) == "Edge.Cuts":
            for point in (arc.start, arc.mid, arc.end):
                points.append([float(point.x), float(point.y)])
    return points


def read_ir(project: Path, build: str) -> dict:
    from faebryk.libs.kicad.fileformats import kicad

    layout_dir = project / "layout" / build
    pcb_path = layout_dir / f"{build}.kicad_pcb"
    pcb = kicad.loads(kicad.pcb.PcbFile, pcb_path).kicad_pcb

    components = []
    nets: dict[str, list[list[str]]] = {}
    for footprint in pcb.footprints:
        properties = {prop.name: prop.value for prop in footprint.propertys}
        designator = properties.get("Reference", "")
        fx, fy, fr = xyr(footprint.at)
        pads = []
        for pad in footprint.pads:
            px, py, pr = xyr(pad.at)
            # Pad positions are footprint-relative; pad rotation is absolute in KiCad files.
            ox, oy = rotate(px, py, fr)
            net = str(pad.net.name) if pad.net is not None and pad.net.name else None
            pads.append(
                {
                    "name": str(pad.name),
                    "type": str(pad.type),
                    "shape": str(pad.shape),
                    "x": fx + ox,
                    "y": fy + oy,
                    "localX": px,
                    "localY": py,
                    "width": float(pad.size.w),
                    "height": float(pad.size.h if pad.size.h is not None else pad.size.w),
                    "rotation": pr,
                    "drill": drill_diameter(pad),
                    "net": net,
                }
            )
            if net and pad.name:
                nets.setdefault(net, []).append([designator, str(pad.name)])
        components.append(
            {
                "designator": designator,
                "address": properties.get("atopile_address", designator),
                "footprint": str(footprint.name),
                "layer": str(footprint.layer),
                "x": fx,
                "y": fy,
                "rotation": fr,
                "lcsc": properties.get("LCSC"),
                "manufacturer": properties.get("Manufacturer"),
                "mpn": properties.get("Partnumber"),
                "value": properties.get("Value") or None,
                "datasheet": properties.get("Datasheet"),
                "pads": pads,
                "models": [m for m in (model_entry(model, layout_dir) for model in footprint.models) if m],
            }
        )

    bom_path = project / "build" / "builds" / build / f"{build}.bom.json"
    bom = json.loads(bom_path.read_text(encoding="utf-8")) if bom_path.is_file() else {"components": []}

    return {
        "irVersion": IR_VERSION,
        "build": build,
        "outline": board_outline(pcb),
        "components": components,
        "nets": [{"name": name, "pads": pads} for name, pads in sorted(nets.items())],
        "bom": bom.get("components", []),
        "kicadPcb": pcb_path.read_text(encoding="utf-8"),
    }


def select_build(project: Path, entry: str) -> str:
    """The build entering `entry`, writing a minimal `ato.yaml` when the project has none."""
    import yaml

    config_path = project / "ato.yaml"
    if config_path.is_file():
        config = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        builds = config.get("builds") or {}
        for name, build in builds.items():
            if str((build or {}).get("entry", "")).split(":", 1)[0] == entry:
                return str(name)
        if builds:
            return str(next(iter(builds)))
    source = (project / entry).read_text(encoding="utf-8")
    modules = re.findall(r"^(?:module|component)\s+([A-Za-z_][A-Za-z0-9_]*)", source, flags=re.MULTILINE)
    if not modules:
        raise ValueError(f"{entry} declares no module or component to build")
    config_path.write_text(
        "requires-atopile: ^0.15.0\n\npaths:\n  src: ./\n  layout: ./layout\n\n"
        f"builds:\n  default:\n    entry: {entry}:{modules[-1]}\n",
        encoding="utf-8",
    )
    return "default"


def main(argv: list[str]) -> int:
    project = Path(argv[1]).resolve()
    from importlib.metadata import version

    try:
        build = select_build(project, argv[2])
    except (OSError, ValueError) as error:
        json.dump({"ok": False, "atopileVersion": version("atopile"), "issues": [issue(str(error), producer="tau")], "log": ""}, sys.stdout)
        return 0

    ok, log = run_build(project, build)
    result: dict = {"atopileVersion": version("atopile"), "issues": []}
    result["issues"] += [
        issue(message, "warning", producer="atopile")
        for message in warnings(log)
        # KiCad plugin installation is a desktop-editor concern; Tau never opens KiCad.
        if "cli.configure" not in message
    ]
    if not ok:
        errors = build_errors(log) or [log.strip().splitlines()[-1] if log.strip() else "atopile build failed"]
        result["issues"] += [issue(message, producer="atopile") for message in errors]
        result["ok"] = False
        result["log"] = log[-20000:]
    else:
        result["ok"] = True
        result["ir"] = read_ir(project, build)
    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
