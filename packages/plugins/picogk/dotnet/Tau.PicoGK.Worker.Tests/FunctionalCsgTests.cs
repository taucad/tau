using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void FunctionalCsgPreservesOrderedFieldsAndIndependentOwnership(int operation)
    {
        using var library = new Library(.5f);
        using var left = Voxels.voxSphere(library, Vector3.Zero, 5);
        using var right = Voxels.voxSphere(library, new Vector3(3, 0, 0), 5);
        using var empty = new Voxels(library);
        left.oMetaData().SetValue("authored", "left");
        right.oMetaData().SetValue("authored", "right");
        var originalLeft = ScalarRecords(left);
        var originalRight = ScalarRecords(right);
        foreach (var operand in new[] { right, left, empty })
        {
            using var expected = new Voxels(left);
            if (operation == 0) expected.BoolAdd(operand);
            else if (operation == 1) expected.BoolSubtract(operand);
            else expected.BoolIntersect(operand);
            foreach (var useOperator in new[] { false, true })
            {
                using var actual = FunctionalCsg(left, operand, operation, useOperator);
                Assert.Equal(ScalarRecords(expected), ScalarRecords(actual));
                using var expectedField = new ScalarField(expected);
                using var actualField = new ScalarField(actual);
                for (var x = -12; x <= 12; x++)
                for (var y = -12; y <= 12; y++)
                for (var z = -12; z <= 12; z++)
                {
                    var point = new Vector3(x, y, z) * .5f;
                    Assert.Equal(expectedField.bGetValue(point, out var expectedValue), actualField.bGetValue(point, out var actualValue));
                    Assert.Equal(BitConverter.SingleToInt32Bits(expectedValue), BitConverter.SingleToInt32Bits(actualValue));
                }
                Assert.True(actual.oMetaData().bGetValueAt("authored", out string authored));
                Assert.Equal("left", authored);
                Assert.True(actual.oMetaData().bGetValueAt("PicoGK.Class", out string kind));
                Assert.Equal("Voxels", kind);
                actual.oMetaData().SetValue("authored", "result");
                Assert.True(left.oMetaData().bGetValueAt("authored", out string unchanged));
                Assert.Equal("left", unchanged);
                Assert.Equal(originalLeft, ScalarRecords(left));
                Assert.Equal(originalRight, ScalarRecords(right));
            }
        }
        using var source = new Voxels(left);
        using var retained = FunctionalCsg(source, right, operation, false);
        var snapshot = ScalarRecords(retained);
        source.BoolAdd(right);
        source.Dispose();
        right.BoolSubtract(left);
        right.Dispose();
        Assert.Equal(snapshot, ScalarRecords(retained));
    }

    [Fact]
    public void FunctionalCsgPreservesStaticCombineAndRejectsInvalidOwners()
    {
        using var library = new Library(1);
        using var otherLibrary = new Library(1);
        using var left = Voxels.voxSphere(library, Vector3.Zero, 3);
        using var right = Voxels.voxSphere(library, Vector3.UnitX, 3);
        using var foreign = new Voxels(otherLibrary);
        using var disposed = new Voxels(library);
        disposed.Dispose();
        using var expected = left.voxBoolAdd(right);
        using var combined = Voxels.voxCombine(left, right);
        Assert.Equal(ScalarRecords(expected), ScalarRecords(combined));
        for (var operation = 0; operation < 3; operation++)
        {
            Assert.Throws<ArgumentNullException>(() => FunctionalCsg(left, null!, operation, false));
            Assert.Throws<PicoGKLibraryMismatchException>(() => FunctionalCsg(left, foreign, operation, false));
            Assert.Throws<ObjectDisposedException>(() => FunctionalCsg(left, disposed, operation, false));
            Assert.Throws<ObjectDisposedException>(() => FunctionalCsg(disposed, left, operation, false));
        }
    }

    private static Voxels FunctionalCsg(Voxels left, Voxels right, int operation, bool useOperator) => operation switch
    {
        0 => useOperator ? left + right : left.voxBoolAdd(right),
        1 => useOperator ? left - right : left.voxBoolSubtract(right),
        _ => useOperator ? left & right : left.voxBoolIntersect(right),
    };
}
