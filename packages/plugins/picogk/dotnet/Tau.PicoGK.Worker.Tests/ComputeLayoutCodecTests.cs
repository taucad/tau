using System.Buffers.Binary;
using System.Numerics;
using System.Runtime.InteropServices;
using System.Text.Json;
using PicoGK;
using Tau.PicoGK.Worker;
using Xunit;
namespace Tau.PicoGK.Worker.Tests;
public sealed partial class WorkerTests { [Fact] public void ExactLayoutRestoresTopologyStabilityMetadataAndRejectsCorruptionBeforeAllocation(){
int checks=0;
void Check(bool value,string label){checks++;if(!value)throw new Exception(label);}
void Reject(Action work,string label){try{work();throw new Exception("accepted:"+label);}catch(ArgumentException){checks++;}}
bool Same<T>(T[] left,T[] right) where T:struct=>MemoryMarshal.AsBytes(left.AsSpan()).SequenceEqual(MemoryMarshal.AsBytes(right.AsSpan()));
float[] input={-0f,0,0,1,0,0,0,1,0,0,0,1};uint[] topology={0,1,2,0,3,1};
var positions=input.ToArray();var indices=topology.ToArray();var normals=ModelRunner.VertexNormals(ref positions,ref indices,out var sources,out var stability);
var component=new ExtractedComponent("old","triangles","old",new float[]{1,0,0},0,0.5f,positions,normals,indices);
var layout=new PrototypeLayout(component,sources,stability);var bytes=ComputeLayoutCodec.Encode(layout,1_000_000);
var current=layout with{Component=component with{Id="new",Name="new",Color=new float[]{0,1,0}}};
var restored=ComputeLayoutCodec.Decode(bytes,current,(input.Length/3,1_000_000));
Check(Same(restored.Component.Positions,positions)&&Same(restored.Component.Normals,normals)&&Same(restored.Component.Indices,indices)&&Same(restored.Sources,sources),"normals exact arrays");
Check(restored.Stability==stability,"all stability fields");Check(restored.Component.Id=="new"&&restored.Component.Name=="new"&&restored.Component.Color[1]==1,"current metadata bound");Check(!ReferenceEquals(component.PrototypeIdentity,restored.Component.PrototypeIdentity),"fresh prototype");
Check(bytes.SequenceEqual(ComputeLayoutCodec.Encode(restored,1_000_000)),"stable reencode");
var sentinel=layout with{Stability=new(float.PositiveInfinity,1,float.PositiveInfinity,float.PositiveInfinity,0,float.PositiveInfinity)};
Check(ComputeLayoutCodec.Decode(ComputeLayoutCodec.Encode(sentinel,1_000_000),current,(4,1_000_000)).Stability==sentinel.Stability,"infinity sentinels");
var uvComponent=component with{TexCoords=Enumerable.Repeat(-0f,positions.Length/3*2).ToArray(),Tangents=Enumerable.Repeat(1f,positions.Length/3*4).ToArray()};
var uv=new PrototypeLayout(uvComponent,Array.Empty<int>(),null);var uvBytes=ComputeLayoutCodec.Encode(uv,1_000_000);var uvRestored=ComputeLayoutCodec.Decode(uvBytes,current,(4,1_000_000));
Check(Same(uvRestored.Component.TexCoords!,uvComponent.TexCoords!)&&Same(uvRestored.Component.Tangents!,uvComponent.Tangents!),"UV tangent exact including signed zero");
Reject(()=>ComputeLayoutCodec.Decode(bytes,current,(4,bytes.Length-65)),"preallocation budget");
Reject(()=>ComputeLayoutCodec.Decode(bytes,current,(0,1_000_000)),"source topology authority");
Reject(()=>ComputeLayoutCodec.Encode(layout,1),"encode budget");
var bad=bytes.ToArray();BinaryPrimitives.WriteInt32LittleEndian(bad.AsSpan(16),int.MaxValue);Reject(()=>ComputeLayoutCodec.Decode(bad,current,(4,1_000_000)),"count overflow");
bad=bytes.ToArray();BinaryPrimitives.WriteUInt32LittleEndian(bad.AsSpan(64+(positions.Length+normals.Length)*4),uint.MaxValue);Reject(()=>ComputeLayoutCodec.Decode(bad,current,(4,1_000_000)),"bad output index");
bad=bytes.ToArray();BinaryPrimitives.WriteUInt32LittleEndian(bad.AsSpan(40),0x7fc00000);Reject(()=>ComputeLayoutCodec.Decode(bad,current,(4,1_000_000)),"NaN stability");
Check(ComputeLayoutCodec.Digest(input,topology)!=ComputeLayoutCodec.Digest(input.Select(v=>v==0?0f:v).ToArray(),topology),"ordered signed zero input digest");
var a=ComputeLayoutCodec.Arguments(Matrix4x4.CreateTranslation(1,0,0),Matrix4x4.Identity);var b=ComputeLayoutCodec.Arguments(Matrix4x4.Identity,Matrix4x4.CreateTranslation(1,0,0));Check(a!=b,"source baked separate identities");Check(a!=ComputeLayoutCodec.Arguments(Matrix4x4.CreateTranslation(1,0,0),Matrix4x4.Identity,true),"algorithm identity");

Assert.Equal(16,checks);
using var lib=new Library(1);using var run=new TauComputeRun(lib,new(1,1000000,1000000,16,1,(call,inputs)=>call.CanonicalArguments,()=>true,4096));
var call=new TauComputeCall("mesh.normals",ComputeLayoutCodec.Arguments(Matrix4x4.Identity,Matrix4x4.Identity));
run.LookupLayout(call,ComputeLayoutCodec.Digest(input,topology),out var ticket);Assert.NotNull(ticket);
ComputeLayoutCodec.Admit(run,null,(layout,3));
ComputeLayoutCodec.Admit(run,ticket,(layout,0));
ComputeLayoutCodec.Admit(run,ticket,(layout,3));Assert.NotNull(run.LookupLayout(call,ComputeLayoutCodec.Digest(input,topology),out _));
var invalid=layout with{Component=component with{Positions=new float[]{float.NaN,0,0},Normals=new float[3],Indices=new uint[3]},Sources=new int[1]};
ComputeLayoutCodec.Admit(run,ticket,(invalid,3)); // Bad disposable layout cannot fail ordinary delivery.

}}
