using System.Collections;
using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(.1f)]
    [InlineData(.4f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void VoxelCoordinatesRoundTripAcrossTheOrigin(float size)
    {
        using var library = new Library(size);
        for (var x = -3; x <= 3; x++)
        for (var y = -3; y <= 3; y++)
        for (var z = -3; z <= 3; z++)
        {
            library.MmToVoxels(library.vecVoxelsToMm(x, y, z), out var actualX, out var actualY, out var actualZ);
            Assert.Equal((x, y, z), (actualX, actualY, actualZ));
        }
        foreach (var coordinate in new[] { -2.5f, -1.5f, -.5f, .5f, 1.5f, 2.5f })
        {
            library.MmToVoxels(new Vector3(coordinate * size), out var x, out var y, out var z);
            var expected = (int)MathF.Round(coordinate, MidpointRounding.AwayFromZero);
            Assert.Equal((expected, expected, expected), (x, y, z));
        }
    }

    [Fact]
    public void VertexImportsEnumerateOnceAndPreserveIteratorWriteOrder()
    {
        using var library = new Library(1f);
        using var mesh = new Mesh(library);
        mesh.nAddVertex(new Vector3(99));
        var vertices = new[] { Vector3.Zero, Vector3.UnitX, Vector3.UnitX, new Vector3(7, 8, 9) };
        var input = new ObservedVertices(mesh, vertices);
        mesh.AddVertices(input, out var indices);
        Assert.Equal(1, input.Enumerations);
        Assert.Equal(new[] { 1, 2, 3, 4 }, indices);
        Assert.Equal(5, mesh.nVertexCount());
        Assert.Equal(0, mesh.nTriangleCount());
        Assert.Equal(vertices, indices.Select(mesh.vecVertexAt));
        mesh.AddVertices(vertices, out var arrayIndices);
        mesh.AddVertices(vertices.ToList(), out var listIndices);
        Assert.Equal(new[] { 5, 6, 7, 8 }, arrayIndices);
        Assert.Equal(new[] { 9, 10, 11, 12 }, listIndices);
        Assert.Equal(vertices, arrayIndices.Select(mesh.vecVertexAt));
        Assert.Equal(vertices, listIndices.Select(mesh.vecVertexAt));
    }

    [Theory]
    [InlineData(Mesh.EStlUnit.MM, 1f)]
    [InlineData(Mesh.EStlUnit.CM, 10f)]
    [InlineData(Mesh.EStlUnit.M, 1000f)]
    [InlineData(Mesh.EStlUnit.FT, 304.8f)]
    [InlineData(Mesh.EStlUnit.IN, 25.4f)]
    public void BinaryStlPreservesCornersUnitsAndPostScaleAcrossBatches(Mesh.EStlUnit unit, float unitScale)
    {
        using var library = new Library(1f);
        var path = Path.Combine(root, $"import-{unit}.stl");
        var corners = new[] { new Vector3(1.25f, -2, 3), new Vector3(4, 1.5f, 6), new Vector3(-2, 8, 5) };
        WriteBinaryStl(path, corners, 1025);
        using var mesh = Mesh.mshFromStlFile(path, unit, 2, new Vector3(10, 20, 30), library);
        Assert.Equal(3075, mesh.nVertexCount());
        Assert.Equal(1025, mesh.nTriangleCount());
        for (var triangle = 0; triangle < 1025; triangle++)
        {
            var actual = mesh.oTriangleAt(triangle);
            Assert.Equal((3 * triangle, 3 * triangle + 1, 3 * triangle + 2), (actual.A, actual.B, actual.C));
            for (var corner = 0; corner < 3; corner++)
            {
                var expected = corners[corner];
                expected *= unitScale; expected *= 2; expected += new Vector3(10, 20, 30);
                Assert.Equal(VectorBits(expected), VectorBits(mesh.vecVertexAt(3 * triangle + corner)));
            }
        }
    }

    [Fact]
    public void FailedStlImportsReleaseTheirNativeMesh()
    {
        using var library = new Library(1f);
        var ascii = Path.Combine(root, "unsupported-ascii.stl");
        File.WriteAllText(ascii, "solid fixture " + new string(' ', 80) + "\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid\n");
        // Handle-table buckets survive disposal; establish their capacity before checking for leaks.
        using (var prime = new Mesh(library)) { }
        var before = library.nTotalMemUsage();
        var unsupported = Assert.Throws<NotImplementedException>(() => Mesh.mshFromStlFile(ascii, libSet: library));
        Assert.Contains("ASCII STL Loading", unsupported.Message);
        Assert.Equal(before, library.nTotalMemUsage());
        var truncated = Path.Combine(root, "truncated.stl");
        WriteBinaryStl(truncated, new[] { Vector3.Zero, Vector3.UnitX, Vector3.UnitY }, 2);
        using (var stream = new FileStream(truncated, FileMode.Open, FileAccess.Write)) stream.SetLength(90);
        Assert.Throws<EndOfStreamException>(() => Mesh.mshFromStlFile(truncated, libSet: library));
        Assert.Equal(before, library.nTotalMemUsage());
        var oversized = Path.Combine(root, "oversized-count.stl");
        using (var writer = new BinaryWriter(File.Create(oversized)))
        {
            writer.Write(new byte[80]); writer.Write(uint.MaxValue);
        }
        Assert.Throws<EndOfStreamException>(() => Mesh.mshFromStlFile(oversized, libSet: library));
        Assert.Equal(before, library.nTotalMemUsage());
    }

    [Theory]
    [InlineData(-2f, 2f, 0f)]
    [InlineData(0f, 0f, 0f)]
    [InlineData(-2f, 0f, 0f)]
    [InlineData(0f, 2f, 0f)]
    [InlineData(2f, -2f, 0f)]
    [InlineData(0f, 2f, 1f)]
    public void ShellSubtractsTheOffsetInteriorAndPreservesItsSource(float low, float high, float smoothing)
    {
        using var library = new Library(.5f);
        using var source = new Voxels(library, new ImportSphere(), new BBox3(new Vector3(-10), new Vector3(10)));
        var original = ScalarRecords(source);
        using var inner = source.voxOffset(Math.Min(low, high));
        if (smoothing > 0) inner.TripleOffset(smoothing);
        using var expected = source.voxOffset(Math.Max(low, high));
        expected.BoolSubtract(inner);
        using var actual = source.voxShell(low, high, smoothing);
        Assert.Equal(ScalarRecords(expected), ScalarRecords(actual));
        Assert.Equal(original, ScalarRecords(source));
        if (low == -2 && high == 2)
        {
            Assert.False(actual.bIsInside(Vector3.Zero));
            Assert.True(actual.bIsInside(new Vector3(-6, 0, 0)));
            Assert.False(actual.bIsInside(new Vector3(-10, 0, 0)));
        }
    }

    [Theory]
    [InlineData(.7f, 0f)]
    [InlineData(1f, 0f)]
    [InlineData(1f, -.25f)]
    [InlineData(1f, .25f)]
    [InlineData(.5f, 0f)]
    [InlineData(.5f, -.25f)]
    [InlineData(.5f, .25f)]
    public void BooleanShellPreservesCavityPropertiesAndClosedNondegenerateSurface(float size, float offsetCells)
    {
        using var library = new Library(size);
        var center = new Vector3(size * offsetCells, 0, 0);
        using var outer = Voxels.voxSphere(library, center, 24);
        using var inner = Voxels.voxSphere(library, center, 20);
        using var shell = outer - inner;
        Assert.False(shell.bIsInside(center));
        Assert.False(shell.bIsInside(center + new Vector3(19, 0, 0)));
        Assert.True(shell.bIsInside(center + new Vector3(22, 0, 0)));
        Assert.False(shell.bIsInside(center + new Vector3(25, 0, 0)));
        using var mesh = shell.mshAsMesh();
        var welded = new Dictionary<Vector3, int>();
        var edges = new Dictionary<(int, int), (int Count, int Direction)>();
        double outerVolume = 0, innerVolume = 0;
        int Weld(Vector3 point)
        {
            if (welded.TryGetValue(point, out var index)) return index;
            index = welded.Count; welded.Add(point, index); return index;
        }
        void Edge(int from, int to)
        {
            var key = (Math.Min(from, to), Math.Max(from, to));
            edges.TryGetValue(key, out var value);
            edges[key] = (value.Count + 1, value.Direction + (from < to ? 1 : -1));
        }
        for (var index = 0; index < mesh.nTriangleCount(); index++)
        {
            var triangle = mesh.oTriangleAt(index);
            var a = mesh.vecVertexAt(triangle.A); var b = mesh.vecVertexAt(triangle.B); var c = mesh.vecVertexAt(triangle.C);
            var ux = (double)b.X - a.X; var uy = (double)b.Y - a.Y; var uz = (double)b.Z - a.Z;
            var vx = (double)c.X - a.X; var vy = (double)c.Y - a.Y; var vz = (double)c.Z - a.Z;
            Assert.True(uy * vz - uz * vy != 0 || uz * vx - ux * vz != 0 || ux * vy - uy * vx != 0);
            var ai = Weld(a); var bi = Weld(b); var ci = Weld(c);
            Edge(ai, bi); Edge(bi, ci); Edge(ci, ai);
            var ax = (double)a.X - center.X; var ay = (double)a.Y - center.Y; var az = (double)a.Z - center.Z;
            var bx = (double)b.X - center.X; var by = (double)b.Y - center.Y; var bz = (double)b.Z - center.Z;
            var cx = (double)c.X - center.X; var cy = (double)c.Y - center.Y; var cz = (double)c.Z - center.Z;
            var volume = (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
            if (((a + b + c) / 3 - center).Length() < 22) innerVolume += volume;
            else outerVolume += volume;
        }
        Assert.All(edges.Values, edge => Assert.Equal((2, 0), edge));
        Assert.True(innerVolume < 0); Assert.True(outerVolume > 0);
        var orientedVolume = outerVolume + innerVolume;
        var analyticVolume = 4 * Math.PI / 3 * (24 * 24 * 24 - 20 * 20 * 20);
        Assert.InRange(orientedVolume / analyticVolume, .98, 1.02);
        shell.CalculateProperties(out var correctedVolume, out _);
        Assert.InRange(correctedVolume / orientedVolume, .98, 1.02);
        shell.CalculateProperties(out var cachedVolume, out _);
        Assert.Equal(correctedVolume, cachedVolume);
        Assert.False(shell.bIsInside(center));
    }

    private static int[] VectorBits(Vector3 point) => new[] { BitConverter.SingleToInt32Bits(point.X),
        BitConverter.SingleToInt32Bits(point.Y), BitConverter.SingleToInt32Bits(point.Z) };

    private static void WriteBinaryStl(string path, Vector3[] corners, int count)
    {
        using var writer = new BinaryWriter(File.Create(path));
        writer.Write(new byte[80]); writer.Write((uint)count);
        for (var triangle = 0; triangle < count; triangle++)
        {
            writer.Write(0f); writer.Write(0f); writer.Write(1f);
            foreach (var point in corners) { writer.Write(point.X); writer.Write(point.Y); writer.Write(point.Z); }
            writer.Write((ushort)0);
        }
    }

    private static List<(Vector3, int)> ScalarRecords(Voxels voxels)
    {
        using var field = new ScalarField(voxels);
        var records = new ImportScalarRecords(); field.TraverseActive(records); return records.Values;
    }

    private sealed class ImportSphere : IImplicit
    {
        public float fSignedDistance(in Vector3 point) => point.Length() - 6f;
    }

    private sealed class ImportScalarRecords : ITraverseScalarField
    {
        public List<(Vector3, int)> Values { get; } = new();
        public void InformActiveValue(in Vector3 point, float value) => Values.Add((point, BitConverter.SingleToInt32Bits(value)));
    }

    private sealed class ObservedVertices(Mesh mesh, Vector3[] vertices) : IEnumerable<Vector3>
    {
        public int Enumerations { get; private set; }
        public IEnumerator<Vector3> GetEnumerator()
        {
            if (++Enumerations != 1) throw new InvalidOperationException("The source was enumerated twice.");
            for (var index = 0; index < vertices.Length; index++)
            {
                Assert.Equal(index + 1, mesh.nVertexCount());
                yield return vertices[index];
            }
        }
        IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
    }
}
