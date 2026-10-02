using System.Text.Json;
using System.Text.Json.Serialization;
using PicoGK;
using SkiaSharp;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;
public sealed partial class WorkerTests
{
    private sealed class UnsupportedIgnore
    {
        public int Calls;
        public int First { get { Calls++; return 1; } }
        [JsonIgnore(Condition = (JsonIgnoreCondition)99)] public int Invalid { get { Calls++; return 2; } }
    }
    private sealed class ReferenceDefaults
    {
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public string? Missing => null;
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public string Present => "kept";
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public int? Nullable => null;
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] public string NonNull => "kept";
    }
    private readonly struct FailingDefault : IEquatable<FailingDefault>
    {
        public static Exception Failure = new InvalidOperationException("equality");
        public bool Equals(FailingDefault other) => throw Failure;
        public override bool Equals(object? value) => value is FailingDefault other && Equals(other);
        public override int GetHashCode() => 0;
    }
    private sealed class FailingDefaultOwner
    {
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] public FailingDefault Value => default;
    }

    [Fact]
    public void AuthorAttributesRejectBeforeGettersAndPreserveDefaultFailureSemantics()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "attribute-coverage"));
        var invalid = new UnsupportedIgnore();
        backend.SetMechanism(invalid);
        var rejected = backend.Extract();
        Assert.Null(rejected.Mechanism);
        Assert.Equal(0, invalid.Calls);
        Assert.Contains("Unsupported JsonIgnore condition", Assert.Single(rejected.Warnings).Message);
        backend.SetMechanism(new ReferenceDefaults());
        var json = backend.Extract().Mechanism!.Value;
        Assert.False(json.TryGetProperty("Missing", out _));
        Assert.False(json.TryGetProperty("Nullable", out _));
        Assert.Equal("kept", json.GetProperty("Present").GetString());
        Assert.Equal("kept", json.GetProperty("NonNull").GetString());
        backend.SetMechanism(new CriticalProbe(new InvalidOperationException("ordinary getter")));
        Assert.Null(backend.Extract().Mechanism);
        Assert.Contains("Exception has been thrown by the target of an invocation", backend.Extract().Warnings.Last().Message);
        FailingDefault.Failure = new InvalidOperationException("ordinary equality");
        backend.SetMechanism(new FailingDefaultOwner());
        Assert.Null(backend.Extract().Mechanism);
        Assert.Contains("Exception has been thrown by the target of an invocation", backend.Extract().Warnings.Last().Message);
        var failure = new OutOfMemoryException("critical equality");
        FailingDefault.Failure = failure;
        Assert.Same(failure, Assert.Throws<OutOfMemoryException>(() => backend.SetMechanism(new FailingDefaultOwner())));
    }

    [Fact]
    public void AuthorCompleteStructuralVocabularyCanonicalizesOnlyKnownDtoFields()
    {
        using var backend = new CaptureViewerBackend(Path.Combine(root, "vocabulary-coverage"));
        var limits = new { Lower = -1, Upper = 1, Custom = 7 };
        backend.SetMechanism(new {
            SchemaVersion = 1, Units = new { Length = "mm", Angle = "deg", Custom = 7 }, Root = "ID", Custom = 7,
            Links = new Dictionary<string, object> { ["ID"] = new { Shapes = new[] { "Shape" }, Components = new[] { "component:0" }, Custom = 7 } },
            Joints = new Dictionary<string, object> { ["Joint"] = new {
                Name = "Joint", Parent = "ID", Child = "ID2", Origin = new[] { 0, 0, 0 }, Type = "screw", Axis = new[] { 1, 0, 0 }, Lead = 2, Handedness = "right", Normal = new[] { 0, 0, 1 }, XAxis = new[] { 1, 0, 0 }, Custom = 7,
                Limits = new { Lower = -1, Upper = 1, Angle = limits, Distance = limits, X = limits, Y = limits, Custom = 7 }
            } },
            Couplings = new[] { new { Driver = "Joint", Follower = "Follower", Ratio = 2, Offset = 0, Curve = new { DriverPeriod = 360, Values = new[] { 0, 1 }, Custom = 7 }, Custom = 7 } },
            Animations = new[] { new { Id = "motion", Name = "Motion", Duration = 1, Loop = "none", Keyframes = new[] { new { Time = 0, Coordinates = new Dictionary<string, int> { ["Joint"] = 0 }, Custom = 7 } }, Custom = 7 } },
        });
        var json = backend.Extract().Mechanism!.Value;
        void Keys(JsonElement owner, params string[] expected) => Assert.Equal(expected.Order(), owner.EnumerateObject().Select(p => p.Name).Order());
        Keys(json, "schemaVersion", "units", "root", "links", "joints", "couplings", "animations", "Custom");
        Keys(json.GetProperty("units"), "length", "angle", "Custom");
        Keys(json.GetProperty("links").GetProperty("ID"), "shapes", "components", "Custom");
        var joint = json.GetProperty("joints").GetProperty("Joint");
        Keys(joint, "name", "parent", "child", "origin", "type", "axis", "limits", "lead", "handedness", "normal", "xAxis", "Custom");
        var bounds = joint.GetProperty("limits");
        Keys(bounds, "lower", "upper", "angle", "distance", "x", "y", "Custom");
        foreach (var key in new[] { "angle", "distance", "x", "y" }) Keys(bounds.GetProperty(key), "lower", "upper", "Custom");
        var coupling = json.GetProperty("couplings")[0];
        Keys(coupling, "driver", "follower", "ratio", "offset", "curve", "Custom");
        Keys(coupling.GetProperty("curve"), "driverPeriod", "values", "Custom");
        var animation = json.GetProperty("animations")[0];
        Keys(animation, "id", "name", "duration", "loop", "keyframes", "Custom");
        Keys(animation.GetProperty("keyframes")[0], "time", "coordinates", "Custom");
        Assert.Empty(backend.Extract().Warnings);
    }

    [Fact]
    public void AuthorDirectProjectionRetainsEncodedImageTrustValidation()
    {
        foreach (var image in new[] {
            new MaterialImage { Data = MaterialPng, Format = MaterialImageFormat.Auto },
            new MaterialImage { Data = null!, Format = MaterialImageFormat.Png },
            new MaterialImage { Data = [], Format = MaterialImageFormat.Png },
            new MaterialImage { Data = [0], Format = MaterialImageFormat.Png },
            new MaterialImage { Data = [0], Format = MaterialImageFormat.Jpeg },
            new MaterialImage { Data = [0], Format = MaterialImageFormat.WebP },
            new MaterialImage { Data = "NOPE1234WEBP"u8.ToArray(), Format = MaterialImageFormat.WebP },
            new MaterialImage { Data = "RIFF1234NOPE"u8.ToArray(), Format = MaterialImageFormat.WebP },
        }) {
            var error = Assert.Throws<WorkerException>(() => MaterialCapture.Project(new Material { ColorTexture = new() { Image = image } }, new()));
            Assert.Equal("CS_TAU_RUNTIME", Assert.Single(error.Issues).Code);
            Assert.Contains("ColorTexture.Image", error.Issues[0].Message);
        }
        var resources = new MaterialResources();
        var texture = new MaterialTexture { Image = new() { Data = MaterialPng, Format = MaterialImageFormat.Png } };
        var first = resources.Texture(texture, "ColorTexture", new());
        var second = resources.Texture(texture, "NormalTexture", new());
        Assert.Equal(first["index"], second["index"]);
        Assert.Single(resources.Images);
    }

    [Fact]
    public void AuthorCompletePngContainerRejectsCorruptRasterAtActualDecoder()
    {
        var bytes = EncodeImage(SKEncodedImageFormat.Png);
        // Keep the complete PNG container and its IHDR, corrupt the compressed IDAT stream.
        var offset = 8;
        while (!bytes.AsSpan(offset + 4, 4).SequenceEqual("IDAT"u8))
            offset += 12 + (int)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(bytes.AsSpan(offset, 4));
        bytes[offset + 8] = 0;
        using var codec = SKCodec.Create(new MemoryStream(bytes, false));
        Assert.NotNull(codec);
        using var pixels = new SKBitmap(new SKImageInfo(codec.Info.Width, codec.Info.Height, SKColorType.Rgba8888, SKAlphaType.Unpremul));
        Assert.NotEqual(SKCodecResult.Success, codec.GetPixels(pixels.Info, pixels.GetPixels(), new SKCodecOptions(0)));
        var error = Assert.Throws<WorkerException>(() => MaterialCapture.Snapshot(new Material { ColorTexture = new() { Image = new() { Data = bytes } } }, 9));
        Assert.Contains("complete valid PNG", Assert.Single(error.Issues).Message);
    }
    [Fact]
    public void AuthorZeroDimensionHeadersFailAtCodecAdmission()
    {
        foreach (var dimensionOffset in new[] { 16, 20 })
        {
            var bytes = EncodeImage(SKEncodedImageFormat.Png);
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(dimensionOffset), 0);
            uint crc = uint.MaxValue;
            foreach (var value in bytes.AsSpan(12, 17))
            {
                crc ^= value;
                for (var bit = 0; bit < 8; bit++) crc = (crc & 1) == 0 ? crc >> 1 : (crc >> 1) ^ 0xedb88320;
            }
            System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(bytes.AsSpan(29), ~crc);
            using var codec = SKCodec.Create(new MemoryStream(bytes, false));
            Assert.Null(codec);
            var error = Assert.Throws<WorkerException>(() => MaterialCapture.Snapshot(new Material { ColorTexture = new() { Image = new() { Data = bytes } } }, 3));
            Assert.Contains("complete supported PNG", Assert.Single(error.Issues).Message);
        }
    }

}
