using System.Numerics;
using System.Text.Json;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    private static readonly byte[] MaterialPng = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=");
    private static MaterialTexture Texture() => new()
    {
        Image = new MaterialImage { Data = MaterialPng.ToArray(), Format = MaterialImageFormat.Png, Name = "shared" },
        Sampler = new MaterialSampler { MagFilter = MaterialMagFilter.Linear, MinFilter = MaterialMinFilter.LinearMipmapLinear },
        Transform = new MaterialTextureTransform { Offset = new(.2f, .3f), Scale = new(2, 3), Rotation = .4f },
    };
    private static Material RichMaterial(MaterialTexture texture) => new()
    {
        Name = "Coated copper", Color = new("B8733380"), Metallic = .8f, Roughness = .25f,
        ColorTexture = texture, MetallicRoughnessTexture = texture, NormalTexture = texture, NormalScale = .5f,
        OcclusionTexture = texture, OcclusionStrength = .4f, Emissive = new("804020"), EmissiveStrength = 2, EmissiveTexture = texture,
        AlphaMode = MaterialAlphaMode.Mask, AlphaCutoff = .4f, DoubleSided = false, Ior = 1.5f, Dispersion = .2f,
        Anisotropy = new() { Strength = .8f, Rotation = .3f, Texture = texture },
        Clearcoat = new() { Factor = .4f, Roughness = .2f, Texture = texture, RoughnessTexture = texture, NormalTexture = texture, NormalScale = .6f },
        Iridescence = new() { Factor = .2f, Texture = texture, ThicknessTexture = texture },
        Sheen = new() { Color = new("804020"), Roughness = .2f, ColorTexture = texture, RoughnessTexture = texture },
        Specular = new() { Factor = .9f, Color = new("804020"), Texture = texture, ColorTexture = texture },
        Transmission = new() { Factor = .3f, Texture = texture },
        Volume = new() { Thickness = .002f, AttenuationDistance = .25f, AttenuationColor = new("804020"), ThicknessTexture = texture },
    };

    [Fact]
    public void ImageOwnershipIsSharedWithinOneSnapshotAndFreshAcrossSetters()
    {
        var texture = Texture();
        var material = RichMaterial(texture);
        var first = MaterialCapture.Snapshot(material, 0);
        Assert.NotSame(texture.Image.Data, first.ColorTexture!.Image.Data);
        Assert.Same(first.ColorTexture.Image.Data, first.NormalTexture!.Image.Data);
        Assert.Same(first.ColorTexture.Image.Data, first.Volume!.ThicknessTexture!.Image.Data);
        var second = MaterialCapture.Snapshot(material, 0);
        Assert.NotSame(first.ColorTexture.Image.Data, second.ColorTexture!.Image.Data);
        texture.Image.Data[0] = 0;
        Assert.Equal(MaterialPng, first.ColorTexture.Image.Data);
        Assert.Equal(MaterialPng, second.ColorTexture.Image.Data);
        var invalid = Assert.Throws<WorkerException>(() => MaterialCapture.Snapshot(material, 0));
        Assert.Equal("CS_TAU_RUNTIME", Assert.Single(invalid.Issues).Code);
        var resources = new MaterialResources();
        var json = MaterialCapture.Project(first, resources);
        Assert.Equal(.5f, json.GetProperty("normalTexture").GetProperty("scale").GetSingle());
        Assert.Equal(.4f, json.GetProperty("occlusionTexture").GetProperty("strength").GetSingle());
        Assert.Single(resources.Images);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(100)]
    [InlineData(1000)]
    public void RepeatedOccurrencesShareOneMaterialProjectionWithinEachExport(int count)
    {
        using var library = new Library(1f);
        using var mesh = new Mesh(library);
        mesh.nAddTriangle(Vector3.Zero, Vector3.UnitX, Vector3.UnitY);
        using var backend = new CaptureViewerBackend(Path.Combine(root, "material-reuse"));
        backend.SetGroupMaterial(0, RichMaterial(Texture()));
        for (var index = 0; index < count; index++)
        {
            using var placed = mesh.mshCreateTransformed(Vector3.One, new Vector3(index * 2, 0, 0));
            backend.Add(placed, $"Bolt/{index}", 0);
        }
        var first = backend.Extract();
        Assert.Equal(count, first.Components.Count);
        var projected = first.Components[0].Material;
        Assert.NotNull(projected);
        Assert.All(first.Components, component => Assert.Equal(projected, component.Material));
        Assert.Single(first.Resources!.Images);
        var second = backend.Extract();
        Assert.NotEqual(projected, second.Components[0].Material);
        Assert.Equal(projected.Value.GetRawText(), second.Components[0].Material!.Value.GetRawText());
        Assert.Single(second.Resources!.Images);
    }

    [Fact]
    public void TypedMaterialsSnapshotEveryMapAndProjectCanonicalResources()
    {
        var texture = Texture(); var material = RichMaterial(texture);
        var snapshot = MaterialCapture.Snapshot(material, 7);
        texture.Image.Data[0] = 0;
        var resources = new MaterialResources(); var json = MaterialCapture.Project(snapshot, resources);
        Assert.Equal("Coated copper", json.GetProperty("name").GetString());
        Assert.Equal("MASK", json.GetProperty("alphaMode").GetString());
        Assert.False(json.GetProperty("doubleSided").GetBoolean());
        Assert.InRange(json.GetProperty("pbrMetallicRoughness").GetProperty("baseColorFactor")[0].GetSingle(), .47f, .49f);
        Assert.Equal(.002f, json.GetProperty("extensions").GetProperty("KHR_materials_volume").GetProperty("thicknessFactor").GetSingle());
        Assert.Equal(MaterialPng, Assert.Single(resources.Images).Data);
        Assert.Single(resources.Textures); Assert.Single(resources.Samplers);
        var normal = json.GetProperty("normalTexture"); Assert.Equal(.5f, normal.GetProperty("scale").GetSingle());
        Assert.Equal(3, normal.GetProperty("extensions").GetProperty("KHR_texture_transform").GetProperty("scale")[1].GetSingle());
        _ = MaterialCapture.Project(snapshot, resources);
        Assert.Single(resources.Images); Assert.Single(resources.Textures); Assert.Single(resources.Samplers);
        Assert.True(MaterialCapture.NeedsCoordinates(snapshot));
        var defaults = MaterialCapture.Project(MaterialCapture.Snapshot(new Material(), 0), new());
        Assert.Equal("OPAQUE", defaults.GetProperty("alphaMode").GetString());
        Assert.False(MaterialCapture.NeedsCoordinates(new Material()));
        Assert.Equal("BLEND", MaterialCapture.Project(new Material { Color = new(.5f, .5f) }, new()).GetProperty("alphaMode").GetString());
        Assert.True(MaterialCapture.Project(new Material { Unlit = true, Ior = 0, Volume = new() }, new()).GetProperty("extensions").TryGetProperty("KHR_materials_unlit", out _));
    }

    [Fact]
    public void ResourceIdentitySeparatesSamplersAndPreservesWebpAndJpeg()
    {
        var resources = new MaterialResources(); var texture = Texture();
        _ = resources.Texture(texture, "ColorTexture");
        _ = resources.Texture(texture with { Transform = null, Sampler = null }, "NormalTexture");
        _ = resources.Texture(texture with { Sampler = new() }, "Sheen.Texture");
        _ = resources.Texture(texture with { Image = texture.Image with { Name = null, Data = [255, 216, 255, 0], Format = MaterialImageFormat.Jpeg } }, "Jpeg");
        _ = resources.Texture(texture with { Image = texture.Image with { Data = "RIFF1234WEBP"u8.ToArray(), Format = MaterialImageFormat.WebP } }, "WebP");
        Assert.Equal(3, resources.Images.Count); Assert.Equal(5, resources.Textures.Count); Assert.Equal(2, resources.Samplers.Count);
        Assert.True(resources.Textures.Last().ContainsKey("extensions"));
    }

    [Fact]
    public void EveryMapRequestsCoordinatesAndArtifactOwnsEncodedImages()
    {
        var texture = Texture();
        Material[] mapped = [
            new() { ColorTexture = texture }, new() { MetallicRoughnessTexture = texture }, new() { NormalTexture = texture },
            new() { OcclusionTexture = texture }, new() { EmissiveTexture = texture }, new() { Anisotropy = new() },
            new() { Clearcoat = new() { Texture = texture } }, new() { Clearcoat = new() { RoughnessTexture = texture } }, new() { Clearcoat = new() { NormalTexture = texture } },
            new() { Iridescence = new() { Texture = texture } }, new() { Iridescence = new() { ThicknessTexture = texture } },
            new() { Sheen = new() { ColorTexture = texture } }, new() { Sheen = new() { RoughnessTexture = texture } },
            new() { Specular = new() { Texture = texture } }, new() { Specular = new() { ColorTexture = texture } },
            new() { Transmission = new() { Texture = texture } }, new() { Volume = new() { ThicknessTexture = texture } },
        ];
        Assert.All(mapped, material => Assert.True(MaterialCapture.NeedsCoordinates(material)));
        Assert.False(MaterialCapture.NeedsCoordinates(new Material { Clearcoat = new(), Iridescence = new(), Sheen = new(), Specular = new(), Transmission = new(), Volume = new() }));
        var resources = new MaterialResources(); _ = MaterialCapture.Project(RichMaterial(texture), resources);
        var execution = new ModelExecutionResult([], 0, false, new(0,0,0,0,0,0), null, [], resources);
        var artifact = MeshArtifactWriter.Write(root, execution, new WorkerDiagnostics(new(false,0,0,0,0,0,0,0,0,0,0,0),new(0,0,0)));
        var image = Assert.Single(artifact.Images!);
        Assert.Equal(MaterialPng, File.ReadAllBytes(artifact.ArtifactPath).AsSpan((int)image.Offset, image.ByteLength).ToArray());
    }

    [Fact]
    public void TypedAdmissionNamesGroupPropertyAndRecoveryForInvalidValues()
    {
        var texture = Texture();
        Material[] invalid = [
            new() { Metallic = -1 }, new() { Roughness = float.NaN }, new() { Ior = .5f }, new() { Ior = -1 }, new() { Dispersion = -1 },
            new() { Color = new(-1, 0, 0) }, new() { Color = new(0, 0, 0, 2) }, new() { AlphaMode = (MaterialAlphaMode)99 },
            new() { Unlit = true, Anisotropy = new() }, new() { Anisotropy = new() { Strength = 2 } },
            new() { Volume = new() { AttenuationDistance = 0 } }, new() { Volume = new() { AttenuationDistance = -1 } },
            new() { Iridescence = new() { ThicknessMinimum = 500 } }, new() { Iridescence = new() { Ior = .5f } },
            new() { NormalTexture = new MaterialTexture { Image = null! } }, new() { NormalTexture = texture with { Image = texture.Image with { Data = null! } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Data = [] } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Format = (MaterialImageFormat)99 } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Data = [0] } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Data = [0], Format = MaterialImageFormat.WebP } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Data = "xxxx1234WEBP"u8.ToArray(), Format = MaterialImageFormat.WebP } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Data = "RIFF1234xxxx"u8.ToArray(), Format = MaterialImageFormat.WebP } } },
            new() { NormalTexture = texture with { Image = texture.Image with { Data = [0], Format = MaterialImageFormat.Jpeg } } },
            new() { NormalTexture = texture with { Sampler = new() { WrapS = (MaterialWrap)99 } } },
            new() { NormalTexture = texture with { Sampler = new() { WrapT = (MaterialWrap)99 } } },
            new() { NormalTexture = texture with { Sampler = new() { MagFilter = (MaterialMagFilter)99 } } },
            new() { NormalTexture = texture with { Sampler = new() { MinFilter = (MaterialMinFilter)99 } } },
            new() { NormalTexture = texture with { Transform = new() { Offset = new(float.PositiveInfinity, 0) } } },
        ];
        foreach (var value in invalid)
        {
            var error = Assert.Throws<WorkerException>(() => MaterialCapture.Snapshot(value, 7));
            var issue = Assert.Single(error.Issues); Assert.Equal("CS_TAU_RUNTIME", issue.Code);
            Assert.Contains("Group 7:", issue.Message); Assert.Contains("Correct this property and retry", issue.Message);
        }
        Assert.Throws<ArgumentNullException>(() => MaterialCapture.Snapshot(null!, 0));
        Assert.Throws<WorkerException>(() => new MaterialResources().Texture(new MaterialTexture { Image = null! }, "ColorTexture"));
    }

    [Fact]
    public void BoxChartsPreserveSmoothNormalsAndUseActualUvDerivatives()
    {
        // Tilted triangle: +Z chart, dP/dU has Z=.6, not the projected X gradient.
        float[] model = [0, 0, 0, 10, 0, 6, 0, 10, 4]; uint[] indices = [0, 1, 2];
        var coordinates = SurfaceCoordinates.Project(model, indices);
        var positions = model.ToArray(); var smooth = ModelRunner.VertexNormals(ref positions, ref indices, out _);
        var (_, tangents) = SurfaceCoordinates.Expand(coordinates, smooth, Matrix4x4.Identity);
        var expected = Vector3.Normalize(new Vector3(10, 0, 6));
        Assert.InRange(Vector3.Distance(expected, new(tangents[0], tangents[1], tangents[2])), 0, .00001f);
        var collapsed = SurfaceCoordinates.Project([0,0,0], [0,0,0]);
        foreach (var normal in new[] { Vector3.UnitX, Vector3.UnitY })
        {
            var result = SurfaceCoordinates.Expand(collapsed, [normal.X,normal.Y,normal.Z], Matrix4x4.CreateScale(-1));
            Assert.All(result.Tangents, value => Assert.True(float.IsFinite(value)));
        }
        var parallel = collapsed with { U = [Vector3.UnitX], V = [Vector3.UnitZ] };
        Assert.All(SurfaceCoordinates.Expand(parallel, [1,0,0], Matrix4x4.Identity).Tangents, value => Assert.True(float.IsFinite(value)));
        var mirrored = collapsed with { U = [Vector3.UnitX], V = [-Vector3.UnitY] };
        Assert.Equal(-1, SurfaceCoordinates.Expand(mirrored, [0,0,1], Matrix4x4.Identity).Tangents[3]);
        // Degenerate chart spans cannot introduce nonfinite coordinates.
        float[] thin = [0, 0, 0, 0, 1, 0, 0, 0, 1];
        foreach (var triangle in new uint[][] { [0, 1, 2], [0, 2, 1], [0, 0, 0] })
        {
            var projection = SurfaceCoordinates.Project(thin, triangle);
            var transformed = thin.ToArray(); var normalIndices = triangle.ToArray();
            var normals = ModelRunner.VertexNormals(ref transformed, ref normalIndices, out _);
            var remapped = projection.Sources.SelectMany(vertex => normals.Skip(vertex * 3).Take(3)).ToArray();
            var result = SurfaceCoordinates.Expand(projection, remapped, Matrix4x4.Identity);
            Assert.All(result.TexCoords, value => Assert.True(float.IsFinite(value)));
            Assert.All(result.Tangents, value => Assert.True(float.IsFinite(value)));
        }
    }

    [Fact]
    public void HostedBoxChartSeamsKeepOriginalSmoothFanNormals()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
Library.Go(1f, () => {
 var viewer = Library.oViewer();
 Mesh Create() { var mesh = new Mesh();
 mesh.nAddVertex(Vector3.Zero); mesh.nAddVertex(Vector3.UnitY);
 mesh.nAddVertex(new Vector3(1,0,-.8f)); mesh.nAddVertex(new Vector3(-.8f,0,1));
 mesh.nAddTriangle(0,2,1); mesh.nAddTriangle(0,1,3); return mesh; }
 viewer.Add(Create(), "Baseline", 0);
 viewer.Add(Create(), "Mapped", 1);
 viewer.SetGroupMaterial(1, new Material { Anisotropy = new() { Strength = .7f } });
});
""");
        var execution = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), root);
        var baseline = execution.Components.Single(component => component.Name == "Baseline");
        var mapped = execution.Components.Single(component => component.Name == "Mapped");
        Assert.True(mapped.Positions.Length > baseline.Positions.Length);
        float[] Expanded(ExtractedComponent component, float[] values) => component.Indices.SelectMany(index => values.Skip(checked((int)index) * 3).Take(3)).ToArray();
        Assert.Equal(Expanded(baseline, baseline.Positions), Expanded(mapped, mapped.Positions));
        Assert.Equal(Expanded(baseline, baseline.Normals), Expanded(mapped, mapped.Normals));
        var shared = Vector3.Normalize(new Vector3(1,0,1));
        Assert.InRange(Vector3.Distance(shared, new(mapped.Normals[0], mapped.Normals[1], mapped.Normals[2])), 0, .00001f);
    }

    [Fact]
    public void HostedGroupMaterialAfterAddOwnsBytesAndRejectsMappedLines()
    {
        Write("main.cs", """
using System.Numerics;
using PicoGK;
Library.Go(1f, () => {
 var viewer = Library.oViewer();
 viewer.Add(Utils.mshCreateCube(new Vector3(10, 20, 30)), "Cube", 7);
 viewer.SetGroupMaterial(7, new Material { Name = "Final", Metallic = 1, Anisotropy = new() { Strength = .7f } });
 viewer.SetGroupMatrix(7, Matrix4x4.CreateScale(-1, 2, 3) * Matrix4x4.CreateTranslation(4, 5, 6));
});
""");
        var execution = ModelRunner.Execute(CompilationService.Compile(root, "main.cs"), root);
        var component = Assert.Single(execution.Components); Assert.Equal("Final", component.Material!.Value.GetProperty("name").GetString());
        Assert.Equal(component.Positions.Length / 3 * 2, component.TexCoords!.Length);
        Assert.Equal(component.Positions.Length / 3 * 4, component.Tangents!.Length);
        Assert.All(component.Tangents, value => Assert.True(float.IsFinite(value)));
        var artifact = MeshArtifactWriter.Write(root, execution, new WorkerDiagnostics(new(false, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), new(0, 0, 0)));
        Assert.True(artifact.Components[0].TangentCount > 0);
        using var backend = new CaptureViewerBackend(root);
        using var library = new Library(1f);
        Library.RegisterGlobalLibrary(library);
        try
        {
        using var polyline = new PolyLine(new ColorFloat("FFFFFF")); polyline.nAddVertex(Vector3.Zero); polyline.nAddVertex(Vector3.One);
        backend.Add(polyline, 9); backend.SetGroupMaterial(9, new Material { Anisotropy = new() });
        Assert.Contains("PolyLine", Assert.Throws<WorkerException>(() => backend.Extract()).Message);
        }
        finally { Library.UnregisterGlobalLibrary(); }
    }
}
