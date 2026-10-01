using System.Numerics;
using System.Reflection;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void SuccessfulHostRunReturnsOwnedGeometryAfterNativeTeardown()
    {
        using var host = new HostedLibraryHost(Path.Combine(root, "completed-host"));
        host.Run(1f, () =>
        {
            using var mesh = new Mesh(Library.oLibrary());
            mesh.nAddVertex(Vector3.Zero);
            mesh.nAddVertex(Vector3.UnitX);
            mesh.nAddVertex(Vector3.UnitY);
            mesh.nAddTriangle(0, 1, 2);
            Library.oViewer().Add(mesh, "Owned triangle");
        }, host.DefaultLogFilePath, false, "", "");
        var component = Assert.Single(host.TakeResult().Components);
        Assert.Equal("Owned triangle", component.Name);
        Assert.Equal(new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0 }, component.Positions);
        Assert.Equal(new uint[] { 0, 1, 2 }, component.Indices);
    }

    [Theory]
    [InlineData(0f)]
    [InlineData(-1f)]
    [InlineData(float.NaN)]
    [InlineData(float.PositiveInfinity)]
    [InlineData(float.NegativeInfinity)]
    public void InvalidVoxelSizeFailsBeforeStartingModelOrNativeOwners(float size)
    {
        var direct = Assert.Throws<ArgumentOutOfRangeException>(() => new Library(size));
        Assert.Equal("fVoxelSizeMM", direct.ParamName);
        Assert.Contains("Voxel size must be finite and greater than zero.", direct.Message);
        using var host = new HostedLibraryHost(Path.Combine(root, "invalid-library"));
        var started = false;
        var hosted = Assert.Throws<ArgumentOutOfRangeException>(() =>
            host.Run(size, () => started = true, host.DefaultLogFilePath, false, "", ""));
        Assert.Equal(direct.Message, hosted.Message);
        Assert.False(started);
        Assert.Equal("CS_TAU_NO_SCENE", Assert.Throws<WorkerException>(host.TakeResult).Issues[0].Code);
    }

    [Fact]
    public void ClosedQueueReleasesOwnedCaptureWhenAddCannotPublish()
    {
        using var library = new Library(1f);
        using var mesh = new Mesh(library);
        mesh.nAddVertex(Vector3.Zero);
        mesh.nAddVertex(Vector3.UnitX);
        mesh.nAddVertex(Vector3.UnitY);
        mesh.nAddTriangle(0, 1, 2);
        using var backend = new CaptureViewerBackend(Path.Combine(root, "closed-capture"));
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var commands = typeof(CaptureViewerBackend).GetField("commands", flags)!.GetValue(backend)!;
        // A completed queue can precede the host's completed flag when its pump is failing.
        commands.GetType().GetMethod("CompleteAdding")!.Invoke(commands, null);
        Assert.IsType<InvalidOperationException>(Record.Exception(() => backend.Add(mesh, 0)));
        Assert.Equal(0, backend.GeometryBytes);
        Assert.Equal(0UL, TauGeometryCapture.Counters(library)[4]);
        backend.Complete();
        Assert.Empty(backend.Extract().Components);
        backend.Dispose();
        backend.Cancel(); // A cancellation callback racing completed teardown must be harmless.
        Assert.Throws<ObjectDisposedException>(() => backend.RequestUpdate());
    }

    [Fact]
    public void CaptureAdmissionRejectsUnsupportedInternalGeometryBeforeAllocating()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "unsupported-capture"));
        var admission = typeof(CaptureViewerBackend).GetMethod("SnapshotGeometry",
            BindingFlags.Instance | BindingFlags.NonPublic)!;
        var wrapped = Assert.Throws<TargetInvocationException>(() => admission.Invoke(backend, [new object()]));
        var error = Assert.IsType<ArgumentException>(wrapped.InnerException);
        Assert.Equal("source", error.ParamName);
        Assert.Contains("Unsupported PicoGK viewer geometry.", error.Message);
        Assert.Equal(0, backend.GeometryBytes);
        Assert.Empty(backend.Extract().Components);
    }
}
