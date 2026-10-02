using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using PicoGK;
using Xunit;
namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void MetadataDeclarationsPreserveReadonlyRefAndAccessorVisibility()
    {
        var trusted=((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!).Split(Path.PathSeparator)
            .Select(path=>MetadataReference.CreateFromFile(path)).ToArray();
        var compilation=CSharpCompilation.Create("MetadataDeclarations",[CSharpSyntaxTree.ParseText("""
            public readonly struct ReadonlyValue { }
            public ref struct BorrowedValue { }
            public interface Contract { }
            public enum Mode { First }
            public abstract class AbstractValue { }
            public sealed class ClosedValue { }
            public record RecordValue;
            public readonly record struct RecordStructValue;
            public class Accessors {
                public int this[int index] { get => 1; private set { } }
                public int Local { get; private set; }
                public int Family { get; protected internal set; }
                public int Narrow { get; private protected set; }
                public required string Name { get; init; }
            }
            """)],trusted,new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        using var bytes=new MemoryStream();var emitted=compilation.Emit(bytes);
        Assert.True(emitted.Success,string.Join("\n",emitted.Diagnostics));
        var reader=CSharpCompilation.Create("ReadMetadata",references:trusted.Append(MetadataReference.CreateFromImage(bytes.ToArray())),
            options:new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary,metadataImportOptions:MetadataImportOptions.All));
        var typeMethod=typeof(ApiExtraction).GetMethod("TypeDeclaration",BindingFlags.NonPublic|BindingFlags.Static)!;
        string Type(string name)=>(string)typeMethod.Invoke(null,[reader.GetTypeByMetadataName(name)!])!;
        Assert.Contains("readonly struct ReadonlyValue",Type("ReadonlyValue"));
        Assert.Contains("ref struct BorrowedValue",Type("BorrowedValue"));
        Assert.Equal("public interface Contract",Type("Contract"));
        Assert.Equal("public enum Mode",Type("Mode"));
        Assert.Equal("public abstract class AbstractValue",Type("AbstractValue"));
        Assert.Equal("public sealed class ClosedValue",Type("ClosedValue"));
        Assert.Contains("record class RecordValue",Type("RecordValue"));
        Assert.Contains("readonly struct RecordStructValue",Type("RecordStructValue"));
        Assert.False(reader.GetTypeByMetadataName("RecordStructValue")!.IsRecord);
        var sourceRecord=compilation.GetTypeByMetadataName("RecordStructValue")!;
        Assert.True(sourceRecord.IsRecord&&sourceRecord.IsValueType);
        Assert.Contains("record struct RecordStructValue",(string)typeMethod.Invoke(null,[sourceRecord])!);
        var propertyMethod=typeof(ApiExtraction).GetMethod("PropertyDeclaration",BindingFlags.NonPublic|BindingFlags.Static)!;
        var accessors=reader.GetTypeByMetadataName("Accessors")!;
        string Property(string name)=>(string)propertyMethod.Invoke(null,[accessors.GetMembers().OfType<IPropertySymbol>().Single(symbol=>symbol.MetadataName==name)])!;
        Assert.Contains("this[int index]",Property("Item"));
        Assert.Contains("private set;",Property("Item"));
        Assert.Contains("private set;",Property("Local"));
        Assert.Contains("protected internal set;",Property("Family"));
        Assert.Contains("private protected set;",Property("Narrow"));
        Assert.StartsWith("required ",Property("Name"));
        var tuples=CSharpCompilation.Create("TupleFields",[CSharpSyntaxTree.ParseText("public class TupleOwner { public (int Left, int Right) Pair; }")],trusted);
        Assert.IsType<Microsoft.CodeAnalysis.CSharp.Syntax.VariableDeclarationSyntax>(((IFieldSymbol)tuples.GetTypeByMetadataName("TupleOwner")!.GetMembers("Pair").Single()).DeclaringSyntaxReferences.Single().GetSyntax().Parent);
        var tuple=(INamedTypeSymbol)((IFieldSymbol)tuples.GetTypeByMetadataName("TupleOwner")!.GetMembers("Pair").Single()).Type;
        var fieldMethod=typeof(ApiExtraction).GetMethod("FieldDeclaration",BindingFlags.NonPublic|BindingFlags.Static)!;
        Assert.Contains("Left",(string)fieldMethod.Invoke(null,[tuple.TupleElements[0]])!);
        Write("indexers/Types.cs","namespace PicoGK; public class Indexers { public int this[int index] { get => index; private set { } } }");
        var output=Path.Combine(root,"indexers.json");
        Assert.Equal(0,InvokeMain(["--emit-api",output,Path.Combine(root,"indexers")]).ExitCode);
        Assert.Contains("private set;",File.ReadAllText(output));
    }

    private (JsonObject Request,JsonObject Manifest,string Directory) ColdComputeFixture()
    {
        var directory=Path.Combine(root,"compute-"+Guid.NewGuid());Directory.CreateDirectory(directory);
        const string producerCanonical="{\"id\":\"picogk\",\"implementationAssets\":[],\"version\":\"trust-boundary\"}";
        const string environmentCanonical="{\"arithmetic\":\"float32-ordered\"}";
        var identity=new JsonObject{["version"]=1,["generation"]=1,["producer"]=JsonNode.Parse(producerCanonical),["environment"]=JsonNode.Parse(environmentCanonical),["producerCanonical"]=producerCanonical,["environmentCanonical"]=environmentCanonical,["records"]=new JsonArray()};
        File.WriteAllText(Path.Combine(directory,"preload.json"),identity.ToJsonString());
        var request=(JsonObject)identity.DeepClone();request.Remove("version");request.Remove("records");
        request["preloadManifest"]=Path.Combine(directory,"preload.json");request["resultManifest"]=Path.Combine(directory,"result.json");request["maxEncodedBytes"]=268435456;request["maxNativeBytes"]=268435456;request["maxEntries"]=4096;
        Write("main.cs","using PicoGK;using System.Numerics;Library.Go(.5f,()=>{using var shape=Voxels.voxSphere(Library.oLibrary(),Vector3.Zero,8f);Library.oViewer().Add(shape);using var mesh=new Mesh(shape);Library.oViewer().Add(mesh);});");
        var input=JsonSerializer.Serialize(new{protocolVersion=8,requestId="cold",method="build",@params=new{entryPath="main.cs",parameters=new{},computeReuse=request}})+"\n";
        var output=new StringWriter();Assert.Equal(0,Program.Run(["--workspace",root,"--artifacts",root,"--parent-pid",Environment.ProcessId.ToString()],new StringReader(input),output,new StringWriter()));
        Assert.Contains("artifactPath",output.ToString());
        var manifest=JsonNode.Parse(File.ReadAllText(Path.Combine(directory,"result.json")))!.AsObject();Assert.NotEmpty(manifest["records"]!.AsArray());
        File.WriteAllText(Path.Combine(directory,"preload.json"),manifest.ToJsonString());
        return(request,manifest,directory);
    }

    [Fact]
    public void ComputeRequestRejectsMalformedIdentitiesRecipesFilesAndBudgetsBeforeHydration()
    {
        var fixture=ColdComputeFixture();var preload=Path.Combine(fixture.Directory,"preload.json");
        void RejectRequest(Action<JsonObject> mutate){var request=(JsonObject)fixture.Request.DeepClone();mutate(request);Assert.ThrowsAny<Exception>(()=>new ComputeWorkerSession(JsonSerializer.SerializeToElement(request),root,default));}
        RejectRequest(request=>request["generation"]=0);RejectRequest(request=>request["maxNativeBytes"]=0);RejectRequest(request=>request["generation"]=9007199254740992UL);
        RejectRequest(request=>request["resultManifest"]=Path.Combine(root,"foreign.json"));RejectRequest(request=>request["preloadManifest"]=Path.Combine(fixture.Directory,"foreign.json"));
        RejectRequest(request=>request["maxEntries"]=0);RejectRequest(request=>request["maxEntries"]=4097);RejectRequest(request=>request["maxEncodedBytes"]=0);
        RejectRequest(request=>request["producerCanonical"]="{}");RejectRequest(request=>request["environmentCanonical"]="{}");
        void RejectManifest(Action<JsonObject> mutate,Action<JsonObject>? mutateRequest=null){var manifest=(JsonObject)fixture.Manifest.DeepClone();mutate(manifest);
            var record=manifest["records"]![0]!.AsObject();
            if(record["action"]!.ToJsonString()!=fixture.Manifest["records"]![0]!["action"]!.ToJsonString()){
                var canonical=record["action"]!.ToJsonString();record["canonicalAction"]=canonical;
                record["actionDigest"]="sha256:"+Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonical)));
            }
            File.WriteAllText(preload,manifest.ToJsonString());var request=(JsonObject)fixture.Request.DeepClone();mutateRequest?.Invoke(request);Assert.ThrowsAny<Exception>(()=>new ComputeWorkerSession(JsonSerializer.SerializeToElement(request),root,default));}
        JsonObject First(JsonObject manifest)=>manifest["records"]![0]!.AsObject();
        RejectManifest(manifest=>manifest["version"]=2);RejectManifest(manifest=>manifest["producerCanonical"]="{}");RejectManifest(manifest=>manifest["environmentCanonical"]="{}");
        RejectManifest(manifest=>manifest["producer"]!["version"]="foreign");RejectManifest(manifest=>manifest["environment"]!["foreign"]=true);
        RejectManifest(manifest=>First(manifest)["actionDigest"]="not-a-digest");RejectManifest(manifest=>First(manifest)["contentDigest"]="not-a-digest");
        RejectManifest(manifest=>manifest["records"]!.AsArray().Add(First(manifest).DeepClone()));
        RejectManifest(manifest=>First(manifest)["canonicalAction"]="{}");
        RejectManifest(manifest=>{var record=First(manifest);var canonical=record["canonicalAction"]!.GetValue<string>()+" ";record["canonicalAction"]=canonical;record["actionDigest"]="sha256:"+Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(canonical)));});

        RejectManifest(manifest=>{First(manifest)["canonicalAction"]="{}";First(manifest)["actionDigest"]="sha256:"+Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData("{}"u8));});

        RejectManifest(manifest=>First(manifest)["action"]=new JsonObject());
        RejectManifest(manifest=>First(manifest)["size"]=9007199254740992UL);
        RejectManifest(manifest=>First(manifest)["size"]=2147483648UL,request=>request["maxEncodedBytes"]=4294967296UL);
        RejectManifest(manifest=>First(manifest)["nativeBytes"]=268435457);
        RejectManifest(manifest=>First(manifest)["size"]=First(manifest)["size"]!.GetValue<ulong>()+1);
        RejectManifest(manifest=>First(manifest)["action"]!["inputs"]![0]!["extra"]=true);
        RejectManifest(manifest=>First(manifest)["action"]!["arguments"]!["extra"]=true);
        RejectManifest(manifest=>First(manifest)["action"]!["codec"]!["version"]="1");
        RejectManifest(manifest=>First(manifest)["action"]!["codec"]!["id"]="unknown");
        RejectManifest(manifest=>First(manifest)["action"]!["schemaVersion"]=2);RejectManifest(manifest=>First(manifest)["action"]!["namespace"]="foreign");
        RejectManifest(manifest=>First(manifest)["action"]!["producer"]!["version"]="foreign");RejectManifest(manifest=>First(manifest)["action"]!["environment"]!["foreign"]=true);
        RejectManifest(manifest=>First(manifest)["filename"]="../foreign.vdb");RejectManifest(manifest=>First(manifest)["mediaType"]="wrong");RejectManifest(manifest=>First(manifest)["determinism"]="wrong");RejectManifest(manifest=>First(manifest)["computeDuration"]=-1);
        RejectManifest(manifest=>First(manifest)["nativeBytes"]=First(manifest)["nativeBytes"]!.GetValue<ulong>()+1);
        File.WriteAllText(preload,fixture.Manifest.ToJsonString());
        var low=(JsonObject)fixture.Request.DeepClone();low["maxEntries"]=1;var overflow=(JsonObject)fixture.Manifest.DeepClone();overflow["records"]!.AsArray().Add(overflow["records"]![0]!.DeepClone());File.WriteAllText(preload,overflow.ToJsonString());Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(JsonSerializer.SerializeToElement(low),root,default));File.WriteAllText(preload,fixture.Manifest.ToJsonString());
        var first=fixture.Manifest["records"]![0]!.AsObject();var path=Path.Combine(fixture.Directory,first["filename"]!.GetValue<string>());var bytes=File.ReadAllBytes(path);
        File.WriteAllBytes(path,bytes[..^1]);Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(JsonSerializer.SerializeToElement(fixture.Request),root,default));File.WriteAllBytes(path,bytes);
        var outside=Path.Combine(root,"outside.bin");File.WriteAllBytes(outside,bytes);File.Delete(path);File.CreateSymbolicLink(path,outside);Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(JsonSerializer.SerializeToElement(fixture.Request),root,default));File.Delete(path);File.WriteAllBytes(path,bytes);
        Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(JsonSerializer.SerializeToElement(fixture.Request),Path.Combine(root,"foreign"),default));
        File.WriteAllText(preload,fixture.Manifest.ToJsonString());
        var session=new ComputeWorkerSession(JsonSerializer.SerializeToElement(fixture.Request),root,default);
        var producer=JsonSerializer.SerializeToElement(fixture.Request["producer"]);var environment=JsonSerializer.SerializeToElement(fixture.Request["environment"]);
        var canonicalAction=TauComputeActionKeys.FromFragments(fixture.Request["producerCanonical"]!.GetValue<string>(),fixture.Request["environmentCanonical"]!.GetValue<string>(),producer,environment);
        var operand=new TauComputeOperand("content","left","sha256:"+new string('a',64));
        var booleanAction=canonicalAction(new TauComputeCall("voxels.sign-equal","{}"),new[]{operand,operand with{Role="right"}});
        var booleanBytes=TauComputeStoredCodec.Pack(new byte[]{1},"picogk.bool",0,1024);
        string Hash(byte[] value)=>"sha256:"+Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(value));
        var boolean=new TauComputeStableRecord(booleanAction,Hash(System.Text.Encoding.UTF8.GetBytes(booleanAction)),Hash(booleanBytes),booleanBytes,0,3,"picogk.bool");
        Assert.Throws<ArgumentException>(()=>session.WriteSuccessful(new[]{boolean,boolean}));
        Assert.Throws<ArgumentException>(()=>session.WriteSuccessful(new[]{boolean with{Codec="unknown"}}));
        using var library=new Library(.5f);using var mesh=new Mesh(library);
        mesh.nAddVertex(System.Numerics.Vector3.Zero);mesh.nAddVertex(System.Numerics.Vector3.UnitX);mesh.nAddVertex(System.Numerics.Vector3.UnitY);mesh.nAddTriangle(0,1,2);
        using var capture=mesh.TauAcquireGeometry();var meshBody=Mesh.TauEncodeComputeCapture(capture,1024*1024)!;
        var meshBytes=TauComputeStoredCodec.Pack(meshBody,"picogk.indexed-mesh",Mesh.TauMeshDecodeAllowance(meshBody),1024*1024);
        var meshAction=canonicalAction(new TauComputeCall("mesh.capture","{}"),new[]{operand with{Role="source",Digest=Hash(meshBody)}});
        var meshRecord=new TauComputeStableRecord(meshAction,Hash(System.Text.Encoding.UTF8.GetBytes(meshAction)),Hash(meshBytes),meshBytes,Mesh.TauMeshDecodeAllowance(meshBody),3,"picogk.indexed-mesh");
        File.Delete(Path.Combine(fixture.Directory,"result.json"));Assert.Equal(Path.Combine(fixture.Directory,"result.json"),session.WriteSuccessful(new[]{boolean,meshRecord}));
        File.Copy(Path.Combine(fixture.Directory,"result.json"),preload,true);var warmSession=new ComputeWorkerSession(JsonSerializer.SerializeToElement(fixture.Request),root,default);using var hydrated=warmSession.Attach(library);


    }
}

public sealed partial class WorkerTests
{
    private delegate void CopyNativeWords(ReadOnlySpan<byte> native,Span<byte> wire,bool littleEndian);
    private delegate void HashNativeWords(System.Security.Cryptography.IncrementalHash hash,ReadOnlySpan<byte> native,bool littleEndian);
    private delegate int[] ReadIntWords(ReadOnlySpan<byte> wire,bool littleEndian);
    private delegate float[] ReadFloatWords(ReadOnlySpan<byte> wire,bool littleEndian);
    [Fact]
    public void LayoutWordsHaveIdenticalWireAndHashAcrossActualByteOrders()
    {
        var copy=typeof(ComputeLayoutCodec).GetMethod("CopyWords",BindingFlags.Static|BindingFlags.NonPublic)!.CreateDelegate<CopyNativeWords>();
        var hash=typeof(ComputeLayoutCodec).GetMethod("HashWords",BindingFlags.Static|BindingFlags.NonPublic)!.CreateDelegate<HashNativeWords>();
        var read=typeof(ComputeLayoutCodec).GetMethod("ReadWords",BindingFlags.Static|BindingFlags.NonPublic)!.MakeGenericMethod(typeof(float)).CreateDelegate<ReadFloatWords>();
        byte[] little=[0,0,0,128,0,0,128,63,0,0,128,127];
        byte[] big=[128,0,0,0,63,128,0,0,127,128,0,0];
        var output=new byte[little.Length];copy(little,output,true);Assert.Equal(little,output);
        copy(big,output,false);Assert.Equal(little,output);
        Assert.Equal(little,System.Runtime.InteropServices.MemoryMarshal.AsBytes(read(little,true).AsSpan()).ToArray());
        Assert.Equal(big,System.Runtime.InteropServices.MemoryMarshal.AsBytes(read(little,false).AsSpan()).ToArray());
        // More than one bounded scratch chunk, including a partial final chunk.
        var nativeLittle=Enumerable.Range(0,25).SelectMany(_=>little).ToArray();var nativeBig=Enumerable.Range(0,25).SelectMany(_=>big).ToArray();
        using var a=System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
        using var b=System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
        hash(a,nativeLittle,true);hash(b,nativeBig,false);Assert.Equal(a.GetHashAndReset(),b.GetHashAndReset());
        Assert.Equal(ComputeLayoutCodec.Digest(new int[]{1,2}),ComputeLayoutCodec.Digest(new int[]{1,2}));
        Assert.NotEqual(ComputeLayoutCodec.Digest(new int[]{-1,int.MinValue}),ComputeLayoutCodec.Digest(new uint[]{uint.MaxValue,0x80000000}));
        var readInts=typeof(ComputeLayoutCodec).GetMethod("ReadWords",BindingFlags.Static|BindingFlags.NonPublic)!.MakeGenericMethod(typeof(int)).CreateDelegate<ReadIntWords>();
        Assert.Equal(new[]{-1,int.MinValue},readInts(new byte[]{255,255,255,255,0,0,0,128},BitConverter.IsLittleEndian));

        Assert.Throws<ArgumentException>(()=>ComputeLayoutCodec.Digest(new byte[]{1,2,3,4}));
        ComputeLayoutCodec.Admit(null,null,(new PrototypeLayout(new ExtractedComponent("empty","triangles","empty",new float[]{1,1,1},0,1,Array.Empty<float>(),Array.Empty<float>(),Array.Empty<uint>()),Array.Empty<int>(),null),0));
    }
}

public sealed partial class WorkerTests
{
    [Fact]
    public void PlacementAndArtifactBoundariesRejectEachMalformedOccurrenceBeforeWriting()
    {
        var identity=System.Numerics.Matrix4x4.Identity;
        for(var field=0;field<16;field++){
            var values=new float[]{1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1};values[field]=field is 3 or 7 or 11?1:field==15?0:float.NaN;
            var invalid=new System.Numerics.Matrix4x4(values[0],values[1],values[2],values[3],values[4],values[5],values[6],values[7],values[8],values[9],values[10],values[11],values[12],values[13],values[14],values[15]);
            Assert.False(CaptureViewerBackend.AffineFinite(invalid));
            Assert.False(CaptureViewerBackend.CanSharePlacement(invalid));
        }
        var bounds=new global::PicoGK.BBox3(-1,-1,-1,1,1,1);
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,identity,identity,System.Numerics.Matrix4x4.CreateScale(1,2,1),null,false));
        Assert.True(CaptureViewerBackend.QualifyPlacement(bounds,identity,identity,identity,null,false));
        var enormous=System.Numerics.Matrix4x4.CreateTranslation(float.MaxValue,0,0);
        var cancellation=System.Numerics.Matrix4x4.CreateTranslation(-float.MaxValue,0,0);
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,enormous,cancellation,enormous*cancellation,null,false));
        var translation=System.Numerics.Matrix4x4.CreateTranslation(1,0,0);
        var stable=new LayoutStability(1,1,1,1,1,1);
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,identity,translation,translation,stable with{MinimumArea=0},false));
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,identity,translation,translation,stable with{MinimumFanArea=0},false));
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,identity,translation,translation,stable with{CreaseMargin=0},false));
        Assert.True(CaptureViewerBackend.QualifyPlacement(bounds,identity,translation,translation,stable,true));
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,translation,identity,translation,stable with{UvAxisMargin=0},true));
        var rotation=System.Numerics.Matrix4x4.CreateRotationZ(.1f);
        Assert.False(CaptureViewerBackend.QualifyPlacement(bounds,rotation,identity,rotation,stable,true));
        var component=new ExtractedComponent("component:picogk-1","triangles",null,new float[]{1,1,1,1},0,1,new float[]{0,0,0,1,0,0,0,1,0},new float[]{0,0,1,0,0,1,0,0,1},new uint[]{0,1,2});
        var validate=typeof(MeshArtifactWriter).GetMethod("Validate",BindingFlags.NonPublic|BindingFlags.Static)!;
        var occurrence=typeof(MeshArtifactWriter).GetMethod("ValidateOccurrence",BindingFlags.NonPublic|BindingFlags.Static)!;
        void Reject(MethodInfo method,ExtractedComponent value){var error=Assert.Throws<TargetInvocationException>(()=>method.Invoke(null,[value]));Assert.IsType<InvalidDataException>(error.InnerException);}
        foreach(var malformed in new[]{component with{Id="foreign"},component with{Id="component:picogk-x"},component with{Id="component:picogk-0"},component with{Name=" "},component with{Name=" padded "},component with{Color=Array.Empty<float>()},component with{Color=new float[]{float.NaN,0,0,1}},component with{Color=new float[]{-1,0,0,1}},component with{Color=new float[]{2,0,0,1}},component with{Metallic=float.NaN},component with{Metallic=-1},component with{Metallic=2},component with{Roughness=float.NaN},component with{Roughness=-1},component with{Roughness=2},component with{Matrix=identity with{M44=0}}}){Reject(validate,malformed);Reject(occurrence,malformed);}
        foreach(var malformed in new[]{component with{Positions=Array.Empty<float>()},component with{Positions=new float[1]},component with{Indices=Array.Empty<uint>()},component with{Kind="unknown"},component with{Normals=Array.Empty<float>()},component with{Indices=new uint[1]},component with{Positions=new float[]{float.NaN,0,0,1,0,0,0,1,0}},component with{Normals=new float[]{float.NaN,0,1,0,0,1,0,0,1}},component with{Indices=new uint[]{0,1,3}},component with{TexCoords=new float[1]},component with{TexCoords=new float[]{float.NaN,0,0,0,0,0}},component with{Tangents=new float[1]},component with{Tangents=Enumerable.Repeat(float.NaN,12).ToArray()}})Reject(validate,malformed);
        var line=component with{Kind="lines",Normals=Array.Empty<float>(),Indices=new uint[]{0,1}};
        foreach(var malformed in new[]{line with{Normals=new float[1]},line with{Indices=new uint[1]},line with{Positions=new float[3]},line with{TexCoords=new float[6]},line with{Tangents=new float[12]}})Reject(validate,malformed);
        Assert.Null(validate.Invoke(null,[component]));Assert.Null(validate.Invoke(null,[line]));Assert.Null(occurrence.Invoke(null,[component]));
    }
}

public sealed partial class WorkerTests
{
    [Fact]
    public void SnapshotValidationPreservesActualOpenLengthAndReadEofFences()
    {
        var path=Path.Combine(root,"snapshot.bin");File.WriteAllBytes(path,new byte[]{1,2,3});
        var require=typeof(ComputeWorkerSession).GetMethod("RequireSnapshot",BindingFlags.NonPublic|BindingFlags.Static)!;
        void Check(long observed,long actual,bool valid){if(valid)Assert.Null(require.Invoke(null,[observed,actual,"snapshot boundary"]));else Assert.IsType<ArgumentException>(Assert.Throws<TargetInvocationException>(()=>require.Invoke(null,[observed,actual,"snapshot boundary"])).InnerException);}
        var length=new FileInfo(path).Length;
        using(var writer=new FileStream(path,FileMode.Open,FileAccess.Write))writer.SetLength(2);
        using(var stream=File.OpenRead(path))Check(length,stream.Length,false);
        File.WriteAllBytes(path,new byte[]{1,2,3,4});using(var stream=File.OpenRead(path))Check(length,stream.Length,false);
        File.WriteAllBytes(path,new byte[]{1,2,3});using(var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)){
            Check(length,stream.Length,true);var bytes=new byte[length];stream.ReadExactly(bytes);Check(-1,stream.ReadByte(),true);
            using(var writer=new FileStream(path,FileMode.Append,FileAccess.Write,FileShare.ReadWrite))writer.WriteByte(4);
            Check(-1,stream.ReadByte(),false);
        }
    }
}

public sealed partial class WorkerTests
{
    [Fact]
    public void PublicationManifestAndStrictFieldsRemainBoundedForValidLargeIdentities()
    {
        var directory=Path.Combine(root,"compute-"+Guid.NewGuid());Directory.CreateDirectory(directory);
        var producerCanonical=JsonSerializer.Serialize(new SortedDictionary<string,object>{{"id",new string('p',16000)},{"implementationAssets",Array.Empty<string>()},{"version","bounded-test"}});
        const string environmentCanonical="{\"arithmetic\":\"float32-ordered\"}";
        using var producer=JsonDocument.Parse(producerCanonical);using var environment=JsonDocument.Parse(environmentCanonical);
        var identity=new Dictionary<string,object>{{"version",1},{"generation",1},{"producer",producer.RootElement},{"environment",environment.RootElement},{"producerCanonical",producerCanonical},{"environmentCanonical",environmentCanonical},{"records",Array.Empty<object>()}};
        var preload=Path.Combine(directory,"preload.json");File.WriteAllText(preload,JsonSerializer.Serialize(identity));
        var request=new Dictionary<string,object>(identity);request.Remove("version");request.Remove("records");request["preloadManifest"]=preload;request["resultManifest"]=Path.Combine(directory,"result.json");request["maxEncodedBytes"]=268435456;request["maxNativeBytes"]=268435456;request["maxEntries"]=4096;
        var session=new ComputeWorkerSession(JsonSerializer.SerializeToElement(request),root,default);
        var canonical=TauComputeActionKeys.FromFragments(producerCanonical,environmentCanonical,producer.RootElement,environment.RootElement);
        var bytes=TauComputeStoredCodec.Pack(new byte[]{1},"picogk.bool",0,1024);
        string Hash(byte[] value)=>"sha256:"+Convert.ToHexStringLower(System.Security.Cryptography.SHA256.HashData(value));
        var records=Enumerable.Range(0,150).Select(index=>{var digest=Hash(BitConverter.GetBytes(index));var action=canonical(new TauComputeCall("voxels.sign-equal","{}"),new[]{new TauComputeOperand("content","left",digest),new TauComputeOperand("content","right",digest)});return new TauComputeStableRecord(action,Hash(System.Text.Encoding.UTF8.GetBytes(action)),Hash(bytes),bytes,0,3,"picogk.bool");}).ToArray();
        Assert.Throws<ArgumentException>(()=>session.WriteSuccessful(records));Assert.False(File.Exists(Path.Combine(directory,"result.json")));
        var fields=typeof(ComputeWorkerSession).GetMethod("Fields",BindingFlags.NonPublic|BindingFlags.Static)!;
        foreach(var malformed in new[]{"{\"left\":1,\"left\":2}","{\"left\":1,\"foreign\":2}"}){
            using var parsed=JsonDocument.Parse(malformed);Assert.IsType<ArgumentException>(Assert.Throws<TargetInvocationException>(()=>fields.Invoke(null,[parsed.RootElement,new[]{"left","right"}])).InnerException);
        }
    }
}
