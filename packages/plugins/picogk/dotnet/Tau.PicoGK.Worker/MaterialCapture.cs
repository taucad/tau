using System.Numerics;
using System.Security.Cryptography;
using System.Text.Json;
using PicoGK;
using SkiaSharp;

namespace Tau.PicoGK.Worker;

internal sealed record CapturedImage(byte[] Data, string MimeType, string? Name);
internal sealed class MaterialResources
{
    internal List<CapturedImage> Images { get; } = [];
    internal List<Dictionary<string, object?>> Textures { get; } = [];
    internal List<Dictionary<string, object?>> Samplers { get; } = [];
    private readonly Dictionary<string, int> images = [];
    private readonly Dictionary<string, int> textures = [];
    private readonly Dictionary<string, int> samplers = [];

    internal Dictionary<string, object?> Texture(MaterialTexture texture, string path, Dictionary<byte[], string>? digests = null)
    {
        var image = texture.Image ?? throw MaterialCapture.Invalid(path + ".Image", "is required");
        var mime = image.Format switch
        {
            MaterialImageFormat.Png => "image/png",
            MaterialImageFormat.Jpeg => "image/jpeg",
            MaterialImageFormat.WebP => "image/webp",
            _ => throw MaterialCapture.Invalid(path + ".Image.Format", "must be Png, Jpeg or WebP"),
        };
        var data = image.Data;
        if (data is null || data.Length == 0) throw MaterialCapture.Invalid(path + ".Image.Data", "must contain encoded image bytes");
        var signature = image.Format == MaterialImageFormat.Png
            ? data.AsSpan().StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })
            : image.Format == MaterialImageFormat.Jpeg
                ? data.AsSpan().StartsWith(new byte[] { 255, 216, 255 })
                : data.Length >= 12 && data.AsSpan(0, 4).SequenceEqual("RIFF"u8) && data.AsSpan(8, 4).SequenceEqual("WEBP"u8);
        if (!signature) throw MaterialCapture.Invalid(path + ".Image.Data", "does not match its encoded image format");
        if (digests is null || !digests.TryGetValue(data, out var digest))
        {
            digest = Convert.ToHexString(SHA256.HashData(data));
            digests?.Add(data, digest);
        }
        var imageKey = mime + ":" + image.Name + ":" + digest;
        if (!images.TryGetValue(imageKey, out var imageIndex))
        {
            imageIndex = Images.Count;
            images.Add(imageKey, imageIndex);
            Images.Add(new CapturedImage(data, mime, image.Name));
        }
        int? samplerIndex = null;
        if (texture.Sampler is { } sampler)
        {
            if (!Enum.IsDefined(sampler.WrapS) || !Enum.IsDefined(sampler.WrapT) ||
                (sampler.MagFilter is { } mag && !Enum.IsDefined(mag)) ||
                (sampler.MinFilter is { } min && !Enum.IsDefined(min)))
                throw MaterialCapture.Invalid(path + ".Sampler", "must use standard wrap and filter values");
            var value = new Dictionary<string, object?> { ["wrapS"] = (int)sampler.WrapS, ["wrapT"] = (int)sampler.WrapT };
            if (sampler.MagFilter is { } magFilter) value["magFilter"] = (int)magFilter;
            if (sampler.MinFilter is { } minFilter) value["minFilter"] = (int)minFilter;
            var key = JsonSerializer.Serialize(value);
            if (!samplers.TryGetValue(key, out var index))
            {
                index = Samplers.Count;
                samplers.Add(key, index);
                Samplers.Add(value);
            }
            samplerIndex = index;
        }
        var textureKey = imageIndex + ":" + samplerIndex;
        if (!textures.TryGetValue(textureKey, out var textureIndex))
        {
            textureIndex = Textures.Count;
            textures.Add(textureKey, textureIndex);
            var resource = image.Format == MaterialImageFormat.WebP
                ? new Dictionary<string, object?> { ["extensions"] = new Dictionary<string, object?> { ["EXT_texture_webp"] = new Dictionary<string, object?> { ["source"] = imageIndex } } }
                : new Dictionary<string, object?> { ["source"] = imageIndex };
            if (samplerIndex is { } index) resource["sampler"] = index;
            Textures.Add(resource);
        }
        var info = new Dictionary<string, object?> { ["index"] = textureIndex };
        if (texture.Transform is { } transform)
        {
            info["extensions"] = new Dictionary<string, object?>
            {
                ["KHR_texture_transform"] = new Dictionary<string, object?>
                {
                    ["offset"] = new[] { MaterialCapture.Number(transform.Offset.X, path + ".Transform.Offset.X"), MaterialCapture.Number(transform.Offset.Y, path + ".Transform.Offset.Y") },
                    ["scale"] = new[] { MaterialCapture.Number(transform.Scale.X, path + ".Transform.Scale.X"), MaterialCapture.Number(transform.Scale.Y, path + ".Transform.Scale.Y") },
                    ["rotation"] = MaterialCapture.Number(transform.Rotation, path + ".Transform.Rotation"),
                },
            };
        }
        return info;
    }
}

/// <summary>Own author values synchronously, then project them into the shared standard glTF vocabulary.</summary>
internal static class MaterialCapture
{
    internal static WorkerException Invalid(string path, string requirement) => new(new Issue(
        $"PicoGK material {path} {requirement}. Correct this property and retry.", "CS_TAU_RUNTIME", "validation", "error"));

    internal static float Number(float value, string path, float minimum = float.NegativeInfinity, float maximum = float.PositiveInfinity)
    {
        if (!float.IsFinite(value) || value < minimum || value > maximum)
            throw Invalid(path, $"must be finite and within [{minimum}, {maximum}]");
        return value;
    }

    private static float Linear(float value, string path)
    {
        Number(value, path, 0, 1);
        return value <= .04045f ? value / 12.92f : MathF.Pow((value + .055f) / 1.055f, 2.4f);
    }
    private static float[] Color(ColorFloat value, string path, bool alpha = false)
    {
        var result = new[] { Linear(value.R, path + ".R"), Linear(value.G, path + ".G"), Linear(value.B, path + ".B") };
        return alpha ? [.. result, Number(value.A, path + ".A", 0, 1)] : result;
    }

    internal static Material Snapshot(Material material, int group) => Snapshot(material, group, out _);

    internal static Material Snapshot(Material material, int group, out Dictionary<byte[], string> imageDigests, CancellationToken cancellation = default)
    {
        try
        {
            cancellation.ThrowIfCancellationRequested();
            ArgumentNullException.ThrowIfNull(material);
            var ownedImages = new Dictionary<byte[], (byte[] Data, MaterialImageFormat Format)>(ReferenceEqualityComparer.Instance);
            MaterialTexture? Copy(MaterialTexture? texture, string path)
            {
                cancellation.ThrowIfCancellationRequested();
                if (texture is null) return null;
                var image = texture.Image ?? throw Invalid(path + ".Image", "is required");
                if (!Enum.IsDefined(image.Format)) throw Invalid(path + ".Image.Format", "must be Auto, Png, Jpeg or WebP");
                var data = image.Data ?? throw Invalid(path + ".Image.Data", "is required");
                if (!ownedImages.TryGetValue(data, out var owned))
                {
                    var bytes = data.ToArray();
                    owned = (bytes, ValidateImage(bytes, path + ".Image", cancellation));
                    ownedImages.Add(data, owned);
                }
                if (image.Format != MaterialImageFormat.Auto && image.Format != owned.Format)
                    throw Invalid(path + ".Image.Data", "does not match its encoded image format");
                return texture with { Image = image with { Data = owned.Data, Format = owned.Format } };
            }
            var copy = material with
            {
                ColorTexture = Copy(material.ColorTexture, "ColorTexture"), MetallicRoughnessTexture = Copy(material.MetallicRoughnessTexture, "MetallicRoughnessTexture"),
                NormalTexture = Copy(material.NormalTexture, "NormalTexture"), OcclusionTexture = Copy(material.OcclusionTexture, "OcclusionTexture"), EmissiveTexture = Copy(material.EmissiveTexture, "EmissiveTexture"),
                Anisotropy = material.Anisotropy is { } a ? a with { Texture = Copy(a.Texture, "Anisotropy.Texture") } : null,
                Clearcoat = material.Clearcoat is { } c ? c with { Texture = Copy(c.Texture, "Clearcoat.Texture"), RoughnessTexture = Copy(c.RoughnessTexture, "Clearcoat.RoughnessTexture"), NormalTexture = Copy(c.NormalTexture, "Clearcoat.NormalTexture") } : null,
                Iridescence = material.Iridescence is { } i ? i with { Texture = Copy(i.Texture, "Iridescence.Texture"), ThicknessTexture = Copy(i.ThicknessTexture, "Iridescence.ThicknessTexture") } : null,
                Sheen = material.Sheen is { } s ? s with { ColorTexture = Copy(s.ColorTexture, "Sheen.ColorTexture"), RoughnessTexture = Copy(s.RoughnessTexture, "Sheen.RoughnessTexture") } : null,
                Specular = material.Specular is { } p ? p with { Texture = Copy(p.Texture, "Specular.Texture"), ColorTexture = Copy(p.ColorTexture, "Specular.ColorTexture") } : null,
                Transmission = material.Transmission is { } t ? t with { Texture = Copy(t.Texture, "Transmission.Texture") } : null,
                Volume = material.Volume is { } v ? v with { ThicknessTexture = Copy(v.ThicknessTexture, "Volume.ThicknessTexture") } : null,
            };
            var digests = new Dictionary<byte[], string>(ReferenceEqualityComparer.Instance);
            _ = Project(copy, new MaterialResources(), digests);
            imageDigests = digests;
            return copy;
        }
        catch (WorkerException error)
        {
            throw new WorkerException(error.Issues.Select(issue => issue with { Message = $"Group {group}: {issue.Message}" }).ToArray());
        }
    }

    // New private image-admission bound: full RGBA decode validation must fit 256 MiB.
    // This does not describe encoded-byte retention or the geometry capture queue budget.
    private const long MaximumDecodedImageBytes = 256L * 1024 * 1024;

    private static MaterialImageFormat ValidateImage(byte[] data, string path, CancellationToken cancellation)
    {
        if (data.Length == 0) throw Invalid(path + ".Data", "must contain encoded image bytes");
        using var encoded = new MemoryStream(data, writable: false);
        using var codec = SKCodec.Create(encoded);
        if (codec is null) throw Invalid(path + ".Data", "must contain a complete supported PNG, JPEG or WebP image");
        var format = codec.EncodedFormat switch
        {
            SKEncodedImageFormat.Png => MaterialImageFormat.Png,
            SKEncodedImageFormat.Jpeg => MaterialImageFormat.Jpeg,
            SKEncodedImageFormat.Webp => MaterialImageFormat.WebP,
            _ => throw Invalid(path + ".Data", "must contain a supported PNG, JPEG or WebP image"),
        };
        // Some codecs report a complete raster before checking the container trailer.
        var complete = format switch
        {
            MaterialImageFormat.Png => data.AsSpan().EndsWith(new byte[] { 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 }),
            MaterialImageFormat.Jpeg => data.AsSpan().EndsWith(new byte[] { 255, 217 }),
            // The preceding codec format switch admits exactly these three formats;
            // Skia WebP detection requires at least 14 signature bytes.
            _ => (ulong)System.Buffers.Binary.BinaryPrimitives.ReadUInt32LittleEndian(data.AsSpan(4, 4)) + 8 == (ulong)data.Length,
        };
        if (!complete) throw Invalid(path + ".Data", "must contain a complete PNG, JPEG or WebP image container");
        var size = codec.Info;
        // Supported codec header parsers reject nonpositive dimensions before Create succeeds.
        if (checked((long)size.Width * size.Height) > MaximumDecodedImageBytes / 4)
            throw Invalid(path + ".Data", "decoded RGBA image must fit within 256 MiB");
        cancellation.ThrowIfCancellationRequested();
        var info = new SKImageInfo(size.Width, size.Height, SKColorType.Rgba8888, SKAlphaType.Unpremul);
        using var pixels = new SKBitmap(info);
        var frames = Math.Max(1, codec.FrameCount);
        for (var frame = 0; frame < frames; frame++)
        {
            cancellation.ThrowIfCancellationRequested();
            if (codec.GetPixels(info, pixels.GetPixels(), new SKCodecOptions(frame)) != SKCodecResult.Success)
                throw Invalid(path + ".Data", "must contain a complete valid PNG, JPEG or WebP image");
        }
        cancellation.ThrowIfCancellationRequested();
        return format;
    }

    internal static bool NeedsCoordinates(Material material) =>
        material.ColorTexture is not null || material.MetallicRoughnessTexture is not null || material.NormalTexture is not null ||
        material.OcclusionTexture is not null || material.EmissiveTexture is not null || material.Anisotropy is not null ||
        material.Clearcoat is { } c && (c.Texture is not null || c.RoughnessTexture is not null || c.NormalTexture is not null) ||
        material.Iridescence is { } i && (i.Texture is not null || i.ThicknessTexture is not null) ||
        material.Sheen is { } s && (s.ColorTexture is not null || s.RoughnessTexture is not null) ||
        material.Specular is { } p && (p.Texture is not null || p.ColorTexture is not null) ||
        material.Transmission?.Texture is not null || material.Volume?.ThicknessTexture is not null;

    internal static JsonElement Project(Material material, MaterialResources resources, Dictionary<byte[], string>? ownedDigests = null)
    {
        // The backend owns these keys (cloned byte arrays), so digests survive exports of
        // that material generation. Direct internal callers still get a per-projection map.
        var digests = ownedDigests ?? new Dictionary<byte[], string>(ReferenceEqualityComparer.Instance);
        var extensions = new Dictionary<string, object?>();
        var pbr = new Dictionary<string, object?>
        {
            ["baseColorFactor"] = Color(material.Color, "Color", true),
            ["metallicFactor"] = Number(material.Metallic, "Metallic", 0, 1),
            ["roughnessFactor"] = Number(material.Roughness, "Roughness", 0, 1),
        };
        void Map(Dictionary<string, object?> owner, string key, MaterialTexture? texture, string path, float? modifier = null, string modifierKey = "scale")
        {
            if (texture is null) return;
            var info = resources.Texture(texture, path, digests);
            if (modifier is { } number) info[modifierKey] = number;
            owner[key] = info;
        }
        Map(pbr, "baseColorTexture", material.ColorTexture, "ColorTexture");
        Map(pbr, "metallicRoughnessTexture", material.MetallicRoughnessTexture, "MetallicRoughnessTexture");
        if (material.AlphaMode is { } mode && !Enum.IsDefined(mode)) throw Invalid("AlphaMode", "must be Opaque, Mask or Blend");
        var result = new Dictionary<string, object?>
        {
            ["pbrMetallicRoughness"] = pbr,
            ["doubleSided"] = material.DoubleSided,
            ["alphaMode"] = (material.AlphaMode ?? (material.Color.A < 1 ? MaterialAlphaMode.Blend : MaterialAlphaMode.Opaque)).ToString().ToUpperInvariant(),
            ["alphaCutoff"] = Number(material.AlphaCutoff, "AlphaCutoff", 0),
            ["emissiveFactor"] = Color(material.Emissive, "Emissive"),
        };
        if (material.Name is not null) result["name"] = material.Name;
        Map(result, "normalTexture", material.NormalTexture, "NormalTexture", Number(material.NormalScale, "NormalScale"));
        Map(result, "occlusionTexture", material.OcclusionTexture, "OcclusionTexture", Number(material.OcclusionStrength, "OcclusionStrength", 0, 1), "strength");
        Map(result, "emissiveTexture", material.EmissiveTexture, "EmissiveTexture");
        extensions["KHR_materials_emissive_strength"] = new Dictionary<string, object?> { ["emissiveStrength"] = Number(material.EmissiveStrength, "EmissiveStrength", 0) };
        if (material.Unlit) extensions["KHR_materials_unlit"] = new Dictionary<string, object?>();
        if (material.Ior is { } ior)
        {
            Number(ior, "Ior", 0);
            if (ior > 0 && ior < 1) throw Invalid("Ior", "must be zero or at least 1");
            extensions["KHR_materials_ior"] = new Dictionary<string, object?> { ["ior"] = ior };
        }
        if (material.Dispersion is { } dispersion) extensions["KHR_materials_dispersion"] = new Dictionary<string, object?> { ["dispersion"] = Number(dispersion, "Dispersion", 0) };
        if (material.Anisotropy is { } a)
        {
            if (material.Unlit) throw Invalid("Anisotropy", "must not be combined with Unlit");
            var value = new Dictionary<string, object?> { ["anisotropyStrength"] = Number(a.Strength, "Anisotropy.Strength", 0, 1), ["anisotropyRotation"] = Number(a.Rotation, "Anisotropy.Rotation") };
            Map(value, "anisotropyTexture", a.Texture, "Anisotropy.Texture"); extensions["KHR_materials_anisotropy"] = value;
        }
        if (material.Clearcoat is { } c)
        {
            var value = new Dictionary<string, object?> { ["clearcoatFactor"] = Number(c.Factor, "Clearcoat.Factor", 0, 1), ["clearcoatRoughnessFactor"] = Number(c.Roughness, "Clearcoat.Roughness", 0, 1) };
            Map(value, "clearcoatTexture", c.Texture, "Clearcoat.Texture"); Map(value, "clearcoatRoughnessTexture", c.RoughnessTexture, "Clearcoat.RoughnessTexture");
            Map(value, "clearcoatNormalTexture", c.NormalTexture, "Clearcoat.NormalTexture", Number(c.NormalScale, "Clearcoat.NormalScale")); extensions["KHR_materials_clearcoat"] = value;
        }
        if (material.Iridescence is { } i)
        {
            var minimum = Number(i.ThicknessMinimum, "Iridescence.ThicknessMinimum", 0); var maximum = Number(i.ThicknessMaximum, "Iridescence.ThicknessMaximum", minimum);
            var value = new Dictionary<string, object?> { ["iridescenceFactor"] = Number(i.Factor, "Iridescence.Factor", 0, 1), ["iridescenceIor"] = Number(i.Ior, "Iridescence.Ior", 1), ["iridescenceThicknessMinimum"] = minimum, ["iridescenceThicknessMaximum"] = maximum };
            Map(value, "iridescenceTexture", i.Texture, "Iridescence.Texture"); Map(value, "iridescenceThicknessTexture", i.ThicknessTexture, "Iridescence.ThicknessTexture"); extensions["KHR_materials_iridescence"] = value;
        }
        if (material.Sheen is { } s)
        {
            var value = new Dictionary<string, object?> { ["sheenColorFactor"] = Color(s.Color, "Sheen.Color"), ["sheenRoughnessFactor"] = Number(s.Roughness, "Sheen.Roughness", 0, 1) };
            Map(value, "sheenColorTexture", s.ColorTexture, "Sheen.ColorTexture"); Map(value, "sheenRoughnessTexture", s.RoughnessTexture, "Sheen.RoughnessTexture"); extensions["KHR_materials_sheen"] = value;
        }
        if (material.Specular is { } p)
        {
            var value = new Dictionary<string, object?> { ["specularFactor"] = Number(p.Factor, "Specular.Factor", 0, 1), ["specularColorFactor"] = Color(p.Color, "Specular.Color") };
            Map(value, "specularTexture", p.Texture, "Specular.Texture"); Map(value, "specularColorTexture", p.ColorTexture, "Specular.ColorTexture"); extensions["KHR_materials_specular"] = value;
        }
        if (material.Transmission is { } t)
        {
            var value = new Dictionary<string, object?> { ["transmissionFactor"] = Number(t.Factor, "Transmission.Factor", 0, 1) };
            Map(value, "transmissionTexture", t.Texture, "Transmission.Texture"); extensions["KHR_materials_transmission"] = value;
        }
        if (material.Volume is { } v)
        {
            var value = new Dictionary<string, object?> { ["thicknessFactor"] = Number(v.Thickness, "Volume.Thickness", 0), ["attenuationColor"] = Color(v.AttenuationColor, "Volume.AttenuationColor") };
            if (v.AttenuationDistance is { } distance)
            {
                Number(distance, "Volume.AttenuationDistance", 0);
                if (distance == 0) throw Invalid("Volume.AttenuationDistance", "must be positive");
                value["attenuationDistance"] = distance;
            }
            Map(value, "thicknessTexture", v.ThicknessTexture, "Volume.ThicknessTexture"); extensions["KHR_materials_volume"] = value;
        }
        result["extensions"] = extensions;
        return JsonSerializer.SerializeToElement(result);
    }
}
