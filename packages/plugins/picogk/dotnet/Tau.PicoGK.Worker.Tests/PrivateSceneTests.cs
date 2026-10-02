using System.Numerics;
using System.Security.Cryptography;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    private static float[] WorldPositions(ExtractedComponent component)
    {
        var result = new float[component.Positions.Length];
        for (var index = 0; index < result.Length; index += 3)
        {
            var point = Vector3.Transform(new Vector3(component.Positions[index], component.Positions[index + 1], component.Positions[index + 2]), component.Matrix);
            result[index] = point.X; result[index + 1] = point.Y; result[index + 2] = point.Z;
        }
        return result;
    }

    private static float[] WorldDirections(float[] values, Matrix4x4 matrix, int stride)
    {
        var result = (float[])values.Clone();
        for (var index = 0; index < values.Length; index += stride)
        {
            var direction = Vector3.Normalize(Vector3.TransformNormal(new Vector3(values[index], values[index+1], values[index+2]),matrix));
            result[index] = direction.X; result[index+1] = direction.Y; result[index+2] = direction.Z;
        }
        return result;
    }

    private static void AssertFloat32ForwardError(float[] expected, float[] actual, int operations)
    {
        Assert.Equal(expected.Length,actual.Length);
        var gamma = operations / (double)(1 << 24) / (1 - operations / (double)(1 << 24));
        var magnitude = expected.Concat(actual).Select(value => Math.Abs((double)value)).DefaultIfEmpty().Max();
        for (var index=0;index<expected.Length;index++) Assert.True(Math.Abs((double)expected[index]-actual[index]) <= gamma*magnitude,
            $"Float32 ordered-operation error exceeded gamma({operations}) at {index}.");
    }

    [Fact]
    public void ScenePacksOnePrototypeAndOrderedOccurrencesAndNarrowIndices()
    {
        float[] positions = [0,0,0,1,0,0,0,1,0]; uint[] indices = [0,1,2];
        var normals = ModelRunner.VertexNormals(ref positions, ref indices);
        var first = new ExtractedComponent("component:picogk-1", "triangles", "first", [1,0,0,1], 0, 1, positions, normals, indices);
        var second = first with { Id = "component:picogk-2", Name = "second", Matrix = Matrix4x4.CreateTranslation(10,20,30), Color = [0,1,0,1] };
        var result = MeshArtifactWriter.Write(root, new ModelExecutionResult([first, second],0,false,new ModelTimings(0,0,0,0,0,0),null,[]), new WorkerDiagnostics(new WorkerTimings(false,0,0,0,0,0,0,0,0,0,0,0),new WorkerMetrics(0,0,0)));
        Assert.Single(result.Prototypes); Assert.Equal(2, result.Occurrences.Count);
        Assert.Equal(result.Occurrences[0].PrototypeId,result.Occurrences[1].PrototypeId);
        Assert.Equal(new[]{"first","second"},result.Occurrences.Select(o=>o.Name));
        Assert.Equal(5123,result.Prototypes[0].IndexComponentType);
        Assert.Equal(80,result.ByteLength); Assert.Equal(10,result.Occurrences[1].Matrix[12]);
        Assert.Equal(Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(result.ArtifactPath))).ToLowerInvariant(),result.Sha256);
        var large = first with { Positions = new float[65536*3], Normals = new float[65536*3], Indices = [0,1,65535] };
        var wide = MeshArtifactWriter.Write(root,new ModelExecutionResult([large],0,false,new ModelTimings(0,0,0,0,0,0),null,[]),new WorkerDiagnostics(new WorkerTimings(false,0,0,0,0,0,0,0,0,0,0,0),new WorkerMetrics(0,0,0)));
        Assert.Equal(5125,Assert.Single(wide.Prototypes).IndexComponentType);
        var threshold = large with { Indices = [0,1,65534] };
        var narrow = MeshArtifactWriter.Write(root,new ModelExecutionResult([threshold],0,false,new ModelTimings(0,0,0,0,0,0),null,[]),new WorkerDiagnostics(new WorkerTimings(false,0,0,0,0,0,0,0,0,0,0,0),new WorkerMetrics(0,0,0)));
        Assert.Equal(5123,Assert.Single(narrow.Prototypes).IndexComponentType);
    }

    [Fact]
    public void SceneWriterRejectsInvalidGeometryAndDuplicateOccurrences()
    {
        var valid = new ExtractedComponent("component:picogk-1", "triangles", "name", [1,0,0,1],0,1,[0,0,0,1,0,0,0,1,0],[0,0,1,0,0,1,0,0,1],[0,1,2]);
        BuildResult Write(params ExtractedComponent[] values) => MeshArtifactWriter.Write(root,new ModelExecutionResult(values,0,false,new ModelTimings(0,0,0,0,0,0),null,[]),new WorkerDiagnostics(new WorkerTimings(false,0,0,0,0,0,0,0,0,0,0,0),new WorkerMetrics(0,0,0)));
        Assert.Throws<InvalidDataException>(()=>Write(valid,valid));
        Assert.Throws<InvalidDataException>(()=>Write(valid with { Indices = [0,1,3] }));
        Assert.Throws<InvalidDataException>(()=>Write(valid with { Id = "invalid" }));
    }

    [Fact]
    public void SceneLayoutBudgetRejectsUnboundedVariantsAndReleasesOwnedArrays()
    {
        using var library = new Library(1f); Library.RegisterGlobalLibrary(library);
        try
        {
            using var backend = new CaptureViewerBackend(root); using var mesh = Utils.mshCreateCube(Vector3.One);
            backend.Add(mesh,0);
            var field = typeof(CaptureViewerBackend).GetField("layoutBytes",System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!;
            field.SetValue(backend,256L*1024*1024);
            Assert.Throws<WorkerException>(()=>backend.Extract());
            field.SetValue(backend,0L); Assert.Single(backend.Extract().Components);
            Assert.True((long)field.GetValue(backend)! > 0);
            backend.RemoveAllObjects(); Assert.Empty(backend.Extract().Components);
            Assert.Equal(0L,(long)field.GetValue(backend)!);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }

    [Fact]
    public void SceneTranslationSharesLayoutAndUnsafeTransformsBake()
    {
        using var library = new Library(1f); Library.RegisterGlobalLibrary(library);
        try
        {
            using var backend = new CaptureViewerBackend(root);
            using var mesh = Utils.mshCreateCube(new Vector3(2,4,6));
            backend.Add(mesh,"first",0);
            using var second = mesh.mshCreateTransformed(Vector3.One,Vector3.Zero); backend.Add(second,"second",0); backend.SetObjectMatrix(second,Matrix4x4.CreateTranslation(10,0,0));
            var scene = backend.Extract();
            Assert.Same(scene.Components[0].Positions,scene.Components[1].Positions);
            Assert.Same(scene.Components[0].Normals,scene.Components[1].Normals);
            Assert.Same(scene.Components[0].PrototypeIdentity,scene.Components[1].PrototypeIdentity);
            Assert.Equal(1,scene.WorkCounters!.GeometryReadbacks); Assert.Equal(1,scene.WorkCounters.NormalLayouts);
            Assert.Equal(9,WorldPositions(scene.Components[1]).Where((_,i)=>i%3==0).Min());
            backend.SetObjectMatrix(second,Matrix4x4.CreateScale(2,1,1));
            var scaled = backend.Extract(); Assert.NotSame(scaled.Components[0].Positions,scaled.Components[1].Positions);
            Assert.Equal(Matrix4x4.Identity,scaled.Components[1].Matrix);
            Assert.Equal(2,scaled.WorkCounters!.NormalLayouts);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }
}
