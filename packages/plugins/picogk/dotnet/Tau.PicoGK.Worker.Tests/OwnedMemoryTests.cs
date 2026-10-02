using System.Numerics;
using System.Reflection;
using System.Runtime.InteropServices;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void OwnedMemoryIncludesGridsRetainedOnlyByMetadata()
    {
        using var library = new Library(1f);
        using var voxels = new Voxels(library, new ImportSphere(), new BBox3(new Vector3(-8), new Vector3(8)));
        using var metadata = new FieldMetadata(library, FieldMetadata._hFromVoxels(library.hThis, voxels.hThis));
        var gridBytes = voxels.nMemUsage();
        Assert.True(gridBytes > 100_000);
        Assert.True(library.nTotalMemUsage() >= gridBytes);
        voxels.Dispose();
        Assert.Equal(0, library.nVoxelsAllocated());
        Assert.True(library.nVdbMetasMemUsage() > 100_000);
        Assert.True(library.nTotalMemUsage() > 100_000);
        metadata.Dispose();
        Assert.True(library.nTotalMemUsage() < 100_000);
        var error = Assert.Throws<ObjectDisposedException>(() => voxels.nMemUsage());
        Assert.Equal(nameof(Voxels), error.ObjectName);
    }

    [Fact]
    public void MemoryPressureTracksOwnedStorageAndBalancesOnDispose()
    {
        using var library = new Library(1f);
        using var voxels = new Voxels(library, new ImportSphere(), new BBox3(new Vector3(-8), new Vector3(8)));
        const BindingFlags flags = BindingFlags.Instance | BindingFlags.NonPublic;
        var monitor = typeof(Library).GetMethod("MonitorMemory", flags)!;
        var pressure = typeof(Library).GetField("m_nUsedMemory", flags)!;
        monitor.Invoke(library, null);
        Assert.Equal(library.nTotalMemUsage(), (long)pressure.GetValue(library)!);
        var allocated = (long)pressure.GetValue(library)!;
        voxels.Dispose();
        monitor.Invoke(library, null);
        Assert.Equal(library.nTotalMemUsage(), (long)pressure.GetValue(library)!);
        Assert.True((long)pressure.GetValue(library)! < allocated);
        library.Dispose();
        Assert.Equal(0L, pressure.GetValue(library));
        monitor.Invoke(library, null);
        Assert.Equal(0L, pressure.GetValue(library));
        var error = Assert.Throws<ObjectDisposedException>(() => library.nTotalMemUsage());
        Assert.Equal(nameof(Library), error.ObjectName);
    }

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int OwnedMemoryQuery(long library, int category, out long bytes);

    [UnmanagedFunctionPointer(CallingConvention.Cdecl)]
    private delegate int OwnedMemoryNullQuery(long library, int category, IntPtr bytes);

    [Fact]
    public void OwnedMemoryStatusRejectsInvalidQueriesWithoutPublishingBytes()
    {
        using var library = new Library(1f);
        var native = NativeLibrary.Load("picogk.26.2.dylib", typeof(Library).Assembly, null);
        try
        {
            var address = NativeLibrary.GetExport(native, "TauLibrary_GetOwnedMemory");
            var query = Marshal.GetDelegateForFunctionPointer<OwnedMemoryQuery>(address);
            var nullQuery = Marshal.GetDelegateForFunctionPointer<OwnedMemoryNullQuery>(address);
            Assert.Equal(-1, query(library.hThis.Value, -1, out var bytes));
            Assert.Equal(0L, bytes);
            Assert.Equal(-1, query(library.hThis.Value, 9, out bytes));
            Assert.Equal(0L, bytes);
            Assert.Equal(-1, nullQuery(library.hThis.Value, 0, IntPtr.Zero));
            Assert.Equal(0, query(library.hThis.Value, 0, out bytes));
            Assert.Equal(library.nTotalMemUsage(), bytes);
            library.Dispose();
            Assert.Equal(-3, query(library.hThis.Value, 0, out bytes));
            Assert.Equal(0L, bytes);
        }
        finally { NativeLibrary.Free(native); }
    }
}
