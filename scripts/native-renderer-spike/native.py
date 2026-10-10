"""Native wgpu scene consumer. Run with SPIKE_URL/SPIKE_TOKEN, optionally --window.

The restricted unlit profile is a performance witness, not a general glTF renderer.
Unsupported assets fail explicitly so the host can retain Three.js fallback.
"""

import argparse
import hashlib
import json
import math
import os
import resource
import struct
import sys
import time
import urllib.request
from urllib.parse import urlparse

import numpy as np
import wgpu

MAX_BYTES = 64 * 1024 * 1024


class Client:
    def __init__(self):
        self.url = os.environ["SPIKE_URL"]
        parsed = urlparse(self.url)
        if (
            parsed.scheme != "http"
            or parsed.hostname != "127.0.0.1"
            or parsed.path
            or parsed.username
        ):
            raise ValueError("Only an explicit loopback host is admitted")
        self.token = os.environ["SPIKE_TOKEN"]
        self.transferred = 0

    def request(self, path, value=None):
        data = None if value is None else json.dumps(value).encode()
        req = urllib.request.Request(
            self.url + path,
            data=data,
            method="GET" if value is None else "PATCH",
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": "application/json",
            },
        )

        # Disable redirects: never forward a capability to a different destination.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args):
                raise ValueError("Redirect refused")

        with urllib.request.build_opener(NoRedirect).open(req, timeout=5) as response:
            value = response.read(MAX_BYTES + 1)
            if len(value) > MAX_BYTES:
                raise ValueError("Response budget")
            return value

    def scene(self):
        result = json.loads(self.request("/scene"))
        if result["version"] != 1 or result["profile"] != "opaque-unlit-triangles-v1":
            raise ValueError("Unsupported scene profile")
        return result

    def asset(self, descriptor):
        digest = descriptor["digest"]
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("Invalid digest")
        data = self.request("/assets/" + digest)
        if (
            len(data) != descriptor["bytes"]
            or hashlib.sha256(data).hexdigest() != digest
        ):
            raise ValueError("Asset integrity failure")
        self.transferred += len(data)
        if self.transferred > MAX_BYTES:
            raise ValueError("Closure budget")
        return data


def decode(data, dependencies):
    if len(data) < 20 or struct.unpack_from("<III", data) != (0x46546C67, 2, len(data)):
        raise ValueError("Invalid GLB")
    size, kind = struct.unpack_from("<II", data, 12)
    if (
        kind != 0x4E4F534A
        or size % 4
        or size > 2 * 1024 * 1024
        or size + 20 > len(data)
    ):
        raise ValueError("Invalid JSON chunk")
    doc = json.loads(data[20 : 20 + size])
    offset = size + 20
    binary = b""
    if offset < len(data):
        length, kind = struct.unpack_from("<II", data, offset)
        if kind != 0x004E4942 or offset + 8 + length != len(data):
            raise ValueError("Invalid BIN chunk")
        binary = data[offset + 8 :]
    if doc.get("asset", {}).get("version") != "2.0":
        raise ValueError("Invalid glTF version")
    if (
        (set(doc.get("extensionsUsed", [])) | set(doc.get("extensionsRequired", [])))
        - {"KHR_materials_unlit"}
        or doc.get("skins")
        or doc.get("animations")
        or doc.get("textures")
    ):
        raise ValueError("Unsupported native profile; use Three.js")
    buffers = [
        dependencies[b["uri"]] if "uri" in b else binary for b in doc.get("buffers", [])
    ]
    for desc, buf in zip(doc.get("buffers", []), buffers):
        if desc["byteLength"] > len(buf):
            raise ValueError("Truncated buffer")

    def at(items, index):
        if type(index) is not int or index < 0 or index >= len(items):
            raise ValueError("Invalid glTF index")
        return items[index]

    def accessor(index, position=False):
        a = at(doc["accessors"], index)
        components = 3 if position else 1
        dtype = (
            "<f4"
            if position
            else {5121: "u1", 5123: "<u2", 5125: "<u4"}.get(a["componentType"])
        )
        if (
            not dtype
            or a.get("sparse")
            or a.get("normalized")
            or a["type"] != ("VEC3" if position else "SCALAR")
            or (position and a["componentType"] != 5126)
        ):
            raise ValueError("Unsupported accessor")
        view = at(doc["bufferViews"], a["bufferView"])
        count = a["count"]
        if not isinstance(count, int) or count < 0 or count > MAX_BYTES // 28:
            raise ValueError("Vertex budget")
        item = np.dtype(dtype).itemsize
        stride = view.get("byteStride", item * components)
        start = view.get("byteOffset", 0) + a.get("byteOffset", 0)
        end = start + max(0, count - 1) * stride + (components * item if count else 0)
        if (
            start < 0
            or stride < item * components
            or end > view.get("byteOffset", 0) + view["byteLength"]
            or end > len(at(buffers, view["buffer"]))
        ):
            raise ValueError("Accessor bounds")
        result = np.ndarray(
            (count, components),
            dtype=dtype,
            buffer=at(buffers, view["buffer"]),
            offset=start,
            strides=(stride, item),
        ).copy()
        if not np.isfinite(result).all():
            raise ValueError("Nonfinite geometry")
        return result

    vertices, ranges, visited = [], [], set()
    total = 0

    def node(index, parent, depth=0):
        nonlocal total
        if depth > 128 or index in visited or len(visited) > 100000:
            raise ValueError("Invalid node graph")
        visited.add(index)
        n = at(doc["nodes"], index)
        if n.get("skin") is not None or n.get("weights") or n.get("extensions"):
            raise ValueError("Unsupported node")
        if "matrix" in n:
            if any(key in n for key in ("rotation", "translation", "scale")):
                raise ValueError("Conflicting node transform")
            local = np.array(n["matrix"], dtype=np.float32).reshape((4, 4), order="F")
        else:
            x, y, z, w = n.get("rotation", [0, 0, 0, 1])
            if abs(x * x + y * y + z * z + w * w - 1) > 1e-4:
                raise ValueError("Invalid rotation")
            local = np.array(
                [
                    [
                        1 - 2 * (y * y + z * z),
                        2 * (x * y - z * w),
                        2 * (x * z + y * w),
                        0,
                    ],
                    [
                        2 * (x * y + z * w),
                        1 - 2 * (x * x + z * z),
                        2 * (y * z - x * w),
                        0,
                    ],
                    [
                        2 * (x * z - y * w),
                        2 * (y * z + x * w),
                        1 - 2 * (x * x + y * y),
                        0,
                    ],
                    [0, 0, 0, 1],
                ],
                dtype=np.float32,
            )
            local[:3, :3] *= np.array(n.get("scale", [1, 1, 1]))
            local[:3, 3] = n.get("translation", [0, 0, 0])
        transform = parent @ local
        if (
            not np.isfinite(transform).all()
            or not np.allclose(transform[3], [0, 0, 0, 1])
            or np.linalg.det(transform[:3, :3]) <= 0
        ):
            raise ValueError("Unsupported nonpositive/nonaffine transform")
        if "mesh" in n:
            for primitive in at(doc["meshes"], n["mesh"])["primitives"]:
                if (
                    primitive.get("mode", 4) != 4
                    or primitive.get("targets")
                    or primitive.get("extensions")
                ):
                    raise ValueError("Unsupported primitive")
                material = at(doc["materials"], primitive["material"])
                if (
                    "KHR_materials_unlit" not in material.get("extensions", {})
                    or material.get("alphaMode", "OPAQUE") != "OPAQUE"
                    or material.get("doubleSided", False)
                ):
                    raise ValueError("Unsupported material; Three.js fallback required")
                if set(primitive["attributes"]) - {"POSITION", "NORMAL"}:
                    raise ValueError("Unsupported vertex attributes")
                color = material.get("pbrMetallicRoughness", {}).get(
                    "baseColorFactor", [1, 1, 1, 1]
                )
                if (
                    len(color) != 4
                    or color[3] != 1
                    or not all(0 <= c <= 1 for c in color)
                ):
                    raise ValueError("Unsupported color")
                if any(
                    k.endswith("Texture")
                    for k in material.get("pbrMetallicRoughness", {})
                ):
                    raise ValueError("Unsupported texture")
                positions = accessor(primitive["attributes"]["POSITION"], True)
                if "indices" in primitive:
                    indices = accessor(primitive["indices"]).ravel()
                    if len(indices) and indices.max() >= len(positions):
                        raise ValueError("Index bounds")
                    positions = positions[indices]
                if len(positions) % 3:
                    raise ValueError("Triangle count")
                total += len(positions)
                if total * 28 > MAX_BYTES:
                    raise ValueError("Decoded budget")
                transformed = positions @ transform[:3, :3].T + transform[:3, 3]
                packed = np.column_stack(
                    (transformed, np.tile(color, (len(positions), 1)))
                ).astype(np.float32)
                ranges.append((total - len(positions), len(positions)))
                vertices.append(packed)
        for child in n.get("children", []):
            node(child, transform, depth + 1)

    for root in at(doc["scenes"], doc.get("scene", 0))["nodes"]:
        node(root, np.eye(4, dtype=np.float32))
    if not vertices:
        raise ValueError("Empty scene has no visibility witness")
    return np.concatenate(vertices), ranges


def camera(angle, aspect=640 / 480):
    eye = np.array([24 * math.sin(angle), 10, 24 * math.cos(angle)], dtype=np.float32)
    z = eye / np.linalg.norm(eye)
    x = np.cross([0, 1, 0], z)
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    view = np.eye(4, dtype=np.float32)
    view[:3, :3] = [x, y, z]
    view[:3, 3] = -view[:3, :3] @ eye
    f = 1 / math.tan(math.pi / 8)
    near, far = 0.1, 100
    projection = np.array(
        [
            [f / aspect, 0, 0, 0],
            [0, f, 0, 0],
            [0, 0, far / (near - far), far * near / (near - far)],
            [0, 0, -1, 0],
        ],
        dtype=np.float32,
    )
    return projection @ view


SHADER = """
struct View { matrix: mat4x4<f32>, intensity: vec4<f32> };
@group(0) @binding(0) var<uniform> view: View;
struct Vertex { @builtin(position) position: vec4<f32>, @location(0) color: vec4<f32> };
@vertex fn vs(@location(0) position: vec3<f32>, @location(1) color: vec4<f32>) -> Vertex {
 var result: Vertex; result.position=view.matrix*vec4<f32>(position,1.0);result.color=color;return result;
}
@fragment fn fs(in: Vertex) -> @location(0) vec4<f32> { return vec4<f32>(in.color.rgb*view.intensity.x,1.0); }
"""


class Renderer:
    def __init__(self, vertices, ranges, canvas=None):
        setup_started = time.perf_counter()
        self.adapter = wgpu.gpu.request_adapter_sync(
            power_preference="high-performance", canvas=canvas
        )
        self.device = self.adapter.request_device_sync()
        self.device_ms = (time.perf_counter() - setup_started) * 1000
        self.context = canvas.get_wgpu_context() if canvas else None
        self.format = (
            self.context.get_preferred_format(self.adapter)
            if canvas
            else "rgba8unorm-srgb"
        )
        if self.context:
            if not self.format.endswith("-srgb"):
                self.format += "-srgb"
            self.context.configure(device=self.device, format=self.format)
        d = self.device
        upload_started = time.perf_counter()
        self.buffer = d.create_buffer_with_data(
            data=vertices, usage=wgpu.BufferUsage.VERTEX
        )
        d.queue.on_submitted_work_done_sync()
        self.upload_ms = (time.perf_counter() - upload_started) * 1000
        self.uniform = d.create_buffer(
            size=80, usage=wgpu.BufferUsage.UNIFORM | wgpu.BufferUsage.COPY_DST
        )
        shader = d.create_shader_module(code=SHADER)
        self.pipeline = d.create_render_pipeline(
            layout="auto",
            vertex={
                "module": shader,
                "entry_point": "vs",
                "buffers": [
                    {
                        "array_stride": 28,
                        "step_mode": "vertex",
                        "attributes": [
                            {"format": "float32x3", "offset": 0, "shader_location": 0},
                            {"format": "float32x4", "offset": 12, "shader_location": 1},
                        ],
                    }
                ],
            },
            fragment={
                "module": shader,
                "entry_point": "fs",
                "targets": [{"format": self.format}],
            },
            primitive={"topology": "triangle-list", "cull_mode": "back"},
            depth_stencil={
                "format": "depth24plus",
                "depth_write_enabled": True,
                "depth_compare": "less",
            },
            multisample={"count": 4},
        )
        self.bind = d.create_bind_group(
            layout=self.pipeline.get_bind_group_layout(0),
            entries=[
                {
                    "binding": 0,
                    "resource": {"buffer": self.uniform, "offset": 0, "size": 80},
                }
            ],
        )
        self.target = d.create_texture(
            size=(640, 480, 1),
            format=self.format,
            usage=wgpu.TextureUsage.RENDER_ATTACHMENT | wgpu.TextureUsage.COPY_SRC,
        )
        self.msaa = d.create_texture(
            size=(640, 480, 1),
            format=self.format,
            sample_count=4,
            usage=wgpu.TextureUsage.RENDER_ATTACHMENT,
        )
        self.depth = d.create_texture(
            size=(640, 480, 1),
            format="depth24plus",
            sample_count=4,
            usage=wgpu.TextureUsage.RENDER_ATTACHMENT,
        )
        self.ranges = ranges
        self.count = len(vertices)
        self.frames = 0
        self.size = (640, 480)

    def resize(self, size):
        if size == self.size or min(size) < 1:
            return
        if max(size) > 4096:
            raise ValueError("Window extent budget")
        for value in [self.target, self.msaa, self.depth]:
            value.destroy()
        self.size = size
        self.target = self.device.create_texture(
            size=(*size, 1),
            format=self.format,
            usage=wgpu.TextureUsage.RENDER_ATTACHMENT | wgpu.TextureUsage.COPY_SRC,
        )
        self.msaa = self.device.create_texture(
            size=(*size, 1),
            format=self.format,
            sample_count=4,
            usage=wgpu.TextureUsage.RENDER_ATTACHMENT,
        )
        self.depth = self.device.create_texture(
            size=(*size, 1),
            format="depth24plus",
            sample_count=4,
            usage=wgpu.TextureUsage.RENDER_ATTACHMENT,
        )

    def draw(self, angle, intensity=1, split=False, sync=True):
        uniform = np.concatenate(
            (
                camera(angle, self.size[0] / self.size[1]).flatten(order="F"),
                [intensity, 0, 0, 0],
            )
        ).astype(np.float32)
        self.device.queue.write_buffer(self.uniform, 0, uniform)
        encoder = self.device.create_command_encoder()
        target = self.context.get_current_texture() if self.context else self.target
        render = encoder.begin_render_pass(
            color_attachments=[
                {
                    "view": self.msaa.create_view(),
                    "resolve_target": target.create_view(),
                    "clear_value": (0.01444384, 0.01444384, 0.01444384, 1),
                    "load_op": "clear",
                    "store_op": "discard",
                }
            ],
            depth_stencil_attachment={
                "view": self.depth.create_view(),
                "depth_clear_value": 1,
                "depth_load_op": "clear",
                "depth_store_op": "discard",
            },
        )
        render.set_pipeline(self.pipeline)
        render.set_bind_group(0, self.bind)
        render.set_vertex_buffer(0, self.buffer)
        if split:
            for start in range(0, self.count, 36):
                render.draw(min(36, self.count - start), 1, start, 0)
        else:
            render.draw(self.count)
        render.end()
        self.device.queue.submit([encoder.finish()])
        if sync:
            self.device.queue.on_submitted_work_done_sync()
        self.frames += 1

    def pixels(self):
        return np.frombuffer(
            self.device.queue.read_texture(
                {"texture": self.target},
                {"offset": 0, "bytes_per_row": 640 * 4, "rows_per_image": 480},
                (640, 480, 1),
            ),
            dtype=np.uint8,
        ).reshape(480, 640, 4)

    def close(self):
        for value in [self.buffer, self.uniform, self.target, self.msaa, self.depth]:
            value.destroy()
        self.device.destroy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--window", action="store_true")
    parser.add_argument("--frames", type=int, default=120)
    parser.add_argument("--output")
    parser.add_argument("--split", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.frames <= 10000:
        raise ValueError("Invalid frame count")
    started = time.perf_counter()
    client = Client()
    state = client.scene()
    t = time.perf_counter()
    data = client.asset(state["asset"])
    dependencies = {
        uri: client.asset(desc) for uri, desc in state["asset"]["dependencies"].items()
    }
    transfer = (time.perf_counter() - t) * 1000
    t = time.perf_counter()
    vertices, ranges = decode(data, dependencies)
    decode_ms = (time.perf_counter() - t) * 1000
    canvas = None
    if args.window:
        from rendercanvas.glfw import RenderCanvas, loop

        canvas = RenderCanvas(
            size=(640, 480),
            title="Tau native wgpu checkpoint",
            update_mode="ondemand",
            min_fps=0,
            max_fps=120,
        )
    t = time.perf_counter()
    renderer = Renderer(vertices, ranges, canvas)
    setup = (time.perf_counter() - t) * 1000
    if args.window:

        def draw():
            renderer.resize(canvas.get_physical_size())
            renderer.draw(
                state["view"]["angle"], state["view"]["intensity"], sync=False
            )

        previous_x = None

        def pointer(event):
            nonlocal previous_x
            current_x = event.get("x")
            if (
                event.get("buttons")
                and previous_x is not None
                and current_x is not None
            ):
                state["view"]["angle"] += (current_x - previous_x) * 0.01
                canvas.request_draw()
            previous_x = current_x

        canvas.add_event_handler(pointer, "pointer_move")
        canvas.request_draw(draw)
        print(
            json.dumps(
                {
                    "mode": "native-window",
                    "adapter": dict(renderer.adapter.info),
                    "qualification": "window presentation requires visual hardware verification",
                }
            )
        )
        try:
            loop.run()
        finally:
            renderer.close()
        return
    try:
        t = time.perf_counter()
        renderer.draw(state["view"]["angle"], state["view"]["intensity"], args.split)
        first_draw = (time.perf_counter() - t) * 1000
        pixels = renderer.pixels()
        mask = np.max(pixels[:, :, :3], axis=2) - np.min(pixels[:, :, :3], axis=2) > 20
        if not 10000 < int(mask.sum()) < 160000:
            raise ValueError("Visibility witness failed")
        first_correct = (time.perf_counter() - started) * 1000
        if args.output:
            from PIL import Image

            Image.fromarray(pixels).save(args.output + ".png")
        for i in range(10):
            renderer.draw(0.4 + i * 0.01, split=args.split)
        samples = []
        for i in range(args.frames):
            t = time.perf_counter()
            renderer.draw(0.4 + i * 0.002, split=args.split)
            samples.append((time.perf_counter() - t) * 1000)
        before = json.loads(client.request("/stats"))
        t = time.perf_counter()
        updated = json.loads(
            client.request(
                "/view",
                {
                    "revision": state["revision"],
                    "view": {"angle": 0.65, "intensity": 0.6},
                },
            )
        )
        renderer.draw(updated["view"]["angle"], updated["view"]["intensity"])
        revision = (time.perf_counter() - t) * 1000
        after = json.loads(client.request("/stats"))
        if before["assetRequests"] != after["assetRequests"]:
            raise ValueError("View retransferred geometry")
        cpu = time.process_time()
        frames = renderer.frames
        time.sleep(0.25)
        idle_cpu = (time.process_time() - cpu) * 1000
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (
            1 if os.uname().sysname == "Darwin" else 1024
        )
        result = {
            "backend": "native-wgpu",
            "binding": wgpu.__version__,
            "adapter": dict(renderer.adapter.info),
            "softwareGpu": renderer.adapter.info["adapter_type"] == "CPU",
            "mode": "split-draws" if args.split else "batched",
            "profile": state["profile"],
            "width": 640,
            "height": 480,
            "samples": 4,
            "vertices": len(vertices),
            "assetDigest": state["asset"]["digest"],
            "transferMs": transfer,
            "transferredBytes": client.transferred,
            "decodeMs": decode_ms,
            "devicePipelineUploadMs": setup,
            "deviceMs": renderer.device_ms,
            "uploadMs": renderer.upload_ms,
            "firstDrawMs": first_draw,
            "firstCorrectFrameMs": first_correct,
            "visibilityPixels": int(mask.sum()),
            "p50Ms": float(np.percentile(samples, 50)),
            "p95Ms": float(np.percentile(samples, 95)),
            "samplesMs": samples,
            "peakRssBytes": peak,
            "revisionLatencyMs": revision,
            "revisionGeometryBytes": after["assetBytes"] - before["assetBytes"],
            "idleIntervalMs": 250,
            "idleCpuMs": idle_cpu,
            "idleFrames": renderer.frames - frames,
            "runtime": after["runtime"],
        }
        print(json.dumps(result))
    finally:
        renderer.close()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(
            json.dumps(
                {
                    "status": "unsupported-or-failed",
                    "error": str(error),
                    "fallback": "existing Three.js viewer",
                }
            ),
            file=sys.stderr,
        )
        sys.exit(2)
