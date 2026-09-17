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

internal sealed class HostedLibraryHost : ILibraryHost, IDisposable
{
    private readonly string artifactRoot;
    private ModelExecutionResult? result;
    private bool disposed;

    internal HostedLibraryHost(string artifactRoot)
    {
        this.artifactRoot = Path.GetFullPath(artifactRoot);
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
        using var backend = new CaptureViewerBackend(artifactRoot);
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
                library.nTotalMemUsage(),
                false,
                new ModelTimings(
                    0,
                    initialize.Elapsed.TotalMilliseconds,
                    captured.MeshConstruction,
                    captured.MeshExtraction,
                    captured.NormalGeneration,
                    0));
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
    double MeshConstruction,
    double MeshExtraction,
    double NormalGeneration);

internal sealed record GeometrySnapshot(string Kind, float[] Positions, uint[] Indices, ColorFloat? LineColor);

/// <summary>
/// Applies hosted viewer calls on a bounded pump. One drained batch is one native-style poll update;
/// bounded enqueueing provides producer backpressure instead of retaining an unbounded scene history.
/// </summary>
internal sealed class CaptureViewerBackend : IViewerBackend
{
    private static readonly Material DefaultMaterial = new(new ColorFloat("B8BCC4"), 0f, 0.7f);
    private readonly object gate = new();
    private readonly string artifactRoot;
    private readonly BlockingCollection<ViewerCommand> commands;
    private readonly Task pump;
    private readonly List<SceneObject> objects = [];
    private readonly Dictionary<object, SceneObject> objectIndex = new(ReferenceEqualityComparer.Instance);
    private readonly ConditionalWeakTable<object, ComponentIdentity> componentIdentities = new();
    private readonly Dictionary<object, MaterializedComponent> materialized = new(ReferenceEqualityComparer.Instance);
    private readonly Dictionary<int, Material> materials = [];
    private readonly Dictionary<int, Matrix4x4> groupMatrices = [];
    private readonly HashSet<int> hiddenGroups = [];
    private ExceptionDispatchInfo? pumpError;
    private bool completed;
    private bool disposed;
    private double meshConstruction;
    private double meshExtraction;
    private double normalGeneration;
    private int nextComponentOrdinal;

    // ponytail: a fixed bound replaces the removed per-render capture knob; it is producer backpressure only.
    private const int MaximumPendingCommands = 256;

    internal CaptureViewerBackend(string artifactRoot)
    {
        this.artifactRoot = Path.GetFullPath(artifactRoot);
        Directory.CreateDirectory(this.artifactRoot);
        commands = new BlockingCollection<ViewerCommand>(MaximumPendingCommands);
        pump = Task.Run(Pump);
    }

    public bool IsIdle => commands.Count == 0;

    public bool Poll() { Flush(); return false; }

    public void RequestUpdate() => Enqueue(new ViewerCommand(() => { }));

    public void LoadLightSetup(byte[] abyDiffuseDds, byte[] abySpecularDds) =>
        throw UnsupportedCapability("environment lighting");

    // Presentation state reached the renderer only through the removed progressive scene; the call stays accepted.
    public void SetBackgroundColor(ColorFloat color) => Enqueue(new ViewerCommand(() => { }));

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
        Enqueue(new ViewerCommand(() => { }));
    }

    public void ZoomToFit() => throw UnsupportedCapability("zoom-to-fit camera control");

    public Quaternion Orientation
    {
        get => throw UnsupportedCapability("camera orientation");
        set => throw UnsupportedCapability("camera orientation");
    }

    public void Add(Voxels vox, int nGroupID) => Enqueue(new ViewerCommand(() => AddObject(vox, nGroupID)));
    public void Remove(Voxels vox) => Enqueue(new ViewerCommand(() => RemoveObject(vox)));
    public void SetObjectMatrix(Voxels vox, Matrix4x4 mat) => Enqueue(new ViewerCommand(() => SetMatrix(vox, mat)));
    public void Add(Mesh msh, int nGroupID) => Enqueue(new ViewerCommand(() => AddObject(msh, nGroupID)));
    public void Remove(Mesh msh) => Enqueue(new ViewerCommand(() => RemoveObject(msh)));
    public void SetObjectMatrix(Mesh msh, Matrix4x4 mat) => Enqueue(new ViewerCommand(() => SetMatrix(msh, mat)));
    public void Add(PolyLine poly, int nGroupID) => Enqueue(new ViewerCommand(() => AddObject(poly, nGroupID)));
    public void Remove(PolyLine poly) => Enqueue(new ViewerCommand(() => RemoveObject(poly)));
    public void SetObjectMatrix(PolyLine poly, Matrix4x4 mat) => Enqueue(new ViewerCommand(() => SetMatrix(poly, mat)));

    public void RemoveAllObjects() => Enqueue(new ViewerCommand(() =>
    {
        objects.Clear();
        objectIndex.Clear();
        materialized.Clear();
    }));

    // Screenshots existed only to mark scene bookmarks, which Tau no longer delivers; the model keeps running.
    public void RequestScreenShot(string strScreenShotPath) => Enqueue(new ViewerCommand(() => { }));

    public void EnableExperimental(bool bEnable) => throw UnsupportedCapability("experimental viewer rendering");

    public void SetGroupVisible(int nGroupID, bool bVisible) => Enqueue(new ViewerCommand(() =>
    {
        if (bVisible) hiddenGroups.Remove(nGroupID);
        else hiddenGroups.Add(nGroupID);
    }));

    public void SetGroupMaterial(int nGroupID, ColorFloat clr, float fMetallic, float fRoughness) =>
        Enqueue(new ViewerCommand(() =>
        {
            materials[nGroupID] = new Material(clr, fMetallic, fRoughness);
        }));

    public void SetGroupMatrix(int nGroupID, Matrix4x4 mat) => Enqueue(new ViewerCommand(() =>
    {
        groupMatrices[nGroupID] = mat;
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
            return new CapturedScene(components, meshConstruction, meshExtraction, normalGeneration);
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
            materials.Clear();
            groupMatrices.Clear();
            hiddenGroups.Clear();
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
            foreach (var command in batch)
            {
                command.Apply();
                command.Completion?.Set();
            }
        }
    }

    private void Flush()
    {
        using var completion = new ManualResetEventSlim();
        Enqueue(new ViewerCommand(() => { }, completion));
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
        // A model may keep mutating the queued object. The snapshot must read an owned copy.
        using var ownedVoxels = (identity as Voxels)?.voxDuplicate();
        var snapshot = SnapshotGeometry((object?)ownedVoxels ?? identity);
        var item = new SceneObject(
            identity,
            componentIdentity.Id,
            componentIdentity.Ordinal,
            group,
            snapshot,
            Matrix4x4.Identity);
        objects.Add(item);
        objectIndex.Add(identity, item);
    }

    private void RemoveObject(object identity)
    {
        if (!objectIndex.Remove(identity, out var item)) return;
        objects.Remove(item);
        materialized.Remove(identity);
    }

    private void SetMatrix(object identity, Matrix4x4 matrix)
    {
        if (!objectIndex.TryGetValue(identity, out var item)) return;
        var replacement = item with { Matrix = matrix };
        objects[objects.IndexOf(item)] = replacement;
        objectIndex[identity] = replacement;
        materialized.Remove(identity);
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
    private static WorkerException UnsupportedCapability(string capability) => new(new Issue(
        $"The hosted PicoGK viewer does not support {capability}.",
        "CS_TAU_VIEWER_CAPABILITY",
        "validation",
        "error"));
    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(disposed, this);

    private sealed record ViewerCommand(Action Apply, ManualResetEventSlim? Completion = null);
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
