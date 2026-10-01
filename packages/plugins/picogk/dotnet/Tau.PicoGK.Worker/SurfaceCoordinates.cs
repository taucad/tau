using System.Numerics;

namespace Tau.PicoGK.Worker;

internal sealed record ProjectedSurface(float[] Positions, uint[] Indices, float[] TexCoords, Vector3[] U, Vector3[] V, int[] Sources);

/// <summary>Box charts normalized over original geometry bounds; transforms do not change texture phase.</summary>
internal static class SurfaceCoordinates
{
    internal static ProjectedSurface Project(float[] source, uint[] indices)
    {
        var minimum = new Vector3(float.PositiveInfinity);
        var maximum = new Vector3(float.NegativeInfinity);
        Vector3 Point(uint vertex) => new(source[vertex * 3], source[vertex * 3 + 1], source[vertex * 3 + 2]);
        for (uint vertex = 0; vertex < source.Length / 3; vertex++)
        {
            var point = Point(vertex);
            minimum = Vector3.Min(minimum, point); maximum = Vector3.Max(maximum, point);
        }
        var span = maximum - minimum;
        var positions = new List<float>(); var coordinates = new List<float>();
        var u = new List<Vector3>(); var v = new List<Vector3>(); var sources = new List<int>();
        var remapped = new uint[indices.Length];
        var vertices = new Dictionary<(uint Vertex, int Chart), uint>();
        // ponytail: six box charts have visible curved-surface seams; add explicit authored UVs when artistic unwrapping is needed.
        for (var triangle = 0; triangle < indices.Length; triangle += 3)
        {
            var normal = Vector3.Cross(Point(indices[triangle + 1]) - Point(indices[triangle]), Point(indices[triangle + 2]) - Point(indices[triangle]));
            var absolute = Vector3.Abs(normal);
            var axis = absolute.X >= absolute.Y && absolute.X >= absolute.Z ? 0 : absolute.Y >= absolute.Z ? 1 : 2;
            var direction = axis == 0 ? normal.X : axis == 1 ? normal.Y : normal.Z;
            var sign = direction < 0 ? -1 : 1;
            var chart = axis * 2 + (sign < 0 ? 1 : 0);
            var uAxis = axis == 0 ? 1 : 0; var vAxis = axis == 2 ? 1 : 2;
            var uSign = axis == 1 ? -sign : sign;
            var uDirection = (uAxis == 0 ? Vector3.UnitX : Vector3.UnitY) * uSign;
            var vDirection = vAxis == 1 ? Vector3.UnitY : Vector3.UnitZ;
            float At(Vector3 point, int coordinate) => coordinate == 0 ? point.X : coordinate == 1 ? point.Y : point.Z;
            for (var corner = triangle; corner < triangle + 3; corner++)
            {
                var vertex = indices[corner]; var key = (vertex, chart);
                if (!vertices.TryGetValue(key, out var target))
                {
                    target = checked((uint)u.Count); vertices.Add(key, target);
                    var point = Point(vertex); positions.AddRange([point.X, point.Y, point.Z]);
                    var width = At(span, uAxis); var height = At(span, vAxis);
                    var x = width > 0 ? (At(point, uAxis) - At(minimum, uAxis)) / width : 0;
                    coordinates.Add(uSign > 0 ? x : 1 - x);
                    coordinates.Add(height > 0 ? (At(point, vAxis) - At(minimum, vAxis)) / height : 0);
                    u.Add(Vector3.Zero); v.Add(Vector3.Zero); sources.Add(checked((int)vertex));
                }
                remapped[corner] = target;
            }
            var a = checked((int)remapped[triangle]); var b = checked((int)remapped[triangle + 1]); var c = checked((int)remapped[triangle + 2]);
            var edge1 = Point(indices[triangle + 1]) - Point(indices[triangle]);
            var edge2 = Point(indices[triangle + 2]) - Point(indices[triangle]);
            var du1 = coordinates[b * 2] - coordinates[a * 2]; var dv1 = coordinates[b * 2 + 1] - coordinates[a * 2 + 1];
            var du2 = coordinates[c * 2] - coordinates[a * 2]; var dv2 = coordinates[c * 2 + 1] - coordinates[a * 2 + 1];
            var determinant = du1 * dv2 - du2 * dv1;
            var tangent = determinant == 0 ? uDirection : (edge1 * dv2 - edge2 * dv1) / determinant;
            var bitangent = determinant == 0 ? vDirection : (edge2 * du1 - edge1 * du2) / determinant;
            foreach (var vertex in new[] { a, b, c }) { u[vertex] += tangent; v[vertex] += bitangent; }
        }
        return new ProjectedSurface(positions.ToArray(), remapped, coordinates.ToArray(), u.ToArray(), v.ToArray(), sources.ToArray());
    }

    internal static (float[] TexCoords, float[] Tangents) Expand(ProjectedSurface surface, float[] normals, Matrix4x4 matrix)
    {
        var uv = surface.TexCoords; var tangents = new float[surface.Sources.Length * 4];
        for (var vertex = 0; vertex < surface.Sources.Length; vertex++)
        {

            var normal = new Vector3(normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]);
            var tangent = Vector3.TransformNormal(surface.U[vertex], matrix);
            tangent -= normal * Vector3.Dot(tangent, normal);
            if (tangent.LengthSquared() == 0) tangent = Vector3.Cross(MathF.Abs(normal.X) < .9f ? Vector3.UnitX : Vector3.UnitY, normal);
            tangent = Vector3.Normalize(tangent);
            var bitangent = Vector3.TransformNormal(surface.V[vertex], matrix);
            tangents[vertex * 4] = tangent.X; tangents[vertex * 4 + 1] = tangent.Y; tangents[vertex * 4 + 2] = tangent.Z;
            tangents[vertex * 4 + 3] = Vector3.Dot(Vector3.Cross(normal, tangent), bitangent) < 0 ? -1 : 1;
        }
        return (uv, tangents);
    }
}
