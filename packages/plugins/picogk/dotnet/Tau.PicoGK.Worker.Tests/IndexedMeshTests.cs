using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void IndexedTransformsPreserveEveryVertexAndApplyCoordinateScale()
    {
        using var library = new Library(1f);
        using var source = new Mesh(library);
        Vector3[] points = [new(1, 2, 3), new(4, 1, 6), new(2, 8, 5), new(99, 99, 99)];
        foreach (var point in points) source.nAddVertex(point);
        source.nAddTriangle(0, 1, 2);
        using var scaled = source.mshCreateTransformed(new Vector3(2, 3, 4), new Vector3(10, 20, 30));
        var geometry = scaled.TauCopyGeometry();
        Assert.Equal(new float[] { 12, 26, 42, 18, 23, 54, 14, 44, 50, 208, 317, 426 }, geometry.Positions);
        Assert.Equal(new uint[] { 0, 1, 2 }, geometry.Indices);
        Assert.Equal(4, scaled.nVertexCount());
        var translation = Matrix4x4.CreateTranslation(10, 20, 30);
        using var moved = source.mshCreateTransformed(translation);
        Assert.Equal(new float[] { 11, 22, 33, 14, 21, 36, 12, 28, 35, 109, 119, 129 }, moved.TauCopyGeometry().Positions);
        using var mirrored = source.mshCreateMirrored(Vector3.Zero, Vector3.UnitX);
        Assert.Equal(new float[] { -1, 2, 3, -4, 1, 6, -2, 8, 5, -99, 99, 99 }, mirrored.TauCopyGeometry().Positions);
        Assert.Equal(geometry.Indices, mirrored.TauCopyGeometry().Indices);
        Assert.Equal(new float[] { 1, 2, 3, 4, 1, 6, 2, 8, 5, 99, 99, 99 }, source.TauCopyGeometry().Positions);
        using var verticesOnly = new Mesh(library);
        verticesOnly.nAddVertex(new Vector3(3, 4, 5));
        using var transformedVertex = verticesOnly.mshCreateTransformed(translation);
        Assert.Equal(new float[] { 13, 24, 35 }, transformedVertex.TauCopyGeometry().Positions);
        Assert.Empty(transformedVertex.TauCopyGeometry().Indices);
    }

    [Fact]
    public void FrozenCopiesPreserveSignedZeroAndDetachIndependentMutations()
    {
        using var library = new Library(1f);
        using var source = new Mesh(library);
        source.nAddVertex(new Vector3(-0f, 0f, -0f));
        using var copy = source.TauCreateCopy();
        Assert.Equal(new[] { int.MinValue, 0, int.MinValue },
            copy.TauCopyGeometry().Positions.Select(BitConverter.SingleToInt32Bits));
        source.nAddVertex(Vector3.UnitX);
        Assert.Equal(1, copy.nVertexCount());
        copy.nAddVertex(Vector3.UnitY);
        Assert.Equal(Vector3.UnitX, source.vecVertexAt(1));
        Assert.Equal(Vector3.UnitY, copy.vecVertexAt(1));
        source.Dispose();
        Assert.Equal(2, copy.nVertexCount());
        using var appended = new Mesh(library);
        appended.Append(copy);
        appended.Append(appended);
        Assert.Equal(4, appended.nVertexCount());
        Assert.Equal(new float[] { -0f, 0f, -0f, 0, 1, 0, -0f, 0f, -0f, 0, 1, 0 }, appended.TauCopyGeometry().Positions);
        Assert.Empty(appended.TauCopyGeometry().Indices);
    }
}
