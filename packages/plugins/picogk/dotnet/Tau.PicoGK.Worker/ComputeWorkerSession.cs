using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using PicoGK;
namespace Tau.PicoGK.Worker;

// Request-local transport authority. It owns encoded buffers, never a cross-Go Library/handle.
internal sealed class ComputeWorkerSession
{
    private const int MaximumManifest=4*1024*1024;
    private static readonly JsonSerializerOptions Json=new(){PropertyNamingPolicy=JsonNamingPolicy.CamelCase};
    private readonly JsonElement request;
    private readonly string directory,resultPath;
    private readonly CancellationToken cancellation;
    private readonly TauComputeRunOptions options;
    private readonly IReadOnlyList<TauComputeWarmRecord> warm;
    internal ComputeWorkerSession(JsonElement value,string artifactRoot,CancellationToken cancellation)
    {
        this.cancellation=cancellation;request=value.Clone();
        Fields(request,"generation","producer","environment","producerCanonical","environmentCanonical","preloadManifest","resultManifest","maxEncodedBytes","maxNativeBytes","maxEntries");
        var generation=UInt(request,"generation");var encoded=UInt(request,"maxEncodedBytes");var native=UInt(request,"maxNativeBytes");
        var count=request.GetProperty("maxEntries").GetInt32();if(generation==0||encoded==0||native==0||count<1||count>4096)throw new ArgumentException("Invalid compute request limits.");
        var preload=Path.GetFullPath(request.GetProperty("preloadManifest").GetString()!);directory=Path.GetDirectoryName(preload)!;
        var root=Path.GetFullPath(artifactRoot);if(Path.GetDirectoryName(directory)!=root||!Regex.IsMatch(Path.GetFileName(directory),"^compute-[0-9a-f-]{36}$")||Path.GetFileName(preload)!="preload.json"||new DirectoryInfo(directory).LinkTarget is not null)
            throw new ArgumentException("Foreign compute request directory.");
        resultPath=Path.Combine(directory,"result.json");if(Path.GetFullPath(request.GetProperty("resultManifest").GetString()!)!=resultPath)throw new ArgumentException("Foreign compute result path.");
        var producer=request.GetProperty("producer");var environment=request.GetProperty("environment");
        var producerCanonical=request.GetProperty("producerCanonical").GetString()!;var environmentCanonical=request.GetProperty("environmentCanonical").GetString()!;
        options=new(generation,encoded,native,count,1,TauComputeActionKeys.FromFragments(producerCanonical,environmentCanonical,producer,environment),()=>!cancellation.IsCancellationRequested,TauComputeActionKeys.IdentityCharge(producerCanonical,environmentCanonical));
        cancellation.ThrowIfCancellationRequested();var manifestBytes=ReadOwned(preload,MaximumManifest);
        using var parsed=JsonDocument.Parse(manifestBytes,new(){MaxDepth=32});var manifest=parsed.RootElement;
        Fields(manifest,"version","generation","producer","environment","producerCanonical","environmentCanonical","records");
        if(manifest.GetProperty("version").GetInt32()!=1||UInt(manifest,"generation")!=generation||!JsonElement.DeepEquals(manifest.GetProperty("producer"),producer)||!JsonElement.DeepEquals(manifest.GetProperty("environment"),environment)||manifest.GetProperty("producerCanonical").GetString()!=producerCanonical||manifest.GetProperty("environmentCanonical").GetString()!=environmentCanonical)
            throw new ArgumentException("Compute preload identity mismatch.");
        var records=manifest.GetProperty("records");if(records.GetArrayLength()>count)throw new ArgumentException("Compute preload count limit.");
        var seen=new HashSet<string>(StringComparer.Ordinal);var checkedRecords=new List<TauComputeWarmRecord>();ulong totalEncoded=0,totalNative=0;
        foreach(var record in records.EnumerateArray()) {
            cancellation.ThrowIfCancellationRequested();Fields(record,"action","canonicalAction","actionDigest","contentDigest","filename","size","nativeBytes","computeDuration","mediaType","determinism");
            var action=record.GetProperty("action");var canonical=record.GetProperty("canonicalAction").GetString()!;
            var digest=record.GetProperty("actionDigest").GetString()!;var content=record.GetProperty("contentDigest").GetString()!;
            if(!Digest(digest)||!Digest(content)||!seen.Add(digest)||Hash(Encoding.UTF8.GetBytes(canonical))!=digest)throw new ArgumentException("Compute preload action identity.");
            using var actionDocument=JsonDocument.Parse(canonical,new(){MaxDepth=32});if(!JsonElement.DeepEquals(action,actionDocument.RootElement))throw new ArgumentException("Compute canonical action shape mismatch.");
            Fields(action,"schemaVersion","namespace","producer","environment","operation","inputs","arguments","codec");
            if(action.GetProperty("schemaVersion").GetInt32()!=1||action.GetProperty("namespace").GetString()!="picogk.operation.v1"||!JsonElement.DeepEquals(action.GetProperty("producer"),producer)||!JsonElement.DeepEquals(action.GetProperty("environment"),environment))throw new ArgumentException("Compute preload producer mismatch.");
            var codec=action.GetProperty("codec");Fields(codec,"id","version");if(codec.GetProperty("version").GetString()!="2")throw new ArgumentException("Compute codec version.");
            var codecId=codec.GetProperty("id").GetString()!;var family=codecId switch{"picogk.vdb-stream"=>"vdb","picogk.indexed-mesh"=>"mesh","picogk.bool"=>"bool","picogk.layout"=>"layout",_=>throw new ArgumentException("Unknown compute codec.")};
            var inputs=action.GetProperty("inputs").EnumerateArray().Select(input=>{Fields(input,"kind","role","digest");return new TauComputeOperand(input.GetProperty("kind").GetString()!,input.GetProperty("role").GetString()!,input.GetProperty("digest").GetString()!);}).ToArray();
            var call=new TauComputeCall(action.GetProperty("operation").GetString()!,actionDocument.RootElement.GetProperty("arguments").GetRawText());if(options.CanonicalAction(call,inputs)!=canonical)throw new ArgumentException("Compute preload recipe mismatch.");
            var size=UInt(record,"size");var nativeBytes=UInt(record,"nativeBytes");totalEncoded=checked(totalEncoded+size);totalNative=checked(totalNative+nativeBytes);
            if(totalEncoded>encoded||totalNative>native||size>int.MaxValue)throw new ArgumentException("Compute preload byte limit.");
            var filename=record.GetProperty("filename").GetString()!;var expected=content[7..]+"."+family;
            var media=family=="mesh"?"application/vnd.picogk.indexed-mesh":"application/vnd.picogk."+family;
            var duration=record.GetProperty("computeDuration").GetDouble();
            if(filename!=expected||record.GetProperty("mediaType").GetString()!=media||record.GetProperty("determinism").GetString()!=(family=="vdb"?"equivalent":"byte-exact")||!double.IsFinite(duration)||duration<0)throw new ArgumentException("Compute preload codec identity.");
            var bytes=ReadOwned(Path.Combine(directory,filename),(int)size);if((ulong)bytes.Length!=size||Hash(bytes)!=content)throw new ArgumentException("Compute preload content identity.");
            var stored=TauComputeStoredCodec.Read(bytes,codecId,encoded,native);if(stored.Allowance!=nativeBytes)throw new ArgumentException("Compute preload allowance identity.");
            checkedRecords.Add(new(canonical,digest,content,bytes,nativeBytes,codecId));
        }
        warm=checkedRecords;cancellation.ThrowIfCancellationRequested();
    }
    internal TauComputeRun Attach(Library library) {
        cancellation.ThrowIfCancellationRequested();var run=new TauComputeRun(library,options);
        try{run.Hydrate(warm);library.TauComputeReuse=run;return run;}catch{run.Dispose();throw;}
    }
    internal string WriteSuccessful(IReadOnlyList<TauComputeStableRecord> records) {
        cancellation.ThrowIfCancellationRequested();var wire=new List<object>();var seen=new HashSet<string>(StringComparer.Ordinal);
        foreach(var record in records) {
            if(!seen.Add(record.ActionDigest))throw new ArgumentException("Duplicate compute publication.");
            var family=record.Codec switch{"picogk.vdb-stream"=>"vdb","picogk.indexed-mesh"=>"mesh","picogk.bool"=>"bool","picogk.layout"=>"layout",_=>throw new ArgumentException("Unknown compute publication codec.")};
            var filename=record.ContentDigest[7..]+"."+family;var path=Path.Combine(directory,filename);
            if(File.Exists(path)){if(Hash(ReadOwned(path,record.Bytes.Length))!=record.ContentDigest)throw new ArgumentException("Compute file collision.");}
            else{using var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None);file.Write(record.Bytes);}
            using var action=JsonDocument.Parse(record.Action);
            wire.Add(new{action=action.RootElement.Clone(),canonicalAction=record.Action,actionDigest=record.ActionDigest,contentDigest=record.ContentDigest,filename,size=record.Bytes.LongLength,nativeBytes=record.NativeBytes,computeDuration=record.ComputeDuration,
                mediaType=family=="mesh"?"application/vnd.picogk.indexed-mesh":"application/vnd.picogk."+family,determinism=family=="vdb"?"equivalent":"byte-exact"});
            cancellation.ThrowIfCancellationRequested();
        }
        var bytes=JsonSerializer.SerializeToUtf8Bytes(new{version=1,generation=options.Generation,producer=request.GetProperty("producer"),environment=request.GetProperty("environment"),producerCanonical=request.GetProperty("producerCanonical"),environmentCanonical=request.GetProperty("environmentCanonical"),records=wire},Json);
        if(bytes.Length>MaximumManifest)throw new ArgumentException("Compute result manifest limit.");
        using(var file=new FileStream(resultPath,FileMode.CreateNew,FileAccess.Write,FileShare.None))file.Write(bytes);
        cancellation.ThrowIfCancellationRequested();return resultPath;
    }
    internal static bool IsDisposableFailure(Exception error)=>error is ArgumentException or InvalidOperationException or JsonException or IOException or UnauthorizedAccessException or OverflowException or FormatException or KeyNotFoundException;
    internal static void ReportBypass(string boundary,Exception error)=>Console.Error.WriteLine(JsonSerializer.Serialize(new{Event="picogk.compute.bypass",Boundary=boundary,Error=error.GetType().Name,Message=error.Message},Json));
    private byte[] ReadOwned(string path,int maximum) {
        var info=new FileInfo(path);if(info.LinkTarget is not null||!info.Exists||info.Length>maximum)throw new ArgumentException("Compute file type/size.");
        using var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read);RequireSnapshot(info.Length,file.Length,"Compute file changed during open.");
        var bytes=new byte[checked((int)file.Length)];file.ReadExactly(bytes);RequireSnapshot(-1,file.ReadByte(),"Compute file changed during read.");return bytes;
    }
    private static void RequireSnapshot(long observed,long actual,string boundary){if(actual!=observed)throw new ArgumentException(boundary);}
    private static void Fields(JsonElement value,params string[] names){var fields=value.EnumerateObject().Select(property=>property.Name).ToArray();if(fields.Length!=names.Length||fields.Distinct(StringComparer.Ordinal).Count()!=fields.Length||fields.Except(names,StringComparer.Ordinal).Any())throw new ArgumentException("Compute unknown/duplicate fields.");}
    private static ulong UInt(JsonElement value,string key){var result=value.GetProperty(key).GetUInt64();if(result>9007199254740991UL)throw new ArgumentException("Compute unsafe integer.");return result;}
    private static bool Digest(string value)=>Regex.IsMatch(value,"^sha256:[0-9a-f]{64}$");
    private static string Hash(byte[] value)=>"sha256:"+Convert.ToHexStringLower(SHA256.HashData(value));
}
