using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void OwnedVdbGetsAreIndependentCopiesOfTheFileGrid()
    {
        using var library = new Library(.4f);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 2f);
        using var original = source.TauAcquireGeometry();
        var sourceRecords = ScalarRecords(source);
        using var file = new OpenVdbFile(library);
        Assert.Equal(0, file.nAdd(source, "Source"));
        using var first = file.voxGet("Source");
        using var second = file.voxGet(0);
        using var old = first.TauAcquireGeometry();
        using var same = second.TauAcquireGeometry();
        // Identical copies keep one generation until either changes.
        Assert.Equal(old.Generation, same.Generation);
        using (var cut = Voxels.voxSphere(library, Vector3.Zero, 1f)) first.BoolSubtract(cut);
        using var changed = first.TauAcquireGeometry();
        using var untouched = second.TauAcquireGeometry();
        Assert.NotEqual(old.Generation, changed.Generation);
        Assert.Equal(old.Generation, untouched.Generation);
        Assert.NotEqual(sourceRecords, ScalarRecords(first));
        Assert.Equal(sourceRecords, ScalarRecords(second));
        using (var fileCopy = file.voxGet(0)) Assert.Equal(sourceRecords, ScalarRecords(fileCopy));
        // A scalar read re-classes and edits only its own copy, never the file's level set.
        using var scalar = file.oGetScalarField(0);
        scalar.SetValue(Vector3.Zero, 3f);
        Assert.Equal(OpenVdbFile.EFieldType.Voxels, file.eFieldType(0));
        using (var fileCopy = file.voxGet(0)) Assert.Equal(sourceRecords, ScalarRecords(fileCopy));
        using var afterScalar = second.TauAcquireGeometry();
        Assert.Equal(old.Generation, afterScalar.Generation);
        // Field metadata belongs to the copy.
        second.oMetaData().SetValue("Tau.Copy", "second");
        using (var fileCopy = file.voxGet(0)) Assert.False(fileCopy.oMetaData().bGetValueAt("Tau.Copy", out string _));
        file.Dispose();
        using var retained = first.TauAcquireGeometry();
        Assert.Equal(changed.Generation, retained.Generation);
        Assert.Equal(sourceRecords, ScalarRecords(second));
        using var unchanged = source.TauAcquireGeometry();
        Assert.Equal(original.Generation, unchanged.Generation);
    }

    [Fact]
    public void OwnedVdbCopiesCountTowardOwnedMemoryUntilDisposed()
    {
        using var library = new Library(.4f);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 4f);
        using var file = new OpenVdbFile(library);
        file.nAdd(source, "Source");
        // A read tags the file grid with its PicoGK.Class once; measure after that tag.
        using (file.voxGet(0)) { }
        var baseline = library.nTotalMemUsage();
        var copy = file.voxGet(0);
        var held = library.nTotalMemUsage();
        Assert.True(held - baseline >= source.nMemUsage() / 2, $"{held} - {baseline} vs source {source.nMemUsage()}");
        copy.Dispose();
        Assert.Equal(baseline, library.nTotalMemUsage());
        using (file.oGetScalarField(0)) { }
        baseline = library.nTotalMemUsage();
        var scalar = file.oGetScalarField(0);
        Assert.True(library.nTotalMemUsage() - baseline >= source.nMemUsage() / 2);
        scalar.Dispose();
        Assert.Equal(baseline, library.nTotalMemUsage());
    }

    [Fact]
    public void VdbSaveStampsTheFileGridsAndNotTheCopiesReadFromIt()
    {
        Directory.CreateDirectory(root);
        var path = Path.Combine(root, "stamped.vdb");
        using var library = new Library(.5f);
        using var sphere = Voxels.voxSphere(library, Vector3.Zero, 2f);
        var sphereRecords = ScalarRecords(sphere);
        using var scalar = new ScalarField(library);
        scalar.SetValue(Vector3.Zero, 1f);
        using var vector = new VectorField(library);
        vector.SetValue(Vector3.Zero, Vector3.UnitX);
        using (var output = new OpenVdbFile(library))
        {
            output.nAdd(sphere, "Sphere");
            output.nAdd(scalar, "Scalar");
            output.nAdd(vector, "Vector");
            using var copy = output.voxGet("Sphere");
            copy.oMetaData().SetValue("Tau.Copy", "edited");
            using (var cut = Voxels.voxSphere(library, Vector3.Zero, 1f)) copy.BoolSubtract(cut);
            output.SaveToFile(path);
            // Stamping edits the file's grids in place and leaves no copy behind.
            var stamped = library.nTotalMemUsage();
            output.SaveToFile(path);
            Assert.Equal(stamped, library.nTotalMemUsage());
            Assert.False(copy.oMetaData().bGetValueAt("PicoGK.VoxelSize", out float _));
        }
        using var input = new OpenVdbFile(library, path);
        Assert.True(input.bIsPicoGKCompatible());
        Assert.Equal(.5f, input.fPicoGKVoxelSizeMM());
        using var loadedSphere = input.voxGet("Sphere");
        using var loadedScalar = input.oGetScalarField("Scalar");
        using var loadedVector = input.oGetVectorField("Vector");
        foreach (var (field, kind) in new (IFieldWithMetadata, string)[]
            { (loadedSphere, "Voxels"), (loadedScalar, "ScalarField"), (loadedVector, "VectorField") })
        {
            var metadata = field.oMetaData();
            Assert.True(metadata.bGetValueAt("PicoGK.Library", out string name));
            Assert.Equal(Library.strName(), name);
            Assert.True(metadata.bGetValueAt("PicoGK.Version", out string version));
            Assert.Equal(Library.strVersion(), version);
            Assert.True(metadata.bGetValueAt("PicoGK.VoxelSize", out float size));
            Assert.Equal(library.fVoxelSize / 1000f, size);
            Assert.True(metadata.bGetValueAt("PicoGK.Class", out string type));
            Assert.Equal(kind, type);
            Assert.False(metadata.bGetValueAt("Tau.Copy", out string _));
        }
        Assert.Equal(sphereRecords, ScalarRecords(loadedSphere));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void MutatingCsgRejectsInvalidOwnersBeforeChangingEitherGrid(int operation)
    {
        using var library = new Library(1f);
        using var other = new Library(1f);
        using var target = Voxels.voxSphere(library, Vector3.Zero, 2f);
        using var foreign = new Voxels(other);
        using var disposed = new Voxels(library);
        disposed.Dispose();
        var before = ScalarRecords(target);
        void Mutate(Voxels left, Voxels right)
        {
            if (operation == 0) left.BoolAdd(voxOperand: right);
            else if (operation == 1) left.BoolSubtract(right);
            else left.BoolIntersect(voxOperand: right);
        }
        Assert.Throws<ArgumentNullException>(() => Mutate(target, null!));
        Assert.Throws<PicoGKLibraryMismatchException>(() => Mutate(target, foreign));
        Assert.Throws<ObjectDisposedException>(() => Mutate(target, disposed));
        Assert.Throws<ObjectDisposedException>(() => Mutate(disposed, target));
        Assert.Equal(before, ScalarRecords(target));
        Assert.True(foreign.bIsEmpty());
    }

    [Fact]
    public void VdbFieldAdmissionRejectsForeignDisposedAndNegativeInputs()
    {
        using var library = new Library(1f);
        using var other = new Library(1f);
        using var file = new OpenVdbFile(library);
        using var local = new ScalarField(library);
        using var foreign = new ScalarField(other);
        using var vector = new VectorField(other);
        Assert.Equal(0, file.nAdd(local, "Local"));
        Assert.Throws<PicoGKLibraryMismatchException>(() => file.nAdd(foreign));
        Assert.Throws<PicoGKLibraryMismatchException>(() => file.nAdd(vector));
        Assert.Equal(1, file.nFieldCount());
        Assert.Throws<ArgumentOutOfRangeException>(() => file.voxGet(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => file.oGetScalarField(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => file.strFieldName(-1));
        using var retained = file.oGetScalarField(0);
        file.Dispose();
        Assert.Throws<ObjectDisposedException>(() => file.oGetScalarField(0));
        retained.SetValue(Vector3.Zero, 2f);
        Assert.True(retained.bGetValue(Vector3.Zero, out var value));
        Assert.Equal(2f, value);
    }
}
