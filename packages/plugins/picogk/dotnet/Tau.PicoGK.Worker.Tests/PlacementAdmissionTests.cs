using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void FirstMatrixPlacementUsesTheActualMapAndIgnoresHomogeneousEntries()
    {
        using var library = new Library(1f);
        using var source = new Mesh(library);
        var points = new[] { new Vector3(-0f, 2, 3), new Vector3(4, 1, 6), new Vector3(2, 8, 5), new Vector3(99) };
        foreach (var point in points) source.nAddVertex(point);
        source.nAddTriangle(0, 1, 2);
        using var original = source.TauAcquireGeometry();
        var matrix = Matrix4x4.CreateRotationZ(.37f) * Matrix4x4.CreateTranslation(.1f, .2f, .3f);
        matrix.M14 = 4; matrix.M24 = 5; matrix.M34 = 6; matrix.M44 = -7;
        using var placed = source.mshCreateTransformed(matrix);
        using var capture = placed.TauAcquireGeometry();
        var placement = Mesh.TauReadPlacement(capture);
        Assert.True(placement.IsPlaced);
        Assert.Equal(original.Generation, placement.PrototypeGeneration);
        Assert.Equal(0f, placement.Matrix.M14);
        Assert.Equal(0f, placement.Matrix.M24);
        Assert.Equal(0f, placement.Matrix.M34);
        Assert.Equal(1f, placement.Matrix.M44);
        var xyz = new float[capture.PositionCount]; var abc = new uint[capture.IndexCount];
        capture.Copy(xyz, abc);
        var expected = points.Select(point => Vector3.Transform(point, matrix)).SelectMany(point => new[] { point.X, point.Y, point.Z });
        Assert.Equal(expected.Select(BitConverter.SingleToInt32Bits), xyz.Select(BitConverter.SingleToInt32Bits));
        Assert.Equal(new uint[] { 0, 1, 2 }, abc);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(100)]
    [InlineData(1000)]
    public void PlacedAddOwnsOnePrototypeAfterAllNativeSourcesAreDisposed(int count)
    {
        using var library = new Library(1f);
        using var source = new Mesh(library);
        source.nAddVertex(Vector3.Zero); source.nAddVertex(Vector3.UnitX); source.nAddVertex(Vector3.UnitY);
        source.nAddVertex(new Vector3(99)); source.nAddTriangle(0, 1, 2);
        using var backend = new CaptureViewerBackend(Path.Combine(root, "placed-admission"));
        for (var index = 0; index < count; index++)
        {
            using var placed = source.mshCreateTransformed(Vector3.One, new Vector3(index * 2, 3, 4));
            var before = TauGeometryCapture.Counters(library);
            backend.Add(placed, $"Bolt/{index}", 0);
            var after = TauGeometryCapture.Counters(library);
            Assert.Equal(1UL, after[0] - before[0]);
            Assert.Equal(index == 0 ? 1UL : 0UL, after[1] - before[1]);
            Assert.Equal(0UL, after[4]);
        }
        source.Dispose();
        var scene = backend.Extract();
        Assert.Equal(count, scene.Components.Count);
        Assert.Equal(count, scene.Components.Select(component => component.Id).Distinct().Count());
        Assert.Equal(1, backend.GeometryCopies);
        Assert.Equal(60, backend.GeometryBytes);
        var bounds = backend.GetBoundingBox();
        Assert.Equal(new Vector3(0, 3, 4), bounds.vecMin);
        Assert.Equal(new Vector3((count - 1) * 2 + 99, 102, 103), bounds.vecMax);
        backend.RemoveAllObjects();
        Assert.Empty(backend.Extract().Components);
        Assert.Equal(0, backend.GeometryBytes);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    [InlineData(4)]
    public void PlacementPreservesBakedWorldNormalsBoundsAndSourceTextureCoordinates(int operation)
    {
        using var library = new Library(1f);
        using var source = new Mesh(library);
        // Two shared triangles meet at 20 degrees; nonuniform scale changes the world crease.
        var radians = 20f * MathF.PI / 180f;
        foreach (var point in new[] { Vector3.Zero, Vector3.UnitX, Vector3.UnitY,
            new Vector3(0, -MathF.Cos(radians), MathF.Sin(radians)), new Vector3(9, 8, 7) })
            source.nAddVertex(point);
        source.nAddTriangle(0, 1, 2); source.nAddTriangle(1, 0, 3);
        using var intermediate = source.mshCreateTransformed(Matrix4x4.CreateRotationZ(.37f) * Matrix4x4.CreateTranslation(.1f, .2f, .3f));
        var shear = Matrix4x4.Identity; shear.M21 = .25f;
        using var placed = operation switch
        {
            0 => source.mshCreateTransformed(new Vector3(1, 1, 10), new Vector3(3, 4, 5)),
            1 => source.mshCreateMirrored(Vector3.Zero, Vector3.UnitX),
            2 => source.mshCreateTransformed(shear),
            3 => source.mshCreateTransformed(Matrix4x4.CreateScale(0, 1, 1)),
            _ => intermediate.mshCreateTransformed(Matrix4x4.CreateRotationX(.13f) * Matrix4x4.CreateTranslation(.2f, .3f, .4f)),
        };
        using var capture = placed.TauAcquireGeometry();
        var xyz = new float[capture.PositionCount]; var abc = new uint[capture.IndexCount];
        capture.Copy(xyz, abc);
        using var baked = new Mesh(library);
        for (var index = 0; index < xyz.Length; index += 3)
            baked.nAddVertex(new Vector3(xyz[index], xyz[index + 1], xyz[index + 2]));
        for (var index = 0; index < abc.Length; index += 3)
            baked.nAddTriangle((int)abc[index], (int)abc[index + 1], (int)abc[index + 2]);
        using var actual = new CaptureViewerBackend(Path.Combine(root, "placed-world"));
        using var expected = new CaptureViewerBackend(Path.Combine(root, "baked-world"));
        actual.Add(placed, "Part", 0); expected.Add(baked, "Part", 0);
        var matrix = Matrix4x4.CreateRotationY(.23f) * Matrix4x4.CreateTranslation(.31f, .17f, .11f);
        actual.SetObjectMatrix(placed, matrix); expected.SetObjectMatrix(baked, matrix);
        actual.SetGroupMatrix(0, Matrix4x4.CreateTranslation(7, 8, 9));
        expected.SetGroupMatrix(0, Matrix4x4.CreateTranslation(7, 8, 9));
        actual.SetGroupMaterial(0, new global::PicoGK.Material { Anisotropy = new() { Strength = .5f } });
        expected.SetGroupMaterial(0, new global::PicoGK.Material { Anisotropy = new() { Strength = .5f } });
        placed.Dispose(); baked.Dispose(); source.Dispose();
        var a = Assert.Single(actual.Extract().Components); var b = Assert.Single(expected.Extract().Components);
        Assert.Equal(b.Positions.Select(BitConverter.SingleToInt32Bits), a.Positions.Select(BitConverter.SingleToInt32Bits));
        Assert.Equal(b.Normals.Select(BitConverter.SingleToInt32Bits), a.Normals.Select(BitConverter.SingleToInt32Bits));
        Assert.Equal(b.Indices, a.Indices);
        Assert.Equal(b.TexCoords!.Select(BitConverter.SingleToInt32Bits), a.TexCoords!.Select(BitConverter.SingleToInt32Bits));
        Assert.Equal(b.Tangents!.Select(BitConverter.SingleToInt32Bits), a.Tangents!.Select(BitConverter.SingleToInt32Bits));
        Assert.Equal(expected.GetBoundingBox().vecMin, actual.GetBoundingBox().vecMin);
        Assert.Equal(expected.GetBoundingBox().vecMax, actual.GetBoundingBox().vecMax);
    }
}
