using System;
using System.IO;
using System.Linq;
using System.Numerics;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Nodes;
using PicoGK;

Library.Go(Params.VoxelSizeMm, Engine.Build);

public static class Params
{
    [Range(0.05, 5.0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;
    [Display(Name = "Sectioned casings", Order = 0)]
    public static bool Cutaway { get; set; } = true;
    [Display(Name = "Component path (blank = assembly)", Order = 1)]
    public static string Component { get; set; } = "";
    [Range(16, 64)]
    [Display(Name = "NACA chord samples", Order = 2)]
    public static int ChordSamples { get; set; } = 24;
    [Range(3, 12)]
    [Display(Name = "Blade span stations", Order = 3)]
    public static int SpanStations { get; set; } = 5;
}

public static class Engine
{
    const int CircleSamples = 96;
    static float Number(JsonNode part, string key, float fallback = 0) => (float?)part[key] ?? fallback;
    static string Text(JsonNode part, string key) => (string?)part[key] ?? "";
    static Vector3 Polar(float axial, float radius, float angle) => new(axial, radius * MathF.Cos(angle), radius * MathF.Sin(angle));

    public static void Build()
    {
        if (Params.ChordSamples < 16 || Params.ChordSamples > 64 || Params.SpanStations < 3 || Params.SpanStations > 12)
            throw new ArgumentOutOfRangeException("Airfoil resolution exceeds supported limits.");
        CheckNaca();
        var manifest = JsonNode.Parse(File.ReadAllText("assembly.json"))!;
        var selected = manifest["parts"]!.AsArray().Where(part => part != null &&
            (Params.Component == "" || Text(part, "id") == Params.Component || Text(part, "id").StartsWith(Params.Component + "/"))).ToArray();
        if (selected.Length == 0) throw new ArgumentException("Unknown component path: " + Params.Component);
        int group = 0;
        var fixedShapes = new List<string>();
        var lowPressureShapes = new List<string>();
        var highPressureShapes = new List<string>();
        foreach (var entry in selected)
        {
            var part = entry!;
            bool cut = Params.Cutaway && ((bool?)part["cut"] ?? false);
            int count = (int)Number(part, "count", 1);
            for (int instance = 0; instance < count; instance++)
            {
                float angle = 2 * MathF.PI * instance / count + Number(part, "phase") * MathF.PI / 180;
                Mesh mesh;
                switch (Text(part, "kind"))
                {
                    case "ring":
                        var profile = part["profile"]!.AsArray().Select(point => new Vector2((float)point![0]!, (float)point[1]!)).ToArray();
                        mesh = Number(part, "holes") > 0 ? Perforated(part, cut) : Revolve(profile, cut);
                        float pitch = Number(part, "pitch");
                        var offset = new Vector3(0, Number(part, "y") + pitch * MathF.Cos(angle), Number(part, "z") + pitch * MathF.Sin(angle));
                        if (offset != Vector3.Zero) mesh = mesh.mshCreateTransformed(Vector3.One, offset);
                        break;
                    case "blade": mesh = Blade(part, angle); break;
                    case "perforated": mesh = Perforated(part, cut); break;
                    case "box": mesh = Box(part); break;
                    default: throw new ArgumentException("Unknown geometry kind.");
                }
                string name = Text(part, "id") + " #" + (instance + 1).ToString("D3");
                (Text(part, "motion") switch
                {
                    "lp" => lowPressureShapes,
                    "hp" => highPressureShapes,
                    _ => fixedShapes,
                }).Add(name);
                Library.oViewer().SetGroupMaterial(group, Text(part, "color"), 0.65f, 0.32f);
                Library.oViewer().Add(mesh, name, group++);
            }
        }
        if (Params.Component == "")
            Library.oViewer().SetMechanism(new
            {
                schemaVersion = 1,
                units = new { length = "mm", angle = "deg" },
                root = "frame",
                links = new
                {
                    frame = new { shapes = fixedShapes },
                    lowPressure = new { shapes = lowPressureShapes },
                    highPressure = new { shapes = highPressureShapes },
                },
                joints = new
                {
                    lowPressureSpin = new { type = "revolute", parent = "frame", child = "lowPressure", origin = new[] { 0, 0, 0 }, axis = new[] { 1, 0, 0 } },
                    highPressureSpin = new { type = "revolute", parent = "frame", child = "highPressure", origin = new[] { 0, 0, 0 }, axis = new[] { 1, 0, 0 } },
                },
                animations = new[]
                {
                    new
                    {
                        id = "twoSpoolSpin", name = "Two spool rotation", duration = 6, loop = "repeat",
                        keyframes = new[]
                        {
                            new { time = 0, coordinates = new { lowPressureSpin = 0, highPressureSpin = 0 } },
                            new { time = 6, coordinates = new { lowPressureSpin = 720, highPressureSpin = 1800 } },
                        },
                    },
                },
            });
    }

    static void Triangle(Mesh mesh, int first, int second, int third)
    {
        if (first != second && second != third && third != first) mesh.nAddTriangle(first, second, third);
    }

    static void Quad(Mesh mesh, int first, int second, int third, int fourth)
    {
        Triangle(mesh, first, second, third);
        Triangle(mesh, first, third, fourth);
    }

    static float Cross(Vector2 first, Vector2 second) => first.X * second.Y - first.Y * second.X;

    static List<(int, int, int)> Triangulate(Vector2[] polygon)
    {
        var remaining = Enumerable.Range(0, polygon.Length).ToList();
        var triangles = new List<(int, int, int)>();
        float area = 0;
        for (int index = 0; index < polygon.Length; index++) area += Cross(polygon[index], polygon[(index + 1) % polygon.Length]);
        float orientation = MathF.Sign(area);
        while (remaining.Count > 3)
        {
            bool clipped = false;
            for (int index = 0; index < remaining.Count; index++)
            {
                int previous = remaining[(index + remaining.Count - 1) % remaining.Count];
                int current = remaining[index];
                int next = remaining[(index + 1) % remaining.Count];
                var first = polygon[previous];
                var second = polygon[current];
                var third = polygon[next];
                if (orientation * Cross(second - first, third - second) <= 1e-10f) continue;
                bool occupied = remaining.Any(candidate => candidate != previous && candidate != current && candidate != next &&
                    orientation * Cross(second - first, polygon[candidate] - first) >= -1e-10f &&
                    orientation * Cross(third - second, polygon[candidate] - second) >= -1e-10f &&
                    orientation * Cross(first - third, polygon[candidate] - third) >= -1e-10f);
                if (occupied) continue;
                triangles.Add((previous, current, next));
                remaining.RemoveAt(index);
                clipped = true;
                break;
            }
            if (!clipped) throw new InvalidOperationException("Cross-section is not a simple triangulable polygon.");
        }
        triangles.Add((remaining[0], remaining[1], remaining[2]));
        return triangles;
    }

    static Mesh Revolve(Vector2[] profile, bool cut)
    {
        var mesh = new Mesh();
        int segments = cut ? CircleSamples / 2 : CircleSamples;
        int stations = cut ? segments + 1 : segments;
        var vertices = new int[profile.Length, stations];
        for (int index = 0; index < profile.Length; index++)
        {
            int axis = profile[index].Y == 0 ? mesh.nAddVertex(new Vector3(profile[index].X, 0, 0)) : -1;
            for (int station = 0; station < stations; station++)
            {
                float angle = (cut ? MathF.PI : 0) + 2 * MathF.PI * station / CircleSamples;
                var point = Polar(profile[index].X, profile[index].Y, angle);
                if (cut && (station == 0 || station == segments)) point.Z = 0;
                vertices[index, station] = axis >= 0 ? axis : mesh.nAddVertex(point);
            }
        }
        for (int index = 0; index < profile.Length; index++)
            for (int station = 0; station < segments; station++)
                Quad(mesh, vertices[index, station], vertices[index, (station + 1) % stations], vertices[(index + 1) % profile.Length, (station + 1) % stations], vertices[(index + 1) % profile.Length, station]);
        if (cut)
            foreach (var (first, second, third) in Triangulate(profile))
            {
                Triangle(mesh, vertices[first, 0], vertices[second, 0], vertices[third, 0]);
                Triangle(mesh, vertices[third, segments], vertices[second, segments], vertices[first, segments]);
            }
        return mesh;
    }

    public static Vector2 Naca(string code, float chordPosition, bool upper)
    {
        if (code.Length != 4 || code.Any(character => !char.IsDigit(character)) || chordPosition < 0 || chordPosition > 1)
            throw new ArgumentException("A NACA four-digit designation and 0..1 chord coordinate are required.");
        float camber = (code[0] - '0') / 100f;
        float location = (code[1] - '0') / 10f;
        float thickness = int.Parse(code.Substring(2)) / 100f;
        if (thickness <= 0 || (camber > 0 && (location <= 0 || location >= 1))) throw new ArgumentException("Invalid NACA section.");
        float position = chordPosition;
        float halfThickness = 5 * thickness * (0.2969f * MathF.Sqrt(position) - 0.1260f * position - 0.3516f * position * position + 0.2843f * position * position * position - 0.1015f * position * position * position * position);
        float mean = 0;
        float slope = 0;
        if (camber > 0)
        {
            float denominator = position < location ? location * location : (1 - location) * (1 - location);
            mean = position < location ? camber / denominator * (2 * location * position - position * position) : camber / denominator * (1 - 2 * location + 2 * location * position - position * position);
            slope = 2 * camber / denominator * (location - position);
        }
        float theta = MathF.Atan(slope);
        float sign = upper ? 1 : -1;
        return new Vector2(position - sign * halfThickness * MathF.Sin(theta), mean + sign * halfThickness * MathF.Cos(theta));
    }

    static void CheckNaca()
    {
        if (MathF.Abs(Naca("0012", 0.3f, true).Y - 0.0600173f) > 0.000001f ||
            MathF.Abs(Naca("0012", 1, true).Y - 0.00126f) > 0.000001f ||
            MathF.Abs((Naca("2412", 0.4f, true).Y + Naca("2412", 0.4f, false).Y) / 2 - 0.02f) > 0.000001f)
            throw new InvalidOperationException("NACA reference ordinate regression.");
    }

    static Mesh Blade(JsonNode part, float azimuth)
    {
        string code = Text(part, "naca");
        int samples = Params.ChordSamples;
        var profile = new List<Vector2>();
        for (int index = 0; index <= samples; index++) profile.Add(Naca(code, (1 - MathF.Cos(MathF.PI * index / samples)) / 2, true));
        for (int index = samples; index > 0; index--) profile.Add(Naca(code, (1 - MathF.Cos(MathF.PI * index / samples)) / 2, false));
        var mesh = new Mesh();
        int stations = Params.SpanStations;
        var vertices = new int[stations, profile.Count];
        for (int station = 0; station < stations; station++)
        {
            float span = (float)station / (stations - 1);
            float chord = Number(part, "chord") * (1 + (Number(part, "taper") - 1) * span);
            float stagger = (Number(part, "angle") + Number(part, "twist") * span) * MathF.PI / 180;
            float radius = Number(part, "root") + (Number(part, "tip") - Number(part, "root")) * span;
            for (int index = 0; index < profile.Count; index++)
            {
                float axial = (profile[index].X - 0.25f) * chord;
                float normal = profile[index].Y * chord;
                float along = axial * MathF.Cos(stagger) - normal * MathF.Sin(stagger);
                float tangent = axial * MathF.Sin(stagger) + normal * MathF.Cos(stagger);
                var point = new Vector3(Number(part, "x") + Number(part, "chord") * 0.25f + Number(part, "sweep") * span + along,
                    radius * MathF.Cos(azimuth) - tangent * MathF.Sin(azimuth), radius * MathF.Sin(azimuth) + tangent * MathF.Cos(azimuth));
                vertices[station, index] = mesh.nAddVertex(point);
            }
        }
        for (int station = 0; station < stations - 1; station++)
            for (int index = 0; index < profile.Count; index++)
                Quad(mesh, vertices[station, index], vertices[station, (index + 1) % profile.Count], vertices[station + 1, (index + 1) % profile.Count], vertices[station + 1, index]);
        foreach (var (first, second, third) in Triangulate(profile.ToArray()))
        {
            Triangle(mesh, vertices[0, third], vertices[0, second], vertices[0, first]);
            Triangle(mesh, vertices[stations - 1, first], vertices[stations - 1, second], vertices[stations - 1, third]);
        }
        return mesh;
    }

    static Mesh Perforated(JsonNode part, bool cut)
    {
        var mesh = new Mesh();
        bool plate = Number(part, "holes") > 0;
        float start = plate ? (float)part["profile"]![2]![1]! : Number(part, "x");
        float length = plate ? (float)part["profile"]![0]![1]! - start : Number(part, "length");
        float radius = plate ? (float)part["profile"]![0]![0]! : Number(part, "radius");
        float thickness = plate ? (float)part["profile"]![1]![0]! - radius : Number(part, "thickness");
        float holeRadius = Number(part, plate ? "holeRadius" : "hole");
        float holePitch = plate ? start + length / 2 : radius;
        int axialCells = plate ? 1 : (int)Number(part, "axial");
        int totalCells = (int)Number(part, plate ? "holes" : "around");
        int angularCells = cut ? totalCells / 2 : totalCells;
        float axialStep = length / axialCells;
        float arcStep = 2 * MathF.PI / totalCells;
        var shared = new Dictionary<(int, int, int), int>();
        Vector3 Map(float along, float across, float angle) => plate ? Polar(across, along, angle) : Polar(along, across, angle);
        int Vertex(int axialGrid, int angularGrid, int layer)
        {
            if (!cut) angularGrid %= totalCells * 4;
            var key = (axialGrid, angularGrid, layer);
            if (shared.TryGetValue(key, out int existing)) return existing;
            float angle = (cut ? MathF.PI : 0) + angularGrid * arcStep / 4;
            var point = Map(start + axialGrid * axialStep / 4, radius + layer * thickness, angle);
            if (cut && (angularGrid == 0 || angularGrid == angularCells * 4)) point.Z = 0;
            int added = mesh.nAddVertex(point);
            shared[key] = added;
            return added;
        }
        var boundary = new (int, int)[] { (4,2),(4,3),(4,4),(3,4),(2,4),(1,4),(0,4),(0,3),(0,2),(0,1),(0,0),(1,0),(2,0),(3,0),(4,0),(4,1) };
        for (int axialCell = 0; axialCell < axialCells; axialCell++)
            for (int angularCell = 0; angularCell < angularCells; angularCell++)
            {
                var outer = new int[2,16];
                var hole = new int[2,16];
                for (int layer = 0; layer < 2; layer++)
                    for (int index = 0; index < 16; index++)
                    {
                        outer[layer,index] = Vertex(axialCell * 4 + boundary[index].Item1, angularCell * 4 + boundary[index].Item2, layer);
                        float angle = 2 * MathF.PI * index / 16;
                        float axial = start + (axialCell + 0.5f) * axialStep + holeRadius * MathF.Cos(angle);
                        float polar = (cut ? MathF.PI : 0) + (angularCell + 0.5f) * arcStep + holeRadius / holePitch * MathF.Sin(angle);
                        hole[layer,index] = mesh.nAddVertex(Map(axial, radius + layer * thickness, polar));
                    }
                for (int index = 0; index < 16; index++)
                {
                    int next = (index + 1) % 16;
                    Quad(mesh, outer[1,index], hole[1,index], hole[1,next], outer[1,next]);
                    Quad(mesh, outer[0,next], hole[0,next], hole[0,index], outer[0,index]);
                    Quad(mesh, hole[0,index], hole[0,next], hole[1,next], hole[1,index]);
                }
            }
        for (int angular = 0; angular < angularCells * 4; angular++)
        {
            Quad(mesh, Vertex(0,angular+1,0), Vertex(0,angular+1,1), Vertex(0,angular,1), Vertex(0,angular,0));
            Quad(mesh, Vertex(axialCells*4,angular+1,1), Vertex(axialCells*4,angular+1,0), Vertex(axialCells*4,angular,0), Vertex(axialCells*4,angular,1));
        }
        if (cut)
            for (int axial = 0; axial < axialCells * 4; axial++)
            {
                Quad(mesh, Vertex(axial+1,0,1), Vertex(axial+1,0,0), Vertex(axial,0,0), Vertex(axial,0,1));
                Quad(mesh, Vertex(axial+1,angularCells*4,0), Vertex(axial+1,angularCells*4,1), Vertex(axial,angularCells*4,1), Vertex(axial,angularCells*4,0));
            }
        if (!plate) return mesh;
        var reversed = new Mesh();
        for (int triangle = 0; triangle < mesh.nTriangleCount(); triangle++)
        {
            mesh.GetTriangle(triangle, out var first, out var second, out var third);
            reversed.nAddTriangle(first, third, second);
        }
        return reversed;
    }

    static Mesh Box(JsonNode part)
    {
        var mesh = new Mesh();
        var center = new Vector3(Number(part,"x"), Number(part,"y"), Number(part,"z"));
        var size = new Vector3(Number(part,"sx"), Number(part,"sy"), Number(part,"sz"));
        var points = new Vector3[] { new(-1,-1,-1),new(1,-1,-1),new(1,1,-1),new(-1,1,-1),new(-1,-1,1),new(1,-1,1),new(1,1,1),new(-1,1,1) };
        var vertices = points.Select(point => mesh.nAddVertex(center + point * size / 2)).ToArray();
        var faces = new int[,] { {0,3,2,1},{4,5,6,7},{0,1,5,4},{1,2,6,5},{2,3,7,6},{3,0,4,7} };
        for (int face = 0; face < 6; face++) Quad(mesh, vertices[faces[face,0]],vertices[faces[face,1]],vertices[faces[face,2]],vertices[faces[face,3]]);
        float wall = Number(part, "wall");
        if (wall > 0)
        {
            var inner = points.Select(point => mesh.nAddVertex(center + point * (size - new Vector3(2 * wall)) / 2)).ToArray();
            for (int face = 0; face < 6; face++) Quad(mesh, inner[faces[face,3]],inner[faces[face,2]],inner[faces[face,1]],inner[faces[face,0]]);
        }
        return mesh;
    }
}
