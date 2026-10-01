using System.Numerics;
using System.Reflection;
using System.Runtime.ExceptionServices;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void PollFailureWaitsForModelNativeReadsAndPreservesFirstError(bool modelAlsoFails)
    {
        using var pollFaultObserved = new ManualResetEventSlim();
        using var readRequested = new ManualResetEventSlim();
        using var readCompleted = new ManualResetEventSlim();
        using var releaseModel = new ManualResetEventSlim();
        using var modelCompleted = new ManualResetEventSlim();
        using var hostCompleted = new ManualResetEventSlim();
        using var host = new HostedLibraryHost(Path.Combine(root, "poll-failure-lifetime"));
        var firstError = new InvalidOperationException("controlled poll failure");
        var modelError = new ArgumentException("later model failure");
        Library? library = null;
        Exception? observedError = null;
        Exception? readError = null;
        float[]? positions = null;
        uint[]? indices = null;
        var hostThreadId = 0;
        var firstErrorThrows = 0;
        var modelWasCompleteAtHostReturn = false;
        EventHandler<FirstChanceExceptionEventArgs> observePollFault = (_, args) =>
        {
            if (Environment.CurrentManagedThreadId != Volatile.Read(ref hostThreadId) ||
                !ReferenceEquals(args.Exception, firstError)) return;
            Interlocked.Increment(ref firstErrorThrows);
            pollFaultObserved.Set();
        };
        var thread = new Thread(() =>
        {
            Volatile.Write(ref hostThreadId, Environment.CurrentManagedThreadId);
            try
            {
                host.Run(1f, () =>
                {
                    library = Library.oLibrary();
                    TauGeometryCapture capture;
                    // The lease, rather than this mutable author handle, must remain live.
                    using (var mesh = new Mesh(library))
                    {
                        mesh.nAddVertex(Vector3.Zero);
                        mesh.nAddVertex(Vector3.UnitX);
                        mesh.nAddVertex(Vector3.UnitY);
                        mesh.nAddTriangle(0, 1, 2);
                        capture = mesh.TauAcquireGeometry();
                    }
                    using (capture)
                    {
                        try
                        {
                            SetLifecyclePumpError(firstError);
                            if (!readRequested.Wait(TimeSpan.FromSeconds(3)))
                                throw new TimeoutException("The test did not request the held model's native read.");
                            positions = new float[capture.PositionCount];
                            indices = new uint[capture.IndexCount];
                            capture.Copy(positions, indices);
                            Assert.Equal(1UL, TauGeometryCapture.Counters(library)[4]);
                        }
                        catch (Exception error) { readError = error; }
                        finally { readCompleted.Set(); }
                        if (!releaseModel.Wait(TimeSpan.FromSeconds(3)))
                            throw new TimeoutException("The test did not release the held model.");
                    }
                    Assert.Equal(0UL, TauGeometryCapture.Counters(library)[4]);
                    modelCompleted.Set();
                    if (modelAlsoFails) throw modelError;
                }, host.DefaultLogFilePath, false, "", "");
            }
            catch (Exception error) { observedError = error; }
            finally
            {
                modelWasCompleteAtHostReturn = modelCompleted.IsSet;
                hostCompleted.Set();
            }
        }) { IsBackground = true };

        AppDomain.CurrentDomain.FirstChanceException += observePollFault;
        var started = false;
        try
        {
            thread.Start();
            started = true;
            Assert.True(pollFaultObserved.Wait(TimeSpan.FromSeconds(3)), "The hosting thread did not observe the injected poll fault.");
            // This is an assertion about a deliberately held model, after the actual fault was
            // observed. It does not sleep to infer when polling or the model has started.
            Assert.False(hostCompleted.Wait(TimeSpan.FromMilliseconds(100)), "The host returned while its model was held alive.");
            readRequested.Set();
            Assert.True(readCompleted.Wait(TimeSpan.FromSeconds(3)), "The held model did not finish its native read.");
            Assert.Null(readError);
            Assert.Equal(new float[] { 0, 0, 0, 1, 0, 0, 0, 1, 0 }, positions);
            Assert.Equal(new uint[] { 0, 1, 2 }, indices);
            Assert.False(hostCompleted.IsSet);
            releaseModel.Set();
            Assert.True(hostCompleted.Wait(TimeSpan.FromSeconds(3)), "The host did not finish after its model was released.");
            Assert.True(modelWasCompleteAtHostReturn);
            Assert.Same(firstError, observedError);
            Assert.Equal("controlled poll failure", observedError!.Message);
            // Poll, Viewer.Dispose -> backend.Complete, and the host's final EDI rethrow.
            Assert.True(firstErrorThrows >= 3, "The fixture did not exercise a failing viewer cleanup.");
            Assert.NotNull(library);
            Assert.Throws<ObjectDisposedException>(() => TauGeometryCapture.Counters(library!));
        }
        finally
        {
            var joined = !started;
            try
            {
                readRequested.Set();
                releaseModel.Set();
                if (started) joined = thread.Join(TimeSpan.FromSeconds(3));
            }
            finally { AppDomain.CurrentDomain.FirstChanceException -= observePollFault; }
            Assert.True(joined, "The controlled hosting thread leaked.");
        }
    }

    [Fact]
    public void CancellationKeepsItsErrorWhenViewerCleanupFailsAndStillReleasesLibrary()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        using var host = new HostedLibraryHost(Path.Combine(root, "cancel-cleanup-failure"), cancellation.Token);
        var cleanupError = new InvalidOperationException("controlled viewer cleanup failure");
        Library? library = null;
        var cleanupThrows = 0;
        var hostThreadId = Environment.CurrentManagedThreadId;
        EventHandler<FirstChanceExceptionEventArgs> observeCleanupFault = (_, args) =>
        {
            if (Environment.CurrentManagedThreadId == hostThreadId && ReferenceEquals(args.Exception, cleanupError))
                Interlocked.Increment(ref cleanupThrows);
        };
        AppDomain.CurrentDomain.FirstChanceException += observeCleanupFault;
        try
        {
            var error = Assert.Throws<OperationCanceledException>(() => host.Run(1f, () =>
            {
                library = Library.oLibrary();
                SetLifecyclePumpError(cleanupError);
            }, host.DefaultLogFilePath, false, "", ""));
            Assert.Equal(cancellation.Token, error.CancellationToken);
            Assert.True(cleanupThrows >= 1, "The fixture did not exercise a failing viewer cleanup.");
            Assert.NotNull(library);
            Assert.Throws<ObjectDisposedException>(() => TauGeometryCapture.Counters(library!));
        }
        finally { AppDomain.CurrentDomain.FirstChanceException -= observeCleanupFault; }
    }

    private static void SetLifecyclePumpError(Exception error)
    {
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var backend = (CaptureViewerBackend)typeof(Viewer).GetField("m_xBackend", flags)!
            .GetValue(Library.oViewer())!;
        typeof(CaptureViewerBackend).GetField("pumpError", flags)!
            .SetValue(backend, ExceptionDispatchInfo.Capture(error));
    }
}
