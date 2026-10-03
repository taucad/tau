using System.Numerics;
using System.Text.Json;
using PicoGK;
using Xunit;
namespace Tau.PicoGK.Worker.Tests;
public sealed partial class WorkerTests
{
    [Fact]
    public void ActualWorkerRecipesHydratePublishAndRejectCorruptDisposableInputs()
    {
        var root=Path.Combine(Path.GetTempPath(),"tau-compute-"+Guid.NewGuid());Directory.CreateDirectory(root);
        var coldDir=Path.Combine(root,"compute-"+Guid.NewGuid());Directory.CreateDirectory(coldDir);
        const string producerCanonical="{\"id\":\"picogk\",\"implementationAssets\":[],\"version\":\"portable-test\"}";
        const string environmentCanonical="{\"arithmetic\":\"float32-ordered\"}";
        var identity=new Dictionary<string,object>{["version"]=1,["generation"]=1,["producer"]=JsonSerializer.Deserialize<JsonElement>(producerCanonical),["environment"]=JsonSerializer.Deserialize<JsonElement>(environmentCanonical),["producerCanonical"]=producerCanonical,["environmentCanonical"]=environmentCanonical,["records"]=Array.Empty<object>()};
        File.WriteAllText(Path.Combine(coldDir,"preload.json"),JsonSerializer.Serialize(identity));
        var coldRequest=new Dictionary<string,object>(identity);coldRequest.Remove("version");coldRequest.Remove("records");
        coldRequest["preloadManifest"]=Path.Combine(coldDir,"preload.json");coldRequest["resultManifest"]=Path.Combine(coldDir,"result.json");coldRequest["maxEncodedBytes"]=268435456;coldRequest["maxNativeBytes"]=268435456;coldRequest["maxEntries"]=4096;
        File.WriteAllText(Path.Combine(root,"main.cs"),"using PicoGK;using System.Numerics;Library.Go(0.5f,()=>{using var sphere=Voxels.voxSphere(Library.oLibrary(),Vector3.Zero,24f);Library.oViewer().SetGroupMaterial(0,new Material { ColorTexture = new MaterialTexture { Image = new MaterialImage { Data = Convert.FromBase64String(\"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=\") } } });Library.oViewer().Add(sphere);});");
        var coldInput=JsonSerializer.Serialize(new{protocolVersion=8,requestId="cold",method="build",@params=new{entryPath="main.cs",parameters=new{},computeReuse=coldRequest}})+"\n";
        var coldOutput=new StringWriter();Assert.Equal(0,Program.Run(new[]{"--workspace",root,"--artifacts",root,"--parent-pid",Environment.ProcessId.ToString()},new StringReader(coldInput),coldOutput,new StringWriter()));Assert.Contains("artifactPath",coldOutput.ToString());
        var original=Path.Combine(coldDir,"result.json");
        using var manifest=JsonDocument.Parse(File.ReadAllBytes(original));Assert.NotEmpty(manifest.RootElement.GetProperty("records").EnumerateArray());
        try{
            var dir=Path.Combine(root,"compute-"+Guid.NewGuid());Directory.CreateDirectory(dir);
            foreach(var record in manifest.RootElement.GetProperty("records").EnumerateArray())File.Copy(Path.Combine(Path.GetDirectoryName(original)!,record.GetProperty("filename").GetString()!),Path.Combine(dir,record.GetProperty("filename").GetString()!));
            var preload=Path.Combine(dir,"preload.json");File.WriteAllBytes(preload,File.ReadAllBytes(original));
            var request=new Dictionary<string,object>();foreach(var key in new[]{"generation","producer","environment","producerCanonical","environmentCanonical"})request[key]=manifest.RootElement.GetProperty(key).Clone();
            request["preloadManifest"]=preload;request["resultManifest"]=Path.Combine(dir,"result.json");request["maxEncodedBytes"]=268435456;request["maxNativeBytes"]=268435456;request["maxEntries"]=4096;
            JsonElement Value()=>JsonSerializer.SerializeToElement(request);
            request["preloadManifest"]=Path.Combine(root,"preload.json");Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));request["preloadManifest"]=preload;
            request["generation"]=2;Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));request["generation"]=1;
            var session=new ComputeWorkerSession(Value(),root,default);
            using(var lib=new Library(.5f)){using var reuse=session.Attach(lib);Assert.NotNull(reuse);Assert.Empty(reuse.EncodeSuccessful());}

            using(var parameters=JsonDocument.Parse("{}")){
                var compiled=CompilationService.Compile(root,"main.cs");
                var restored=ModelRunner.Execute(compiled,root,parameters.RootElement,default,session);
                Assert.Equal(0,restored.WorkCounters!.NormalLayouts);Assert.Equal(0,restored.WorkCounters!.UvLayouts);
                Assert.Single(restored.Components);Assert.NotNull(restored.Components[0].TexCoords);Assert.NotNull(restored.Components[0].Tangents);
            }
            var records=manifest.RootElement.GetProperty("records").EnumerateArray().Select(record=>new TauComputeStableRecord(record.GetProperty("canonicalAction").GetString()!,record.GetProperty("actionDigest").GetString()!,record.GetProperty("contentDigest").GetString()!,File.ReadAllBytes(Path.Combine(dir,record.GetProperty("filename").GetString()!)),record.GetProperty("nativeBytes").GetUInt64(),record.GetProperty("computeDuration").GetDouble(),record.GetProperty("action").GetProperty("codec").GetProperty("id").GetString()!)).ToArray();
            Assert.Equal(Path.Combine(dir,"result.json"),session.WriteSuccessful(records));
            var restoredFilename=manifest.RootElement.GetProperty("records")[0].GetProperty("filename").GetString()!;File.Delete(Path.Combine(dir,restoredFilename));
            Assert.Throws<IOException>(()=>session.WriteSuccessful(records));Assert.Equal(records[0].Bytes,File.ReadAllBytes(Path.Combine(dir,restoredFilename)));
            var collisionName=manifest.RootElement.GetProperty("records")[0].GetProperty("filename").GetString()!;File.WriteAllBytes(Path.Combine(dir,collisionName),new byte[records[0].Bytes.Length]);Assert.Throws<ArgumentException>(()=>session.WriteSuccessful(records));File.WriteAllBytes(Path.Combine(dir,collisionName),records[0].Bytes);
            var input=JsonSerializer.Serialize(new{protocolVersion=8,requestId="compute",method="build",@params=new{entryPath="main.cs",parameters=new{},computeReuse=Value()}})+"\n";
            var stdout=new StringWriter();Assert.Equal(0,Program.Run(new[]{"--workspace",root,"--artifacts",root,"--parent-pid",Environment.ProcessId.ToString()},new StringReader(input),stdout,new StringWriter()));Assert.Contains("artifactPath",stdout.ToString());
            request["extra"]=true;input=JsonSerializer.Serialize(new{protocolVersion=8,requestId="bypass",method="build",@params=new{entryPath="main.cs",parameters=new{},computeReuse=Value()}})+"\n";stdout=new StringWriter();Assert.Equal(0,Program.Run(new[]{"--workspace",root,"--artifacts",root,"--parent-pid",Environment.ProcessId.ToString()},new StringReader(input),stdout,new StringWriter()));Assert.Contains("artifactPath",stdout.ToString());request.Remove("extra");
            request["generation"]=0;Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));request["generation"]=1;
            request["extra"]=true;Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));request.Remove("extra");
            request["resultManifest"]=Path.Combine(root,"result.json");Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));request["resultManifest"]=Path.Combine(dir,"result.json");
            request["maxNativeBytes"]=1;Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));request["maxNativeBytes"]=268435456;
            File.WriteAllText(preload,"{}");Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));
            File.WriteAllBytes(preload,File.ReadAllBytes(original));var first=records[0];var filename=manifest.RootElement.GetProperty("records")[0].GetProperty("filename").GetString()!;File.WriteAllBytes(Path.Combine(dir,filename),new byte[first.Bytes.Length]);Assert.Throws<ArgumentException>(()=>new ComputeWorkerSession(Value(),root,default));
            using var cancelled=new CancellationTokenSource();cancelled.Cancel();Assert.Throws<OperationCanceledException>(()=>new ComputeWorkerSession(Value(),root,cancelled.Token));
            Assert.True(ComputeWorkerSession.IsDisposableFailure(new IOException()));Assert.False(ComputeWorkerSession.IsDisposableFailure(new OperationCanceledException()));ComputeWorkerSession.ReportBypass("test-disposable-boundary",new ArgumentException("bounded fixture"));
        }finally{Directory.Delete(root,true);}
    }
}
