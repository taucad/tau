using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Numerics;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using PicoGK;
using PicoGK.Numerics;

namespace Tau.PicoGK.Worker;

internal enum SceneCaptureMode { Explicit, Update, Operation }

internal sealed record SceneCaptureOptions(
    SceneCaptureMode Mode,
    int MinimumIntervalMilliseconds,
    int MaximumPendingCommands)
{
    internal static readonly SceneCaptureOptions Default = new(SceneCaptureMode.Update, 16, 256);
}

internal sealed record ScenePresentation(
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] float[]? Background = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] float? FieldOfViewDegrees = null);

internal enum SceneProgressOperation { Reset, Delta }

internal sealed record SceneProgress(
    SceneCaptureMode Mode,
    SceneProgressOperation Operation,
    int? BaseSceneGeneration,
    int SceneGeneration,
    IReadOnlyList<ExtractedComponent> Upserts,
    IReadOnlyList<string> RemovedComponentIds,
    ScenePresentation? Presentation,
    SceneCheckpoint? Bookmark = null);

internal sealed class HostedLibraryHost : ILibraryHost, IDisposable
{
    private readonly string artifactRoot;
    private readonly SceneCaptureOptions capture;
    private readonly Action<SceneProgress>? onProgress;
    private readonly ComputeMaterializationCache? compute;
    private ModelExecutionResult? result;
    private bool disposed;

    internal HostedLibraryHost(
        string artifactRoot,
        SceneCaptureOptions? capture = null,
        Action<SceneProgress>? onProgress = null,
        ComputeMaterializationCache? compute = null)
    {
        this.artifactRoot = Path.GetFullPath(artifactRoot);
        this.capture = capture ?? SceneCaptureOptions.Default;
        this.onProgress = onProgress;
        this.compute = compute;
        Directory.CreateDirectory(this.artifactRoot);
    }

    public string DefaultLogFilePath => Path.Combine(artifactRoot, "PicoGK.log");

    public void Run(
        float fVoxelSizeMM,
        ThreadStart fnTask,
        string strLogFilePath,
        bool bEndAppWithTask,
        string strWindowTitle,
        string strLightsFile)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        ArgumentNullException.ThrowIfNull(fnTask);
        if (!string.IsNullOrEmpty(strLightsFile))
        {
            throw new WorkerException(new Issue(
                "The hosted PicoGK viewer does not support environment lighting.",
                "CS_TAU_VIEWER_CAPABILITY",
                "validation",
                "error"));
        }
        var initialize = Stopwatch.StartNew();
        Library? library = null;
        Viewer? viewer = null;
        using var backend = new CaptureViewerBackend(artifactRoot, capture, onProgress, compute);
        var log = new LogConsole();
        try
        {
            library = new Library(fVoxelSizeMM);
            viewer = new Viewer(backend, log);
            Library.RegisterGlobalLibrary(library);
            Library.RegisterGlobalLog(log);
            Library.RegisterGlobalViewer(viewer);
            initialize.Stop();

            var task = Task.Run(fnTask.Invoke);
            while (!task.IsCompleted)
            {
                viewer.bPoll();
                Thread.Sleep(5);
            }
            viewer.bPoll();
            backend.Complete();
            task.GetAwaiter().GetResult();

            var captured = backend.Extract();
            result = new ModelExecutionResult(
                captured.Components,
                captured.Checkpoints,
                library.nTotalMemUsage(),
                false,
                new ModelTimings(
                    0,
                    initialize.Elapsed.TotalMilliseconds,
                    captured.MeshConstruction,
                    captured.MeshExtraction,
                    captured.NormalGeneration,
                    0),
                compute?.Publications ?? []);
        }
        finally
        {
            Library.UnregisterGlobalViewer();
            Library.UnregisterGlobalLog();
            Library.UnregisterGlobalLibrary();
            viewer?.Dispose();
            library?.Dispose();
        }
    }

    internal ModelExecutionResult TakeResult() => result
        ?? throw new WorkerException(new Issue(
            "The C# program completed without calling Library.Go.",
            "CS_TAU_NO_SCENE",
            "validation",
            "error"));

    public void Dispose() => disposed = true;
}

internal sealed record CapturedScene(
    IReadOnlyList<ExtractedComponent> Components,
    IReadOnlyList<SceneCheckpoint> Checkpoints,
    double MeshConstruction,
    double MeshExtraction,
    double NormalGeneration);

internal sealed record SceneCheckpoint(string Path, int SceneGeneration);

internal sealed record GeometrySnapshot(string Kind, float[] Positions, uint[] Indices, ColorFloat? LineColor);
internal sealed record ComputeSnapshotPublication(string CacheKey, GeometrySnapshot Snapshot);

internal sealed class ComputeMaterializationCache
{
    private readonly Dictionary<string, GeometrySnapshot> prepared;
    private readonly List<ComputeSnapshotPublication> publications = [];

    internal ComputeMaterializationCache(IEnumerable<(string CacheKey, GeometrySnapshot Snapshot)> prepared) =>
        this.prepared = prepared.ToDictionary(item => item.CacheKey, item => Clone(item.Snapshot), StringComparer.Ordinal);

    internal IReadOnlyList<ComputeSnapshotPublication> Publications => publications;

    internal bool TryGet(string key, out GeometrySnapshot snapshot)
    {
        if (!prepared.TryGetValue(key, out var found))
        {
            snapshot = null!;
            return false;
        }
        snapshot = Clone(found);
        return true;
    }

    internal void Record(string key, GeometrySnapshot snapshot)
    {
        prepared.Add(key, Clone(snapshot));
        publications.Add(new ComputeSnapshotPublication(key, Clone(snapshot)));
    }

    internal static string MeshKey(GeometrySnapshot snapshot)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        hash.AppendData(MemoryMarshal.AsBytes(new[] { snapshot.Positions.Length, snapshot.Indices.Length }.AsSpan()));
        hash.AppendData(MemoryMarshal.AsBytes(snapshot.Positions.AsSpan()));
        hash.AppendData(MemoryMarshal.AsBytes(snapshot.Indices.AsSpan()));
        return $"mesh:sha256:{Convert.ToHexStringLower(hash.GetHashAndReset())}";
    }

    internal static string? VdbKey(Stream stream)
    {
        // OpenVDB Archive::writeHeader format 225: only bytes [21,57) are the random file UUID.
        // Keep the complete grid, transform, background, topology and full-precision values.
        Span<byte> header = stackalloc byte[57];
        if (stream.Read(header) != header.Length ||
            BinaryPrimitives.ReadInt64LittleEndian(header) != 0x56444220 ||
            BinaryPrimitives.ReadUInt32LittleEndian(header[8..]) != 225 ||
            header[20] != 1 ||
            !Guid.TryParseExact(Encoding.ASCII.GetString(header[21..]), "D", out _)) return null;
        header[21..].Clear();
        stream.Position = 0;
        stream.Write(header);
        stream.Position = 0;
        return $"voxels:sha256:{Convert.ToHexStringLower(SHA256.HashData(stream))}";
    }

    private static GeometrySnapshot Clone(GeometrySnapshot snapshot) =>
        snapshot with { Positions = [.. snapshot.Positions], Indices = [.. snapshot.Indices] };
}

/// <summary>
/// Applies hosted viewer calls on a bounded pump. One drained batch is one native-style poll update;
/// bounded enqueueing provides producer backpressure instead of retaining an unbounded scene history.
/// </summary>
internal sealed class CaptureViewerBackend : IViewerBackend
{
    private static readonly Material DefaultMaterial = new(new ColorFloat("B8BCC4"), 0f, 0.7f);
    private readonly object gate = new();
    private readonly string artifactRoot;
    private readonly SceneCaptureOptions capture;
    private readonly Action<SceneProgress>? onProgress;
    private readonly ComputeMaterializationCache? compute;
    private readonly BlockingCollection<ViewerCommand> commands;
    private readonly Task pump;
    private readonly List<SceneObject> objects = [];
    private readonly Dictionary<object, SceneObject> objectIndex = new(ReferenceEqualityComparer.Instance);
    private readonly ConditionalWeakTable<object, ComponentIdentity> componentIdentities = new();
    private readonly Dictionary<object, MaterializedComponent> materialized = new(ReferenceEqualityComparer.Instance);
    private readonly Dictionary<string, ExtractedComponent> publishedComponents = new(StringComparer.Ordinal);
    private readonly Dictionary<int, Material> materials = [];
    private readonly Dictionary<int, Matrix4x4> groupMatrices = [];
    private readonly HashSet<int> hiddenGroups = [];
    private readonly List<SceneCheckpoint> checkpoints = [];
    private readonly Stopwatch progressClock = Stopwatch.StartNew();
    private ExceptionDispatchInfo? pumpError;
    private long lastProgressMilliseconds = long.MinValue;
    private bool pendingProgress;
    private int sceneGeneration;
    private bool completed;
    private bool disposed;
    private double meshConstruction;
    private double meshExtraction;
    private double normalGeneration;
    private int nextComponentOrdinal;
    private int? publishedSceneGeneration;
    private ScenePresentation? publishedPresentation;
    private float[]? background;
    private float? fieldOfViewDegrees;

    internal CaptureViewerBackend(
        string artifactRoot,
        SceneCaptureOptions? capture = null,
        Action<SceneProgress>? onProgress = null,
        ComputeMaterializationCache? compute = null)
    {
        this.artifactRoot = Path.GetFullPath(artifactRoot);
        this.capture = capture ?? SceneCaptureOptions.Default;
        this.onProgress = onProgress;
        this.compute = compute;
        Directory.CreateDirectory(this.artifactRoot);
        commands = new BlockingCollection<ViewerCommand>(this.capture.MaximumPendingCommands);
        pump = Task.Run(Pump);
    }

    public bool IsIdle => commands.Count == 0;

    public bool Poll() { Flush(); return false; }

    public void RequestUpdate() => Enqueue(new ViewerCommand(false, false, () => { }));

    public void LoadLightSetup(byte[] abyDiffuseDds, byte[] abySpecularDds) =>
        throw UnsupportedCapability("environment lighting");

    public void SetBackgroundColor(ColorFloat color) => Enqueue(new ViewerCommand(true, false, () =>
    {
        background = ColorValues(color);
        sceneGeneration++;
    }));

    public void SetFieldOfView(float radians)
    {
        if (!float.IsFinite(radians) || radians <= 0 || radians > 2 * float.Pi)
        {
            throw new WorkerException(new Issue(
                "The PicoGK viewer field of view must be finite and between 0 and 2π radians.",
                "CS_TAU_VIEWER_PRESENTATION",
                "validation",
                "error"));
        }
        Enqueue(new ViewerCommand(true, false, () =>
        {
            fieldOfViewDegrees = radians * 180f / float.Pi;
            sceneGeneration++;
        }));
    }

    public void ZoomToFit() => throw UnsupportedCapability("zoom-to-fit camera control");

    public Quaternion Orientation
    {
        get => throw UnsupportedCapability("camera orientation");
        set => throw UnsupportedCapability("camera orientation");
    }

    public void Add(Voxels vox, int nGroupID) => Enqueue(new ViewerCommand(true, false, () => AddObject(vox, nGroupID)));
    public void Remove(Voxels vox) => Enqueue(new ViewerCommand(true, false, () => RemoveObject(vox)));
    public void SetObjectMatrix(Voxels vox, Matrix4x4 mat) => Enqueue(new ViewerCommand(true, false, () => SetMatrix(vox, mat)));
    public void Add(Mesh msh, int nGroupID) => Enqueue(new ViewerCommand(true, false, () => AddObject(msh, nGroupID)));
    public void Remove(Mesh msh) => Enqueue(new ViewerCommand(true, false, () => RemoveObject(msh)));
    public void SetObjectMatrix(Mesh msh, Matrix4x4 mat) => Enqueue(new ViewerCommand(true, false, () => SetMatrix(msh, mat)));
    public void Add(PolyLine poly, int nGroupID) => Enqueue(new ViewerCommand(true, false, () => AddObject(poly, nGroupID)));
    public void Remove(PolyLine poly) => Enqueue(new ViewerCommand(true, false, () => RemoveObject(poly)));
    public void SetObjectMatrix(PolyLine poly, Matrix4x4 mat) => Enqueue(new ViewerCommand(true, false, () => SetMatrix(poly, mat)));

    public void RemoveAllObjects() => Enqueue(new ViewerCommand(true, false, () =>
    {
        objects.Clear();
        objectIndex.Clear();
        materialized.Clear();
        sceneGeneration++;
    }));

    public void RequestScreenShot(string strScreenShotPath)
    {
        var relative = ConfinedRelativePath(strScreenShotPath);
        Enqueue(new ViewerCommand(false, true, () => checkpoints.Add(new SceneCheckpoint(relative, sceneGeneration))));
    }

    public void EnableExperimental(bool bEnable) => throw UnsupportedCapability("experimental viewer rendering");

    public void SetGroupVisible(int nGroupID, bool bVisible) => Enqueue(new ViewerCommand(true, false, () =>
    {
        var changed = bVisible ? hiddenGroups.Remove(nGroupID) : hiddenGroups.Add(nGroupID);
        if (changed) sceneGeneration++;
    }));

    public void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness) =>
        Enqueue(new ViewerCommand(true, false, () =>
        {
            materials[nGroupID] = new Material(clr, fMetallic, fRoughness);
            sceneGeneration++;
        }));

    public void SetGroupMatrix(int nGroupID, Matrix4x4 mat) => Enqueue(new ViewerCommand(true, false, () =>
    {
        groupMatrices[nGroupID] = mat;
        sceneGeneration++;
    }));

    public void EnableOverhangWarning(int nGroupID, Overhang uWarning, Overhang uError) =>
        throw UnsupportedCapability("overhang visualization");
    public void DisableOverhangWarning(int nGroupID) => throw UnsupportedCapability("overhang visualization");

    public BBox3 GetBoundingBox()
    {
        Flush();
        lock (gate)
        {
            ThrowIfDisposed();
            var bounds = new BBox3();
            foreach (var item in objects.Where(item => !hiddenGroups.Contains(item.Group)))
            {
                IncludeTransformed(bounds: ref bounds, BoundsOf(item.Geometry), MatrixFor(item));
            }
            return bounds;
        }
    }

    internal void Complete()
    {
        lock (gate)
        {
            if (completed) return;
            completed = true;
        }
        commands.CompleteAdding();
        pump.GetAwaiter().GetResult();
        RethrowPumpError();
    }

    internal CapturedScene Extract()
    {
        bool isCompleted;
        lock (gate) isCompleted = completed;
        if (!isCompleted) Flush();
        lock (gate)
        {
            ThrowIfDisposed();
            var components = MaterializeComponents();
            if (components.Count == 0)
            {
                throw new WorkerException(new Issue(
                    "The PicoGK viewer contained no visible mesh or polyline geometry when the program completed.",
                    "CS_TAU_EMPTY_SCENE",
                    "validation",
                    "error"));
            }
            return new CapturedScene(components, checkpoints.ToArray(), meshConstruction, meshExtraction, normalGeneration);
        }
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
        }
        Complete();
        lock (gate)
        {
            disposed = true;
            objects.Clear();
            objectIndex.Clear();
            componentIdentities.Clear();
            materialized.Clear();
            publishedComponents.Clear();
            materials.Clear();
            groupMatrices.Clear();
            hiddenGroups.Clear();
            checkpoints.Clear();
            background = null;
            fieldOfViewDegrees = null;
        }
        commands.Dispose();
    }

    [ExcludeFromCodeCoverage]
    private void Pump()
    {
        try
        {
            while (commands.TryTake(out var first, Timeout.Infinite))
            {
                var batch = new List<ViewerCommand> { first };
                while (commands.TryTake(out var next)) batch.Add(next);
                ApplyBatch(batch);
            }
            lock (gate)
            {
                if (pendingProgress && capture.Mode != SceneCaptureMode.Explicit) PublishProgress(null);
            }
        }
        catch (Exception error)
        {
            pumpError = ExceptionDispatchInfo.Capture(error);
            commands.CompleteAdding();
            while (commands.TryTake(out var command)) command.Completion?.Set();
        }
    }

    private void ApplyBatch(IReadOnlyList<ViewerCommand> batch)
    {
        lock (gate)
        {
            var batchChanged = false;
            foreach (var command in batch)
            {
                var generationBefore = sceneGeneration;
                command.Apply();
                var changed = sceneGeneration != generationBefore;
                batchChanged |= changed;
                pendingProgress |= changed;
                if (command.Bookmark) PublishProgress(checkpoints[^1]);
                else if (changed && capture.Mode == SceneCaptureMode.Operation) PublishIfDue();
                command.Completion?.Set();
            }
            if (batchChanged && capture.Mode == SceneCaptureMode.Update) PublishIfDue();
        }
    }

    private void PublishIfDue()
    {
        if (onProgress is null) return;
        var elapsed = progressClock.ElapsedMilliseconds;
        if (lastProgressMilliseconds != long.MinValue && elapsed - lastProgressMilliseconds < capture.MinimumIntervalMilliseconds) return;
        PublishProgress(null);
    }

    private void PublishProgress(SceneCheckpoint? bookmark)
    {
        if (onProgress is null) return;
        var components = MaterializeComponents();
        var operation = publishedSceneGeneration is null ? SceneProgressOperation.Reset : SceneProgressOperation.Delta;
        IReadOnlyList<ExtractedComponent> upserts = operation == SceneProgressOperation.Reset
            ? components
            : components.Where(component =>
                !publishedComponents.TryGetValue(component.Id, out var previous) || !ReferenceEquals(previous, component)).ToArray();
        var currentIds = components.Select(component => component.Id).ToHashSet(StringComparer.Ordinal);
        IReadOnlyList<string> removed = operation == SceneProgressOperation.Reset
            ? Array.Empty<string>()
            : publishedComponents.Keys.Where(id => !currentIds.Contains(id)).ToArray();
        var presentation = new ScenePresentation(background is null ? null : [.. background], fieldOfViewDegrees);
        var presentationChanged = operation == SceneProgressOperation.Reset || !PresentationEquals(publishedPresentation, presentation);
        var hasSceneMutation =
            operation == SceneProgressOperation.Reset ||
            upserts.Count > 0 ||
            removed.Count > 0 ||
            presentationChanged;
        if (!hasSceneMutation && bookmark is null)
        {
            lastProgressMilliseconds = progressClock.ElapsedMilliseconds;
            pendingProgress = false;
            return;
        }
        onProgress(new SceneProgress(
            capture.Mode,
            operation,
            publishedSceneGeneration,
            sceneGeneration,
            upserts,
            removed,
            presentationChanged ? presentation : null,
            bookmark));
        if (hasSceneMutation)
        {
            publishedComponents.Clear();
            foreach (var component in components) publishedComponents.Add(component.Id, component);
            publishedSceneGeneration = sceneGeneration;
            publishedPresentation = presentation;
        }
        lastProgressMilliseconds = progressClock.ElapsedMilliseconds;
        pendingProgress = false;
    }

    private void Flush()
    {
        using var completion = new ManualResetEventSlim();
        Enqueue(new ViewerCommand(false, false, () => { }, completion));
        completion.Wait();
        RethrowPumpError();
    }

    private void Enqueue(ViewerCommand command)
    {
        RethrowPumpError();
        lock (gate)
        {
            ThrowIfDisposed();
            if (completed) throw new InvalidOperationException("The PicoGK viewer command pump has completed.");
        }
        commands.Add(command);
        RethrowPumpError();
    }

    [ExcludeFromCodeCoverage]
    private void RethrowPumpError() => pumpError?.Throw();

    private void AddObject(object identity, int group)
    {
        ArgumentNullException.ThrowIfNull(identity);
        if (!componentIdentities.TryGetValue(identity, out var componentIdentity))
        {
            var ordinal = ++nextComponentOrdinal;
            componentIdentity = new ComponentIdentity($"component:picogk-{ordinal}", ordinal);
            componentIdentities.Add(identity, componentIdentity);
        }
        if (objectIndex.TryGetValue(identity, out var existing))
        {
            objects.Remove(existing);
            objectIndex.Remove(identity);
            materialized.Remove(identity);
        }
        // A model may keep mutating the queued object. Key and result must read the same owned field.
        using var ownedVoxels = (identity as Voxels)?.voxDuplicate();
        var geometry = (object?)ownedVoxels ?? identity;
        GeometrySnapshot? snapshot = ownedVoxels is not null ? null : SnapshotGeometry(geometry);
        var cacheKey = compute is null || identity is PolyLine ? null :
            ownedVoxels is not null ? VoxelContentKey(ownedVoxels) : ComputeMaterializationCache.MeshKey(snapshot!);
        if (cacheKey is not null && compute!.TryGet(cacheKey, out var cached))
        {
            snapshot = cached;
        }
        else
        {
            snapshot ??= SnapshotGeometry(geometry);
            if (cacheKey is not null) compute!.Record(cacheKey, snapshot);
        }
        var item = new SceneObject(
            identity,
            componentIdentity.Id,
            componentIdentity.Ordinal,
            group,
            snapshot,
            Matrix4x4.Identity);
        objects.Add(item);
        objectIndex.Add(identity, item);
        sceneGeneration++;
    }

    private string? VoxelContentKey(Voxels voxels)
    {
        var path = Path.Combine(artifactRoot, "compute-input.vdb");
        try
        {
            using var file = new OpenVdbFile(voxels.lib);
            file.nAdd(voxels, "geometry");
            using var copy = file.voxGet(0);
            // Imported VDBs may request lossy half-float storage. Only mutate the temporary copy.
            copy.oMetaData().RemoveValue("is_saved_as_half_float");
            file.SaveToFile(path);
            using var stream = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None,
                bufferSize: 4096, FileOptions.DeleteOnClose);
            return ComputeMaterializationCache.VdbKey(stream);
        }
        catch (IOException)
        {
            return null;
        }
    }

    private void RemoveObject(object identity)
    {
        if (!objectIndex.Remove(identity, out var item)) return;
        objects.Remove(item);
        materialized.Remove(identity);
        sceneGeneration++;
    }

    private void SetMatrix(object identity, Matrix4x4 matrix)
    {
        if (!objectIndex.TryGetValue(identity, out var item)) return;
        var replacement = item with { Matrix = matrix };
        objects[objects.IndexOf(item)] = replacement;
        objectIndex[identity] = replacement;
        materialized.Remove(identity);
        sceneGeneration++;
    }

    private GeometrySnapshot SnapshotGeometry(object geometry)
    {
        if (geometry is PolyLine line)
        {
            line.GetColor(out var color);
            var count = line.nVertexCount();
            var positions = new float[checked(count * 3)];
            for (var index = 0; index < count; index++) WriteVector(positions, index, line.vecVertexAt(index));
            var indices = new uint[Math.Max(0, checked((count - 1) * 2))];
            for (var index = 0; index < count - 1; index++)
            {
                indices[index * 2] = checked((uint)index);
                indices[index * 2 + 1] = checked((uint)(index + 1));
            }
            return new GeometrySnapshot("lines", positions, indices, color);
        }

        var ownsMesh = geometry is Voxels;
        var construction = Stopwatch.StartNew();
        var mesh = geometry is Voxels voxels ? new Mesh(voxels) : (Mesh)geometry;
        construction.Stop();
        if (ownsMesh) meshConstruction += construction.Elapsed.TotalMilliseconds;
        try
        {
            var extraction = Stopwatch.StartNew();
            var positions = new float[checked(mesh.nVertexCount() * 3)];
            for (var index = 0; index < mesh.nVertexCount(); index++) WriteVector(positions, index, mesh.vecVertexAt(index));
            var indices = new uint[checked(mesh.nTriangleCount() * 3)];
            for (var index = 0; index < mesh.nTriangleCount(); index++)
            {
                var triangle = mesh.oTriangleAt(index);
                indices[index * 3] = checked((uint)triangle.A);
                indices[index * 3 + 1] = checked((uint)triangle.B);
                indices[index * 3 + 2] = checked((uint)triangle.C);
            }
            extraction.Stop();
            meshExtraction += extraction.Elapsed.TotalMilliseconds;
            return new GeometrySnapshot("triangles", positions, indices, null);
        }
        finally
        {
            if (ownsMesh) mesh.Dispose();
        }
    }

    private List<ExtractedComponent> MaterializeComponents()
    {
        var components = new List<ExtractedComponent>();
        foreach (var item in objects.Where(item => !hiddenGroups.Contains(item.Group)))
        {
            if (item.Geometry.Positions.Length == 0 || item.Geometry.Indices.Length == 0) continue;
            var matrix = MatrixFor(item);
            var material = MaterialFor(item);
            if (materialized.TryGetValue(item.Identity, out var cached) &&
                cached.Group == item.Group && cached.Matrix == matrix && cached.Material == material)
            {
                components.Add(cached.Component);
                continue;
            }
            var positions = TransformPositions(item.Geometry.Positions, matrix);
            var normals = Array.Empty<float>();
            if (item.Geometry.Kind == "triangles")
            {
                var generation = Stopwatch.StartNew();
                normals = ModelRunner.VertexNormals(positions, item.Geometry.Indices);
                generation.Stop();
                normalGeneration += generation.Elapsed.TotalMilliseconds;
            }
            var component = new ExtractedComponent(
                item.Id,
                item.Geometry.Kind,
                $"group-{item.Group}-object-{item.Ordinal}",
                ColorValues(material.Color),
                material.Metallic,
                material.Roughness,
                positions,
                normals,
                item.Geometry.Indices);
            materialized[item.Identity] = new MaterializedComponent(item.Group, matrix, material, component);
            components.Add(component);
        }
        return components;
    }

    private Matrix4x4 MatrixFor(SceneObject item) => item.Matrix * groupMatrices.GetValueOrDefault(item.Group, Matrix4x4.Identity);

    private Material MaterialFor(SceneObject item)
    {
        if (materials.TryGetValue(item.Group, out var material)) return material;
        return item.Geometry.LineColor is { } color ? DefaultMaterial with { Color = color } : DefaultMaterial;
    }

    private string ConfinedRelativePath(string requestedPath)
    {
        var path = Path.GetFullPath(requestedPath);
        var relative = Path.GetRelativePath(artifactRoot, path);
        if (Path.IsPathRooted(relative) || relative == ".." || relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
        {
            throw new WorkerException(new Issue(
                "PicoGK screenshot checkpoint paths must remain inside the private artifact directory.",
                "CS_TAU_ARTIFACT_PATH",
                "validation",
                "error"));
        }
        return relative.Replace(Path.DirectorySeparatorChar, '/');
    }

    private static float[] TransformPositions(float[] source, Matrix4x4 matrix)
    {
        var positions = new float[source.Length];
        for (var index = 0; index < source.Length / 3; index++)
        {
            WriteVector(positions, index, Vector3.Transform(new Vector3(source[index * 3], source[index * 3 + 1], source[index * 3 + 2]), matrix));
        }
        return positions;
    }

    private static BBox3 BoundsOf(GeometrySnapshot geometry)
    {
        var bounds = new BBox3();
        for (var index = 0; index < geometry.Positions.Length; index += 3)
        {
            bounds.Include(new Vector3(geometry.Positions[index], geometry.Positions[index + 1], geometry.Positions[index + 2]));
        }
        return bounds;
    }

    private static void IncludeTransformed(ref BBox3 bounds, BBox3 source, Matrix4x4 matrix)
    {
        if (source.bIsEmpty()) return;
        foreach (var x in new[] { source.vecMin.X, source.vecMax.X })
        foreach (var y in new[] { source.vecMin.Y, source.vecMax.Y })
        foreach (var z in new[] { source.vecMin.Z, source.vecMax.Z })
        {
            bounds.Include(Vector3.Transform(new Vector3(x, y, z), matrix));
        }
    }

    private static void WriteVector(float[] values, int index, Vector3 vector)
    {
        values[index * 3] = vector.X;
        values[index * 3 + 1] = vector.Y;
        values[index * 3 + 2] = vector.Z;
    }

    private static float[] ColorValues(ColorFloat color) => [color.R, color.G, color.B, color.A];
    internal static bool PresentationEquals(ScenePresentation? left, ScenePresentation right) =>
        left is not null &&
        left.FieldOfViewDegrees == right.FieldOfViewDegrees &&
        (ReferenceEquals(left.Background, right.Background) ||
         left.Background is not null && right.Background is not null && left.Background.SequenceEqual(right.Background));
    private static WorkerException UnsupportedCapability(string capability) => new(new Issue(
        $"The hosted PicoGK viewer does not support {capability}.",
        "CS_TAU_VIEWER_CAPABILITY",
        "validation",
        "error"));
    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(disposed, this);

    private sealed record ViewerCommand(bool MutatesScene, bool Bookmark, Action Apply, ManualResetEventSlim? Completion = null);
    private sealed record ComponentIdentity(string Id, int Ordinal);
    private sealed record SceneObject(
        object Identity,
        string Id,
        int Ordinal,
        int Group,
        GeometrySnapshot Geometry,
        Matrix4x4 Matrix);
    private sealed record MaterializedComponent(int Group, Matrix4x4 Matrix, Material Material, ExtractedComponent Component);
    private sealed record Material(ColorFloat Color, float Metallic, float Roughness);
}
