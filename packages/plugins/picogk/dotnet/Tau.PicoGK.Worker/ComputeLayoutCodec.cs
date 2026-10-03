using System.Buffers.Binary;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using PicoGK;
namespace Tau.PicoGK.Worker;

// Private bytes for the existing PrototypeLayout; caller metadata is bound from the current template.
internal static class ComputeLayoutCodec
{
    internal static string Arguments(Matrix4x4 source,Matrix4x4 baked,bool uv=false)
    {
        string[] Bits(Matrix4x4 m)=>new[]{m.M11,m.M12,m.M13,m.M14,m.M21,m.M22,m.M23,m.M24,m.M31,m.M32,m.M33,m.M34,m.M41,m.M42,m.M43,m.M44}.Select(value=>BitConverter.SingleToUInt32Bits(value).ToString("x8")).ToArray();
        return JsonSerializer.Serialize(new SortedDictionary<string,object>(StringComparer.Ordinal){["algorithm"]=uv?"tau-surface-coordinates-v1":"tau-vertex-normals-v3",["baked"]=Bits(baked),["source"]=Bits(source)});
    }
    internal static string Digest(params Array[] arrays)
    {
        using var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);hash.AppendData("PKLIN001"u8);Span<byte> header=stackalloc byte[8];
        foreach(var array in arrays){BinaryPrimitives.WriteInt32LittleEndian(header,array.Length);BinaryPrimitives.WriteInt32LittleEndian(header[4..],array is float[]?1:array.GetType()==typeof(uint[])?2:3);hash.AppendData(header);
            if(array is float[] floats)HashWords(hash,MemoryMarshal.AsBytes(floats.AsSpan()),BitConverter.IsLittleEndian);else if(array.GetType()==typeof(uint[]))HashWords(hash,MemoryMarshal.AsBytes(((uint[])array).AsSpan()),BitConverter.IsLittleEndian);else if(array is int[] sources)HashWords(hash,MemoryMarshal.AsBytes(sources.AsSpan()),BitConverter.IsLittleEndian);else throw new ArgumentException("Unknown layout input array.");}
        return "sha256:"+Convert.ToHexStringLower(hash.GetHashAndReset());
    }
    internal static byte[] Encode(PrototypeLayout layout,ulong maximum)
    {
        var component=layout.Component;var arrays=new Array[]{component.Positions,component.Normals,component.Indices,layout.Sources,component.TexCoords??Array.Empty<float>(),component.Tangents??Array.Empty<float>()};
        var length=checked(64L+arrays.Sum(array=>(long)array.Length)*4);if((ulong)length>Math.Min(maximum,(ulong)Array.MaxLength))throw new ArgumentException("Compute layout encoded budget.");
        var bytes=new byte[(int)length];"PKLAY001"u8.CopyTo(bytes);BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(8),1);
        if(layout.Stability is {} stability){BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(12),1);var values=new[]{stability.MinimumArea,stability.MaximumEdgeSum,stability.CreaseMargin,stability.MinimumFanArea,0,stability.UvAxisMargin};
            for(int i=0;i<values.Length;i++)BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(40+i*4),BitConverter.SingleToUInt32Bits(values[i]));BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(56),stability.MaximumFanFaces);}
        int offset=64;
        for(int i=0;i<arrays.Length;i++){var array=arrays[i];BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(16+i*4),array.Length);
            var region=bytes.AsSpan(offset,array.Length*4);if(array is float[] floats)CopyWords(MemoryMarshal.AsBytes(floats.AsSpan()),region,BitConverter.IsLittleEndian);else if(array.GetType()==typeof(uint[]))CopyWords(MemoryMarshal.AsBytes(((uint[])array).AsSpan()),region,BitConverter.IsLittleEndian);else CopyWords(MemoryMarshal.AsBytes(((int[])array).AsSpan()),region,BitConverter.IsLittleEndian);offset+=region.Length;}
        TauComputeLayoutBytes.Validate(bytes,maximum);return bytes;
    }
    internal static PrototypeLayout Decode(ReadOnlyMemory<byte> body,PrototypeLayout template,(int SourceVertices,long MaximumBytes) authority)
    {
        if(body.Length-64>authority.MaximumBytes)throw new ArgumentException("Compute layout allocation budget.");
        var bytes=body.Span;var lengths=TauComputeLayoutBytes.Validate(bytes,(ulong)body.Length);var offset=64;
        // Sources refer to the immutable input; inspect them before allocating output arrays.
        var sourceOffset=64+(lengths[0]+lengths[1]+lengths[2])*4;
        for(int i=0;i<lengths[3];i++)if(BinaryPrimitives.ReadUInt32LittleEndian(bytes[(sourceOffset+i*4)..])>=authority.SourceVertices)throw new ArgumentException("Compute layout source index exceeds input.");
        var positions=ReadWords<float>(bytes.Slice(offset,lengths[0]*4),BitConverter.IsLittleEndian);offset+=lengths[0]*4;
        var normals=ReadWords<float>(bytes.Slice(offset,lengths[1]*4),BitConverter.IsLittleEndian);offset+=lengths[1]*4;
        var indices=ReadWords<uint>(bytes.Slice(offset,lengths[2]*4),BitConverter.IsLittleEndian);offset+=lengths[2]*4;
        var sources=ReadWords<int>(bytes.Slice(offset,lengths[3]*4),BitConverter.IsLittleEndian);offset+=lengths[3]*4;
        var uv=lengths[4]==0?null:ReadWords<float>(bytes.Slice(offset,lengths[4]*4),BitConverter.IsLittleEndian);offset+=lengths[4]*4;
        var tangents=lengths[5]==0?null:ReadWords<float>(bytes.Slice(offset,lengths[5]*4),BitConverter.IsLittleEndian);
        LayoutStability? stability=BinaryPrimitives.ReadUInt32LittleEndian(bytes[12..])==0?null:new(BitConverter.UInt32BitsToSingle(BinaryPrimitives.ReadUInt32LittleEndian(bytes[40..])),BitConverter.UInt32BitsToSingle(BinaryPrimitives.ReadUInt32LittleEndian(bytes[44..])),BitConverter.UInt32BitsToSingle(BinaryPrimitives.ReadUInt32LittleEndian(bytes[48..])),BitConverter.UInt32BitsToSingle(BinaryPrimitives.ReadUInt32LittleEndian(bytes[52..])),BinaryPrimitives.ReadInt32LittleEndian(bytes[56..]),BitConverter.UInt32BitsToSingle(BinaryPrimitives.ReadUInt32LittleEndian(bytes[60..])));
        return new(template.Component with{Positions=positions,Normals=normals,Indices=indices,TexCoords=uv,Tangents=tangents,PrototypeIdentity=new()},sources,stability);
    }
    // Words are always four-byte float/int values; wire identity is little-endian on every host.
    private static void CopyWords(ReadOnlySpan<byte> native,Span<byte> wire,bool littleEndian)
    {
        if(littleEndian){native.CopyTo(wire);return;}
        for(int offset=0;offset<native.Length;offset+=4)
            BinaryPrimitives.WriteUInt32LittleEndian(wire[offset..],BinaryPrimitives.ReadUInt32BigEndian(native[offset..]));
    }
    private static void HashWords(IncrementalHash hash,ReadOnlySpan<byte> native,bool littleEndian)
    {
        if(littleEndian){hash.AppendData(native);return;}
        Span<byte> scratch=stackalloc byte[256];
        for(int offset=0;offset<native.Length;offset+=scratch.Length){var count=Math.Min(scratch.Length,native.Length-offset);CopyWords(native.Slice(offset,count),scratch[..count],false);hash.AppendData(scratch[..count]);}
    }
    private static T[] ReadWords<T>(ReadOnlySpan<byte> wire,bool littleEndian) where T:unmanaged
    {
        var values=MemoryMarshal.Cast<byte,T>(wire).ToArray();
        if(!littleEndian){var native=MemoryMarshal.AsBytes(values.AsSpan());for(int offset=0;offset<native.Length;offset+=4){var value=BinaryPrimitives.ReadUInt32LittleEndian(native[offset..]);BinaryPrimitives.WriteUInt32BigEndian(native[offset..],value);}}
        return values;
    }
    internal static void Admit(TauComputeRun? reuse,TauComputeLayoutTicket? ticket,(PrototypeLayout Layout,double Duration) output)
    {
        if(reuse is null||ticket is null||output.Duration<1)return;
        try{reuse.AdmitLayout(ticket.Value,Encode(output.Layout,reuse.LayoutBudget),output.Duration);}
        catch(Exception error)when(ComputeWorkerSession.IsDisposableFailure(error)){ComputeWorkerSession.ReportBypass("layout-admission",error);}
    }
}
