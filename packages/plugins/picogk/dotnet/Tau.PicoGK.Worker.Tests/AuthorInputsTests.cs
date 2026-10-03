using System.Text.Json;
using System.Text.Json.Serialization;
using System.Runtime.CompilerServices;
using System.Numerics;
using PicoGK;
using SkiaSharp;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;
public sealed partial class WorkerTests
{
    private sealed class IgnoreProbe
    {
        public readonly List<string> Calls = [];
        [JsonIgnore] public int Always { get { Calls.Add("Always"); throw new Exception("must not evaluate"); } }
        [JsonIgnore(Condition = JsonIgnoreCondition.Never)] public int Never { get { Calls.Add("Never"); return 0; } }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string? Null { get { Calls.Add("Null"); return null; } }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public int Zero { get { Calls.Add("Zero"); return 0; } }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public int Nonzero { get { Calls.Add("Nonzero"); return 4; } }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public int? NullableZero { get { Calls.Add("NullableZero"); return 0; } }
        [JsonPropertyName("length")] public string Annotated { get { Calls.Add("Annotated"); return "mm"; } }
        public int this[int index] => throw new Exception();
        public int WriteOnly { set { } }
        public int PrivateGetter { private get; set; }
    }
    private sealed class AmbiguousProbe
    {
        public int Calls;
        public object units { get { Calls++; return new { length = "mm" }; } }
        public object Units { get { Calls++; return new { Length = "mm" }; } }
    }
    private sealed class AnnotatedAmbiguousProbe
    {
        public int Calls;
        [JsonPropertyName("units")] public object Alternative { get { Calls++; return new {}; } }
        public object Units { get { Calls++; return new {}; } }
    }
    private sealed class VersionProbe(object? version) { public object? SchemaVersion => version; }
    private readonly struct DefaultProbe : IEquatable<DefaultProbe>
    {
        public static int Constructors, Comparisons;
        public readonly int Value;
        public DefaultProbe() { Constructors++; Value = 9; }
        public bool Equals(DefaultProbe other) { Comparisons++; return Value == other.Value; }
        public override bool Equals(object? value) => value is DefaultProbe other && Equals(other);
        public override int GetHashCode() => Value;
    }
    private sealed class DefaultOwner
    {
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public DefaultProbe Zero => default;
    }
    private sealed class CriticalProbe(Exception error) { public int Value => throw error; }
    private readonly struct CriticalDefault : IEquatable<CriticalDefault>
    {
        public bool Equals(CriticalDefault other) => throw new OperationCanceledException("default callback");
        public override bool Equals(object? value) => value is CriticalDefault other && Equals(other);
        public override int GetHashCode() => 0;
    }
    private sealed class CriticalDefaultOwner { [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public CriticalDefault Value => default; }
    private sealed class BlockingProbe(ManualResetEventSlim entered, ManualResetEventSlim release)
    {
        public int Value { get { entered.Set(); release.Wait(); return 1; } }
    }

    [Fact]
    public void AuthorStructuralAliasesPreserveExactOpaqueValuesAndDynamicIds()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "structural"));
        var detail = new IgnoreProbe();
        var coordinates = new Dictionary<string, int> { ["Hinge/XAxis"] = 3 };
        backend.SetMechanism(new {
            Units = new { Length = "mm", Angle = "deg" }, Root = "Base/ID",
            Links = new Dictionary<string, object> { ["Base/ID"] = new { Shapes = new[] { "Base" } }, ["Lid.ID"] = new { Components = new[] { "component:2" } } },
            Joints = new Dictionary<string, object> { ["Hinge/XAxis"] = new { Name="Hinge", Type="planar", Parent="Base/ID", Child="Lid.ID", Origin=new[]{0,0,4}, Normal=new[]{0,0,1}, XAxis=new[]{1,0,0}, Limits=new { X=new { Lower=-2,Upper=2 }, Y=new { Lower=-3,Upper=3 }, Angle=new {Lower=-4,Upper=4} } } },
            Couplings = new[] { new { Driver="Hinge/XAxis", Follower="follower", Ratio=2, Offset=1, Curve=new { DriverPeriod=3,Values=new[]{0,1} } } },
            Animations = new[] { new { Id="Open",Name="Open",Duration=2,Loop="none",Keyframes=new[]{new{Time=0,Coordinates=coordinates}} } },
            details = new { Value=detail, Repeated=detail }
        });
        coordinates["Hinge/XAxis"] = 99;
        var json = backend.Extract().Mechanism!.Value;
        Assert.Equal(1,json.GetProperty("schemaVersion").GetInt32());
        Assert.Equal("mm",json.GetProperty("units").GetProperty("length").GetString());
        Assert.Equal("Base",json.GetProperty("links").GetProperty("Base/ID").GetProperty("shapes")[0].GetString());
        var joint=json.GetProperty("joints").GetProperty("Hinge/XAxis");
        Assert.Equal(1,joint.GetProperty("xAxis")[0].GetInt32());
        Assert.Equal(-3,joint.GetProperty("limits").GetProperty("y").GetProperty("lower").GetInt32());
        Assert.Equal(3,json.GetProperty("couplings")[0].GetProperty("curve").GetProperty("driverPeriod").GetInt32());
        Assert.Equal(3,json.GetProperty("animations")[0].GetProperty("keyframes")[0].GetProperty("coordinates").GetProperty("Hinge/XAxis").GetInt32());
        var opaque=json.GetProperty("details").GetProperty("Value");
        Assert.Equal(0,opaque.GetProperty("Never").GetInt32());
        Assert.Equal(4,opaque.GetProperty("Nonzero").GetInt32());
        Assert.Equal(0,opaque.GetProperty("NullableZero").GetInt32());
        Assert.Equal("mm",opaque.GetProperty("length").GetString());
        foreach(var omitted in new[]{"Always","Null","Zero","Calls","PrivateGetter","WriteOnly"}) Assert.False(opaque.TryGetProperty(omitted,out _));
        Assert.Equal(new[]{"Never","Null","Zero","Nonzero","NullableZero","Annotated","Never","Null","Zero","Nonzero","NullableZero","Annotated"},detail.Calls);
        _=backend.Extract(); Assert.Equal(12,detail.Calls.Count);
        backend.SetMechanism(new Dictionary<string,object>{["Units"]=new{Length="mm"},["ID/UPPER"]=new{Value=2}});
        var exact=backend.Extract().Mechanism!.Value;
        Assert.False(exact.TryGetProperty("schemaVersion",out _));
        Assert.Equal("mm",exact.GetProperty("Units").GetProperty("Length").GetString());
        Assert.Equal(2,exact.GetProperty("ID/UPPER").GetProperty("Value").GetInt32());
        using var raw=JsonDocument.Parse("{\"Units\":{\"Length\":\"mm\"},\"details\":{\"Value\":7}}");
        backend.SetMechanism(raw.RootElement);raw.Dispose();
        Assert.Equal("{\"Units\":{\"Length\":\"mm\"},\"details\":{\"Value\":7}}",backend.Extract().Mechanism!.Value.GetRawText());
        backend.SetMechanism(System.Text.Json.Nodes.JsonNode.Parse("{\"SchemaVersion\":2}")!);
        Assert.Equal("{\"SchemaVersion\":2}",backend.Extract().Mechanism!.Value.GetRawText());
    }

    [Fact]
    public async Task AuthorAmbiguityVersionsDefaultsAndCriticalFailuresAreDeterministic()
    {
        using var backend=new CaptureViewerBackend(Path.Combine(root,"versions"));
        var a=new AmbiguousProbe(); backend.SetMechanism(a);
        Assert.Null(backend.Extract().Mechanism); Assert.Equal(0,a.Calls);
        Assert.Contains("Ambiguous mechanism field 'units' from properties 'Units' and 'units'",backend.Extract().Warnings[0].Message);
        var b=new AnnotatedAmbiguousProbe(); backend.SetMechanism(b); Assert.Equal(0,b.Calls);
        foreach(var version in new object?[]{0,2,"1",null}) {backend.SetMechanism(new VersionProbe(version));Assert.Null(backend.Extract().Mechanism);}
        backend.SetMechanism(new VersionProbe(1)); Assert.Equal(1,backend.Extract().Mechanism!.Value.GetProperty("schemaVersion").GetInt32());
        DefaultProbe.Constructors=DefaultProbe.Comparisons=0;
        backend.SetMechanism(new DefaultOwner()); Assert.Equal(0,DefaultProbe.Constructors);Assert.Equal(1,DefaultProbe.Comparisons);
        Assert.False(backend.Extract().Mechanism!.Value.TryGetProperty("Zero",out _));
        Assert.Throws<OperationCanceledException>(()=>backend.SetMechanism(new CriticalProbe(new OperationCanceledException("callback"))));
        Assert.Throws<OutOfMemoryException>(()=>backend.SetMechanism(new CriticalProbe(new OutOfMemoryException("callback"))));
        Assert.Throws<OperationCanceledException>(()=>backend.SetMechanism(new CriticalDefaultOwner()));
        using var entered=new ManualResetEventSlim();using var release=new ManualResetEventSlim();
        var task=Task.Run(()=>Assert.Throws<OperationCanceledException>(()=>backend.SetMechanism(new BlockingProbe(entered,release))));
        try { Assert.True(entered.Wait(TimeSpan.FromSeconds(10))); backend.Cancel(); }
        finally { release.Set(); }
        await task.WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Throws<OperationCanceledException>(()=>backend.SetGroupMaterial(0,new Material{ColorTexture=new(){Image=new(){Data=MaterialPng}}}));
        using var cancellation=new CancellationTokenSource();cancellation.Cancel();
        Assert.Throws<OperationCanceledException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=[]}}},0,out _,cancellation.Token));
    }

    private static byte[] EncodeImage(SKEncodedImageFormat format)
    {
        using var bitmap=new SKBitmap(2,2);bitmap.Erase(SKColors.Coral);
        using var image=SKImage.FromBitmap(bitmap);using var data=image.Encode(format,90);
        Assert.NotNull(data);return data.ToArray();
    }

    private static byte[] AnimatedWebp(byte[] encoded, bool corruptLast)
    {
        using var body=new MemoryStream();using var writer=new BinaryWriter(body);
        writer.Write("WEBP"u8);
        void Chunk(string type,byte[] data){writer.Write(System.Text.Encoding.ASCII.GetBytes(type));writer.Write((uint)data.Length);writer.Write(data);if((data.Length&1)!=0)writer.Write((byte)0);}
        Chunk("VP8X",[2,0,0,0,1,0,0,1,0,0]);Chunk("ANIM",new byte[6]);
        for(var frame=0;frame<2;frame++){
            var payload=encoded[12..];if(frame==1&&corruptLast)payload=payload[..(payload.Length/2)];
            // 2 × 2 complete frame at origin, 1ms duration, no blending.
            Chunk("ANMF",new byte[]{0,0,0,0,0,0,1,0,0,1,0,0,1,0,0,2}.Concat(payload).ToArray());
        }
        using var output=new MemoryStream();using var outer=new BinaryWriter(output);outer.Write("RIFF"u8);outer.Write((uint)body.Length);outer.Write(body.ToArray());return output.ToArray();
    }

    [Fact]
    public void AuthorAutomaticImagesValidateActualCodecsAndOwnership()
    {
        Assert.Equal(-1,(int)MaterialImageFormat.Auto);Assert.Equal(0,(int)default(MaterialImageFormat));Assert.Equal(1,(int)MaterialImageFormat.Jpeg);Assert.Equal(2,(int)MaterialImageFormat.WebP);
        foreach(var (encoded,expected) in new[]{(SKEncodedImageFormat.Png,MaterialImageFormat.Png),(SKEncodedImageFormat.Jpeg,MaterialImageFormat.Jpeg),(SKEncodedImageFormat.Webp,MaterialImageFormat.WebP)})
        {
            var bytes=EncodeImage(encoded);
            var texture=new MaterialTexture{Image=new MaterialImage{Data=bytes}};
            Assert.Equal(MaterialImageFormat.Auto,texture.Image.Format);
            var snapshot=MaterialCapture.Snapshot(new Material{ColorTexture=texture,NormalTexture=texture},3);
            Assert.Equal(expected,snapshot.ColorTexture!.Image.Format);Assert.NotSame(bytes,snapshot.ColorTexture.Image.Data);Assert.Same(snapshot.ColorTexture.Image.Data,snapshot.NormalTexture!.Image.Data);
            Assert.Equal(bytes,snapshot.ColorTexture.Image.Data);
            var explicitSnapshot=MaterialCapture.Snapshot(new Material{ColorTexture=texture with {Image=texture.Image with{Format=expected}}},3);
            Assert.Equal(expected,explicitSnapshot.ColorTexture!.Image.Format);
            var resources=new MaterialResources();_=MaterialCapture.Project(snapshot,resources);Assert.Single(resources.Images);Assert.Single(resources.Textures);
            bytes[0]=0;Assert.NotEqual(bytes[0],snapshot.ColorTexture.Image.Data[0]);
            var mismatch=expected==MaterialImageFormat.Png?MaterialImageFormat.Jpeg:MaterialImageFormat.Png;
            var error=Assert.Throws<WorkerException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=snapshot.ColorTexture.Image.Data,Format=mismatch}}},3));
            Assert.Contains("Group 3: PicoGK material ColorTexture.Image.Data does not match",error.Issues[0].Message);
            foreach(var bad in new[]{snapshot.ColorTexture.Image.Data[..12],snapshot.ColorTexture.Image.Data[..(snapshot.ColorTexture.Image.Data.Length/2)],snapshot.ColorTexture.Image.Data[..^1],Array.Empty<byte>()})
                Assert.Throws<WorkerException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=bad}}},3));
        }
        var animated=AnimatedWebp(EncodeImage(SKEncodedImageFormat.Webp),false);
        using(var codec=SKCodec.Create(new MemoryStream(animated,false)))Assert.Equal(2,codec.FrameCount);
        _=MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=animated}}},0);
        Assert.Throws<WorkerException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=AnimatedWebp(EncodeImage(SKEncodedImageFormat.Webp),true)}}},0));
        Assert.Throws<WorkerException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=Convert.FromBase64String("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==")}}},0));
        var huge=EncodeImage(SKEncodedImageFormat.Png);
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(huge.AsSpan(16),100000);
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(huge.AsSpan(20),100000);
        uint crc=uint.MaxValue;foreach(var value in huge.AsSpan(12,17)){crc^=value;for(var bit=0;bit<8;bit++)crc=(crc&1)==0?crc>>1:(crc>>1)^0xedb88320;}
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(huge.AsSpan(29),~crc);
        var bound=Assert.Throws<WorkerException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=huge}}},7));
        Assert.Contains("decoded RGBA image must fit within 256 MiB",bound.Issues[0].Message);
        Assert.Throws<WorkerException>(()=>MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=MaterialPng,Format=(MaterialImageFormat)99}}},0));
        _=MaterialCapture.Snapshot(new Material{ColorTexture=new(){Image=new(){Data=MaterialPng}}},7);
        var native=(Viewer)RuntimeHelpers.GetUninitializedObject(typeof(Viewer));GC.SuppressFinalize(native);
        Assert.Throws<NotSupportedException>(()=>native.SetMechanism(new{}));
    }


    [Fact]
    public void AuthorMaterialRequiredInitAndLegacyNamesCompileAtActualBoundary()
    {
        Write("main.cs", """
using PicoGK;
var inferred=new MaterialImage{Data=new byte[]{1}};
var explicitOld=new MaterialImage{Data=new byte[]{1},Format=default(MaterialImageFormat)};
var replaced=inferred with{Data=new byte[]{2}};
void Existing(Viewer viewer,Mesh mesh){viewer.Add(mesh,nGroupID:2);viewer.SetGroupMaterial(nGroupID:2,clr:new ColorFloat("ff0000"),fMetallic:0,fRoughness:1);viewer.SetGroupMaterial(groupId:2,material:new Material());}
Console.WriteLine((int)inferred.Format);
""");
        _=CompilationService.Compile(root,"main.cs");
        foreach(var (source,code) in new[]{
            ("var image=new PicoGK.MaterialImage();","CS9035"),
            ("var image=new PicoGK.MaterialImage{Data=new byte[]{1}};image.Format=PicoGK.MaterialImageFormat.Jpeg;","CS8852"),
            ("var image=new PicoGK.MaterialImage{Data=new byte[]{1}};image.Data=new byte[]{2};","CS8852"),
            ("var image=new PicoGK.MaterialImage{Data=new byte[]{1},Format=null};","CS0037"),
            ("void Call(PicoGK.Viewer viewer){viewer.SetGroupMaterial(nGroupID:2,oMaterial:new PicoGK.Material());}","CS1739")})
        {
            Write("main.cs",source);var failure=Assert.Throws<WorkerException>(()=>CompilationService.Compile(root,"main.cs"));
            Assert.Contains(failure.Issues,issue=>issue.Code==code);
        }
    }


    [Fact]
    public void AuthorImageAndMechanismFailuresRecoverAtTheActualViewerBoundary()
    {
        using var library=new Library(1f);using var mesh=new Mesh(library);mesh.nAddTriangle(Vector3.Zero,Vector3.UnitX,Vector3.UnitY);
        using var backend=new CaptureViewerBackend(Path.Combine(root,"setter-recovery"));backend.Add(mesh,"Kept/ID",7);
        backend.SetGroupMaterial(7,new Material{ColorTexture=new(){Image=new(){Data=MaterialPng.ToArray()}}});
        backend.SetMechanism(new{Units=new{Length="mm",Angle="deg"}});
        var first=backend.Extract();var id=Assert.Single(first.Components).Id;var geometry=first.Components[0].Positions;
        var invalid=Assert.Throws<WorkerException>(()=>backend.SetGroupMaterial(7,new Material{ColorTexture=new(){Image=new(){Data=MaterialPng[..12]}}}));
        Assert.Contains("Group 7: PicoGK material ColorTexture.Image.Data",invalid.Issues[0].Message);
        var retained=backend.Extract();Assert.Equal(id,Assert.Single(retained.Components).Id);Assert.Equal(geometry,retained.Components[0].Positions);Assert.Equal(MaterialPng,Assert.Single(retained.Resources!.Images).Data);
        backend.SetMechanism(new VersionProbe(2));var failed=backend.Extract();Assert.Null(failed.Mechanism);Assert.Equal(id,Assert.Single(failed.Components).Id);Assert.Equal("CS_TAU_MECHANISM_SERIALIZATION",Assert.Single(failed.Warnings).Code);
        backend.SetGroupMaterial(7,new Material{ColorTexture=new(){Image=new(){Data=EncodeImage(SKEncodedImageFormat.Jpeg)}}});backend.SetMechanism(new VersionProbe(1));
        var recovered=backend.Extract();Assert.Equal(id,Assert.Single(recovered.Components).Id);Assert.Equal(geometry,recovered.Components[0].Positions);Assert.Equal("image/jpeg",Assert.Single(recovered.Resources!.Images).MimeType);Assert.Equal(1,recovered.Mechanism!.Value.GetProperty("schemaVersion").GetInt32());
    }


    [Fact]
    public void AuthorTypedCompilerExportAndCollectibility()
    {
        Write("main.cs","""
using System.Numerics;
using System.Text.Json.Serialization;
using PicoGK;
Library.Go(1f,()=>{
    var viewer=Library.oViewer();
    using var baseMesh=Utils.mshCreateCube(new BBox3(0,0,0,60,40,4));
    using var lidMesh=Utils.mshCreateCube(new BBox3(0,0,4,60,40,7));
    viewer.Add(baseMesh,"Base",nGroupID:0);viewer.Add(lidMesh,"Lid",nGroupID:1);
    viewer.SetGroupMaterial(groupId:0,material:new Material{ColorTexture=new(){Image=new(){Data=Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=")}}});
    viewer.SetMechanism(new{Units=new Units(),Root="BaseLink",Links=new Dictionary<string,object>{["BaseLink"]=new{Shapes=new[]{"Base"}},["LidLink"]=new{Shapes=new[]{"Lid"}}},Joints=new Dictionary<string,object>{["Lid/Hinge"]=new{Type="revolute",Parent="BaseLink",Child="LidLink",Origin=new[]{0,0,4},Axis=new[]{1,0,0},Limits=new{Lower=0,Upper=110}}},Animations=new[]{new{Id="open",Duration=2,Loop="pingPong",Keyframes=new[]{new{Time=0,Coordinates=new Dictionary<string,int>{["Lid/Hinge"]=0}},new{Time=2,Coordinates=new Dictionary<string,int>{["Lid/Hinge"]=110}}}}}});
});
public sealed record Units{
 [JsonPropertyName("length"), JsonConverter(typeof(ForbiddenConverter))] public string Length=>"mm";
 [JsonPropertyName("angle")] public string Angle=>"deg";
 [JsonIgnore] public string AuthorNote=>throw new Exception();
 [JsonIgnore(Condition=JsonIgnoreCondition.WhenWritingDefault)]public Empty Value=>default;
}
public readonly struct Empty:IEquatable<Empty>{public bool Equals(Empty other)=>true;public override bool Equals(object? value)=>value is Empty;public override int GetHashCode()=>0;}
public sealed class ForbiddenConverter:JsonConverter<string>{
 public ForbiddenConverter()=>throw new Exception("converter must not be created");
 public override string Read(ref System.Text.Json.Utf8JsonReader reader,Type type,System.Text.Json.JsonSerializerOptions options)=>throw new Exception();
 public override void Write(System.Text.Json.Utf8JsonWriter writer,string value,System.Text.Json.JsonSerializerOptions options)=>throw new Exception();
}
""");
        var result=ModelRunner.Execute(CompilationService.Compile(root,"main.cs"),Path.Combine(root,"typed-artifact"));
        Assert.Equal(new[]{"Base","Lid"},result.Components.Select(c=>c.Name));Assert.Equal(2,result.Components.Select(c=>c.Id).Distinct().Count());Assert.Empty(result.Warnings);
        Assert.Equal("mm",result.Mechanism!.Value.GetProperty("units").GetProperty("length").GetString());Assert.Single(result.Resources!.Images);
        var target=Path.Combine(root,"glb-fixture");Directory.CreateDirectory(target);
        var artifact=MeshArtifactWriter.Write(target,result,new WorkerDiagnostics(new WorkerTimings(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),new WorkerMetrics(0,0,0)));
        File.WriteAllText(Path.Combine(target,"build.json"),JsonSerializer.Serialize(artifact,new JsonSerializerOptions{PropertyNamingPolicy=JsonNamingPolicy.CamelCase}));
        Write("main.cs","using PicoGK; Library.Go(1f,()=>{});");
        var next=ModelRunner.Execute(CompilationService.Compile(root,"main.cs"),Path.Combine(root,"unloaded-artifact"));Assert.False(next.RecycleAfterResponse);
    }
}
