using System.Numerics;
using System.Reflection;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void CaptureOwnsGeometryBeforeAddReturnsAndSourceDisposal()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var backend = new CaptureViewerBackend(Path.Combine(root, "add-owned-state"));
            var mesh = Utils.mshCreateCube(new Vector3(2, 4, 6));
            var gate = typeof(CaptureViewerBackend).GetField("gate", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.GetValue(backend)!;
            // Delay application, so this check does not depend on the command pump winning a race.
            lock (gate)
            {
                backend.Add(mesh, "Owned cube", 0);
                mesh.Dispose();
                backend.SetObjectMatrix(mesh, Matrix4x4.CreateTranslation(10, 0, 0));
            }
            var component = Assert.Single(backend.Extract().Components);
            Assert.Equal("Owned cube", component.Name);
            Assert.Equal(9f, component.Positions.Where((_, index) => index % 3 == 0).Min());
            Assert.Equal(11f, component.Positions.Where((_, index) => index % 3 == 0).Max());
            Assert.Equal(36, component.Indices.Length);
            Assert.Throws<ObjectDisposedException>(() => backend.Add(mesh, 0));
            backend.Remove(mesh);
            Assert.Empty(backend.Extract().Components);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [Fact]
    public void CaptureOwnsPolylineStateBeforeAddReturns()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var backend = new CaptureViewerBackend(Path.Combine(root, "add-owned-line"));
            using var line = new PolyLine("00ff00");
            line.Add([Vector3.Zero, Vector3.UnitX]);
            var gate = typeof(CaptureViewerBackend).GetField("gate", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.GetValue(backend)!;
            lock (gate)
            {
                backend.Add(line, 0);
                line.nAddVertex(Vector3.UnitY);
            }
            var captured = Assert.Single(backend.Extract().Components);
            Assert.Equal(new float[] { 0, 0, 0, 1, 0, 0 }, captured.Positions);
            Assert.Equal(new uint[] { 0, 1 }, captured.Indices);
            backend.Add(line, 0);
            Assert.Equal(9, Assert.Single(backend.Extract().Components).Positions.Length);
            backend.Add(line, 0);
            Assert.Equal(9, Assert.Single(backend.Extract().Components).Positions.Length);
            Assert.Equal(2, backend.GeometryCopies);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(100)]
    [InlineData(1000)]
    public void RepeatedAddCopiesOneOwnedGenerationAndDropsUnreferencedArrays(int count)
    {
        using var library = new Library(1f);
        using var mesh = new Mesh(library);
        mesh.nAddVertex(Vector3.Zero); mesh.nAddVertex(Vector3.UnitX); mesh.nAddVertex(Vector3.UnitY);
        mesh.nAddTriangle(0, 1, 2);
        var backend = new CaptureViewerBackend(Path.Combine(root, "reuse-counts"));
        var before = TauGeometryCapture.Counters(library);
        for (var i = 0; i < count; i++) backend.Add(mesh, "Bolt", 0);
        Assert.Single(backend.Extract().Components);
        var after = TauGeometryCapture.Counters(library);
        Assert.Equal((ulong)count, after[0] - before[0]);
        Assert.Equal(1UL, after[1] - before[1]);
        Assert.Equal(0UL, after[4]);
        Assert.Equal(1, backend.GeometryCopies);
        Assert.Equal(48, backend.GeometryBytes);
        backend.RemoveAllObjects();
        Assert.Empty(backend.Extract().Components);
        Assert.Equal(0, backend.GeometryBytes);
        backend.Add(mesh, 0);
        Assert.Single(backend.Extract().Components);
        Assert.Equal(2, backend.GeometryCopies);
        backend.Dispose();
        Assert.Equal(0, backend.GeometryBytes);
    }

    [Fact]
    public void VoxelCopiesAndExtractedMeshesShareSurfaceUntilIndependentMutation()
    {
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
            using var voxel = Voxels.voxSphere(Vector3.Zero, 2);
            using var copy = voxel.voxDuplicate();
            using var backend = new CaptureViewerBackend(Path.Combine(root, "surface-generation"));
            backend.Add(voxel, "Original", 0);
            backend.Add(copy, "Copy", 0);
            using var mesh = new Mesh(voxel);
            backend.Add(mesh, "Mesh", 0);
            var components = backend.Extract().Components;
            Assert.Equal(3, components.Count);
            Assert.Equal(3, components.Select(x => x.Id).Distinct().Count());
            Assert.Equal(new[] { "Original", "Copy", "Mesh" }, components.Select(x => x.Name));
            Assert.Equal(1, backend.GeometryCopies);
            Assert.Equal(1UL, TauGeometryCapture.Counters(library)[2]);
            using var original = voxel.TauAcquireGeometry();
            using var extracted = mesh.TauAcquireGeometry();
            Assert.Equal(original.Generation, extracted.Generation);
            copy.Offset(.25f);
            backend.Add(copy, "Copy", 0);
            Assert.Equal(3, backend.Extract().Components.Count);
            Assert.Equal(2, backend.GeometryCopies);
            Assert.Equal(2UL, TauGeometryCapture.Counters(library)[2]);
            using var changed = copy.TauAcquireGeometry();
            Assert.NotEqual(original.Generation, changed.Generation);
            using var unchanged = voxel.TauAcquireGeometry();
            Assert.Equal(original.Generation, unchanged.Generation);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [Fact]
    public void RejectedCaptureAndCancelledAddReleaseLeasesAndPendingArrays()
    {
        using var library = new Library(1f);
        using var invalid = new Mesh(library);
        invalid.nAddVertex(new Vector3(float.NaN, 0, 0));
        using var backend = new CaptureViewerBackend(Path.Combine(root, "capture-rejection"));
        Assert.Throws<ArgumentException>(() => backend.Add(invalid, 0));
        Assert.Equal(0UL, TauGeometryCapture.Counters(library)[4]);
        Assert.Equal(0, backend.GeometryBytes);
        using var valid = new Mesh(library);
        valid.nAddVertex(Vector3.Zero); valid.nAddVertex(Vector3.UnitX); valid.nAddVertex(Vector3.UnitY);
        valid.nAddTriangle(0, 1, 2);
        backend.Add(valid, 0);
        Assert.Single(backend.Extract().Components);
        backend.Cancel();
        Assert.Throws<OperationCanceledException>(() => backend.Add(valid, 0));
        Assert.Equal(0UL, TauGeometryCapture.Counters(library)[4]);
        backend.Dispose();
        Assert.Equal(0, backend.GeometryBytes);
    }

    [Fact]
    public void CaptureBudgetRejectsBeforeArrayCopyAndKeepsTheAcceptedScene()
    {
        using var library = new Library(1f);
        using var mesh = new Mesh(library);
        mesh.nAddVertex(Vector3.Zero); mesh.nAddVertex(Vector3.UnitX); mesh.nAddVertex(Vector3.UnitY);
        mesh.nAddTriangle(0, 1, 2);
        using var backend = new CaptureViewerBackend(Path.Combine(root, "capture-budget"));
        backend.Add(mesh, 0);
        var first = Assert.Single(backend.Extract().Components);
        var counter = typeof(CaptureViewerBackend).GetField("geometryBytes", BindingFlags.Instance | BindingFlags.NonPublic)!;
        // Represent already-accounted memory pressure without allocating a 256-MiB test fixture.
        counter.SetValue(backend, 256L * 1024 * 1024);
        var copies = TauGeometryCapture.Counters(library)[1];
        mesh.nAddVertex(Vector3.UnitZ);
        try
        {
            Assert.Equal("CS_TAU_RUNTIME", Assert.Throws<WorkerException>(() => backend.Add(mesh, 0)).Issues[0].Code);
            Assert.Equal(copies, TauGeometryCapture.Counters(library)[1]);
            Assert.Equal(0UL, TauGeometryCapture.Counters(library)[4]);
            Assert.Same(first.Positions, Assert.Single(backend.Extract().Components).Positions);
        }
        finally { counter.SetValue(backend, 48L); }
        backend.RemoveAllObjects();
        Assert.Empty(backend.Extract().Components);
        Assert.Equal(0, backend.GeometryBytes);
    }

    [Fact]
    public void ImplicitCallbackThrowsTheOriginalExceptionAndReleasesItsNativeScope()
    {
        using var library = new Library(.5f);
        using var voxel = new Voxels(library);
        var expected = new ApplicationException("first callback failure");
        var callback = new CaptureFailureImplicit(expected);
        var bounds = new BBox3(Vector3.Zero, Vector3.Zero);
        Assert.Same(expected, Assert.Throws<ApplicationException>(() => voxel.RenderImplicit(callback, bounds)));
        Assert.Equal(1, callback.Calls);
        using var capture = voxel.TauAcquireGeometry();
        Assert.True(capture.Generation > 0);
        Assert.Throws<ArgumentException>(() => voxel.RenderImplicit(new CaptureFailureImplicit(null),
            new BBox3(Vector3.Zero, new Vector3(float.PositiveInfinity))));
        var nonfinite = new CaptureFailureImplicit(null);
        Assert.Throws<ArgumentException>(() => voxel.RenderImplicit(nonfinite, bounds));
        Assert.Equal(1, nonfinite.Calls);
    }

    private sealed class CaptureFailureImplicit(Exception? failure) : IImplicit
    {
        internal int Calls;
        public float fSignedDistance(in Vector3 point)
        {
            Calls++;
            if (failure is not null) throw failure;
            return float.NaN;
        }
    }
}
