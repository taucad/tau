using System.Buffers.Binary;
using System.Collections;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Numerics;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using PicoGK;
using PicoGK.Numerics;

namespace Tau.PicoGK.Worker;

internal sealed class HostedLibraryHost : ILibraryHost, IDisposable
{
    // How long the hosting thread waits between viewer polls while the model is still running.
    private const int ViewerPollIntervalMilliseconds = 5;

    private readonly string artifactRoot;
    private readonly CancellationToken cancellation;
    private ModelExecutionResult? result;
    private bool disposed;

    internal HostedLibraryHost(string artifactRoot, CancellationToken cancellation = default)
    {
        this.artifactRoot = Path.GetFullPath(artifactRoot);
        this.cancellation = cancellation;
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
        Task? task = null;
        ExceptionDispatchInfo? failure = null;
        var backend = new CaptureViewerBackend(artifactRoot);
        var log = new LogConsole();
        try
        {
            library = new Library(fVoxelSizeMM);
            viewer = new Viewer(backend, log);
            Library.RegisterGlobalLibrary(library);
            Library.RegisterGlobalLog(log);
            Library.RegisterGlobalViewer(viewer);
            initialize.Stop();

            // W17: a cancelled build fails the model's next viewer call, which unwinds it at a
            // boundary the host owns. A model that makes no further viewer call runs to its end.
            using var registration = cancellation.Register(backend.Cancel);
            task = Task.Run(fnTask.Invoke);
            // D25: the model's completion wakes this thread. Sleeping the poll interval instead
            // paid up to a whole interval after the model had already finished, on every render.
            var completed = ((IAsyncResult)task).AsyncWaitHandle;
            while (!completed.WaitOne(ViewerPollIntervalMilliseconds))
            {
                // A cancelled build stops polling — the poll itself is a viewer call, and the model
                // is still unwinding, so the teardown below must wait for it either way.
                if (!cancellation.IsCancellationRequested) viewer.bPoll();
            }
            if (cancellation.IsCancellationRequested)
            {
                // The model already unwound; observe that fault and answer the cancellation instead.
                _ = task.Exception;
                cancellation.ThrowIfCancellationRequested();
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
                    0),
                captured.Mechanism,
                captured.Warnings,
                captured.Resources);
        }
        catch (Exception error)
        {
            failure = ExceptionDispatchInfo.Capture(error);
        }
        finally
        {
            // Each owner is released even if another cleanup fails; the first failure wins.
            void Cleanup(Action action)
            {
                try { action(); }
                catch (Exception error) { failure ??= ExceptionDispatchInfo.Capture(error); }
            }
            // Native teardown must follow model completion even when polling failed first.
            Cleanup(() => task?.GetAwaiter().GetResult());
            Library.UnregisterGlobalViewer();
            Library.UnregisterGlobalLog();
            Library.UnregisterGlobalLibrary();
            Cleanup(() => viewer?.Dispose());
            Cleanup(() => library?.Dispose());
            Cleanup(backend.Dispose);
        }
        if (failure is not null)
        {
            failure.Throw();
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
    double NormalGeneration,
    JsonElement? Mechanism,
    IReadOnlyList<Issue> Warnings,
    MaterialResources? Resources = null);

internal sealed record GeometrySnapshot(string Kind, float[] Positions, uint[] Indices, ColorFloat? LineColor)
{
    internal (Library Library, string Kind, ulong Generation) Identity { get; init; }
    internal int Owners { get; set; }
    internal BBox3? CachedBounds { get; set; }
    internal long ByteLength => checked(((long)Positions.Length + Indices.Length) * sizeof(uint));
}

/// <summary>
/// Applies hosted viewer calls on a bounded pump. One drained batch is one native-style poll update;
/// bounded enqueueing provides producer backpressure instead of retaining an unbounded scene history.
/// </summary>
internal sealed class CaptureViewerBackend : IViewerBackend
{
    private static readonly Material DefaultMaterial = new(new ColorFloat("B8BCC4"), 0f, 0.7f);
    private readonly object gate = new();
    private readonly object geometryGate = new();
    private readonly CancellationTokenSource admissionCancellation = new();
    private readonly Dictionary<(Library Library, string Kind, ulong Generation), GeometrySnapshot> geometry = [];
    private long geometryBytes;
    private long geometryCopies;
    // This bounds owned source arrays, separately from the final artifact and material limits.
    private const long MaximumOwnedGeometryBytes = 256L * 1024 * 1024;
    internal long GeometryBytes { get { lock (geometryGate) return geometryBytes; } }
    internal long GeometryCopies { get { lock (geometryGate) return geometryCopies; } }
    private readonly string artifactRoot;
    private readonly BlockingCollection<ViewerCommand> commands;
    private readonly Task pump;
    private readonly List<SceneObject> objects = [];
    private readonly Dictionary<object, SceneObject> objectIndex = new(ReferenceEqualityComparer.Instance);
    private readonly ConditionalWeakTable<object, ComponentIdentity> componentIdentities = new();
    private ConditionalWeakTable<object, AuthoredName> authoredNames = new();
    private readonly Dictionary<object, MaterializedComponent> materialized = new(ReferenceEqualityComparer.Instance);
    private readonly Dictionary<int, Material> materials = [];
    private readonly Dictionary<int, Matrix4x4> groupMatrices = [];
    private readonly HashSet<int> hiddenGroups = [];
    private readonly List<Issue> warnings = [];
    private JsonElement? mechanism;
    private ExceptionDispatchInfo? pumpError;
    private volatile bool cancelled;
    private bool completed;
    private bool disposed;
    private double meshConstruction;
    private double meshExtraction;
    private double normalGeneration;
    private int nextComponentOrdinal;

    // ponytail: a fixed bound replaces the removed per-render capture knob; it is producer backpressure only.
    private const int MaximumPendingCommands = 256;
    private const int MaximumMechanismValues = 100_000;
    private const int MaximumMechanismBytes = 256 * 1024;

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

    public void Add(Voxels vox, int nGroupID) => EnqueueGeometry(vox, null, nGroupID);
    public void Add(Voxels vox, string name, int nGroupID) => EnqueueNamed(vox, name, nGroupID);
    public void Remove(Voxels vox) => Enqueue(new ViewerCommand(() => RemoveObject(vox)));
    public void SetObjectMatrix(Voxels vox, Matrix4x4 mat) => Enqueue(new ViewerCommand(() => SetMatrix(vox, mat)));
    public void Add(Mesh msh, int nGroupID) => EnqueueGeometry(msh, null, nGroupID);
    public void Add(Mesh msh, string name, int nGroupID) => EnqueueNamed(msh, name, nGroupID);
    public void Remove(Mesh msh) => Enqueue(new ViewerCommand(() => RemoveObject(msh)));
    public void SetObjectMatrix(Mesh msh, Matrix4x4 mat) => Enqueue(new ViewerCommand(() => SetMatrix(msh, mat)));
    public void Add(PolyLine poly, int nGroupID) => EnqueueGeometry(poly, null, nGroupID);
    public void Add(PolyLine poly, string name, int nGroupID) => EnqueueNamed(poly, name, nGroupID);
    public void Remove(PolyLine poly) => Enqueue(new ViewerCommand(() => RemoveObject(poly)));
    public void SetObjectMatrix(PolyLine poly, Matrix4x4 mat) => Enqueue(new ViewerCommand(() => SetMatrix(poly, mat)));

    public void RemoveAllObjects() => Enqueue(new ViewerCommand(() =>
    {
        foreach (var item in objects) ReleaseGeometry(item.Geometry);
        objects.Clear();
        objectIndex.Clear();
        materialized.Clear();
        authoredNames = new();
        mechanism = null;
    }));

    public void SetMechanism(object source)
    {
        try
        {
            ArgumentNullException.ThrowIfNull(source);
            // Serialize before enqueueing: no user object can hold a collectible assembly alive.
            // Project into BCL-only values before using STJ. Its reflection metadata cache would
            // otherwise root source types from the model's collectible assembly across builds.
            var values = 0;
            var snapshot = JsonSerializer.SerializeToElement(ProjectMechanism(source, new HashSet<object>(ReferenceEqualityComparer.Instance), 0, ref values));
            if (Encoding.UTF8.GetByteCount(snapshot.GetRawText()) > MaximumMechanismBytes)
                throw new JsonException("Mechanism exceeds 256 KiB of JSON.");
            Enqueue(new ViewerCommand(() => mechanism = snapshot));
        }
        catch (Exception error) when (error is not OutOfMemoryException and not OperationCanceledException)
        {
            Enqueue(new ViewerCommand(() =>
            {
                mechanism = null;
                warnings.Add(new Issue(
                    $"PicoGK mechanism could not be serialized: {error.Message}",
                    "CS_TAU_MECHANISM_SERIALIZATION", "validation", "warning"));
            }));
        }
    }

    private object? ProjectMechanism(object? value, HashSet<object> path, int depth, ref int values)
    {
        if (cancelled) throw new OperationCanceledException("The PicoGK build was cancelled.");
        if (depth > 64) throw new JsonException("Mechanism exceeds the maximum JSON depth of 64.");
        if (++values > MaximumMechanismValues) throw new JsonException("Mechanism exceeds 100,000 JSON values.");
        if (value is null || value is string or bool or char or byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal or JsonElement)
            return value;
        if (value is JsonNode node) return JsonSerializer.SerializeToElement(node);
        if (value is Enum enumerated) return Convert.ChangeType(enumerated, Enum.GetUnderlyingType(enumerated.GetType()));
        if (!path.Add(value)) throw new JsonException("Mechanism contains a reference cycle.");
        try
        {
            if (value is IDictionary dictionary)
            {
                var result = new Dictionary<string, object?>();
                foreach (DictionaryEntry entry in dictionary)
                {
                    if (entry.Key is not string key) throw new JsonException("Mechanism object keys must be strings.");
                    result.Add(key, ProjectMechanism(entry.Value, path, depth + 1, ref values));
                }
                return result;
            }
            if (value is IDictionary<string, object?> genericDictionary)
            {
                var result = new Dictionary<string, object?>();
                foreach (var entry in genericDictionary)
                    result.Add(entry.Key, ProjectMechanism(entry.Value, path, depth + 1, ref values));
                return result;
            }
            if (value is IEnumerable sequence)
            {
                var result = new List<object?>();
                foreach (var item in sequence) result.Add(ProjectMechanism(item, path, depth + 1, ref values));
                return result;
            }
            var properties = new Dictionary<string, object?>();
            foreach (var property in value.GetType().GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
            {
                if (property.GetMethod is null || property.GetIndexParameters().Length != 0) continue;
                properties.Add(property.Name, ProjectMechanism(property.GetValue(value), path, depth + 1, ref values));
            }
            return properties;
        }
        finally
        {
            path.Remove(value);
        }
    }

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

    public void SetGroupMaterial(int groupId, global::PicoGK.Material material)
    {
        var snapshot = MaterialCapture.Snapshot(material, groupId);
        Enqueue(new ViewerCommand(() => materials[groupId] = new Material(snapshot.Color, snapshot.Metallic, snapshot.Roughness, snapshot)));
    }

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
        bool close;
        lock (gate)
        {
            close = !completed;
            completed = true;
        }
        if (close) commands.CompleteAdding();
        pump.GetAwaiter().GetResult();
        RethrowPumpError();
    }

    internal CapturedScene Extract()
    {
        bool isCompleted;
        lock (gate) isCompleted = completed;
        if (isCompleted) Complete();
        else Flush();
        lock (gate)
        {
            ThrowIfDisposed();
            // An empty viewer is an empty scene, not an error: new projects start with no geometry.
            var resources = new MaterialResources();
            return new CapturedScene(MaterializeComponents(resources), meshConstruction, meshExtraction, normalGeneration, mechanism, warnings.ToArray(), resources);
        }
    }

    public void Dispose()
    {
        lock (gate)
        {
            if (disposed) return;
            disposed = true;
        }
        try
        {
            Complete();
        }
        finally
        {
            lock (gate)
            {
                foreach (var item in objects) ReleaseGeometry(item.Geometry);
                objects.Clear();
                objectIndex.Clear();
                componentIdentities.Clear();
                authoredNames.Clear();
                materialized.Clear();
                materials.Clear();
                groupMatrices.Clear();
                hiddenGroups.Clear();
                warnings.Clear();
            }
            commands.Dispose();
            admissionCancellation.Dispose();
        }
    }

    [ExcludeFromCodeCoverage]
    private void Pump()
    {
        try
        {
            while (commands.TryTake(out var first, Timeout.Infinite))
            {
                var batch = new List<ViewerCommand> { first };
                while (batch.Count < MaximumPendingCommands && commands.TryTake(out var next)) batch.Add(next);
                ApplyBatch(batch);
            }
        }
        catch (Exception error)
        {
            pumpError = ExceptionDispatchInfo.Capture(error);
            commands.CompleteAdding();
            while (commands.TryTake(out var command))
            {
                command.Release?.Invoke();
                command.Completion?.Set();
            }
        }
    }

    private void ApplyBatch(IReadOnlyList<ViewerCommand> batch)
    {
        lock (gate)
        {
            try
            {
                foreach (var command in batch) command.Apply();
            }
            catch (Exception error)
            {
                // Publish before waking waiters, including barriers already removed from the queue.
                pumpError = ExceptionDispatchInfo.Capture(error);
                throw;
            }
            finally
            {
                foreach (var command in batch)
                {
                    command.Release?.Invoke();
                    command.Completion?.Set();
                }
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

    /// <summary>Fail every viewer call from here on, so a cancelled model stops at its next one.</summary>
    internal void Cancel()
    {
        lock (gate)
        {
            if (disposed) return;
            cancelled = true;
            admissionCancellation.Cancel();
        }
    }

    private void Enqueue(ViewerCommand command)
    {
        var accepted = false;
        try
        {
            var admission = CheckAdmission();
            try
            {
                commands.Add(command, admission);
                accepted = true;
            }
            catch (InvalidOperationException)
            {
                RethrowPumpError();
                throw;
            }
            if (command.Completion is null) RethrowPumpError();
        }
        finally
        {
            if (!accepted) command.Release?.Invoke();
        }
    }

    [ExcludeFromCodeCoverage]
    private void RethrowPumpError() => pumpError?.Throw();

    private void EnqueueNamed(object identity, string name, int group)
    {
        if (string.IsNullOrWhiteSpace(name) || name != name.Trim())
            throw InvalidName("PicoGK authored names must be nonempty and have no surrounding whitespace.");
        EnqueueGeometry(identity, name, group);
    }

    private CancellationToken CheckAdmission()
    {
        RethrowPumpError();
        if (cancelled) throw new OperationCanceledException("The PicoGK build was cancelled.");
        lock (gate)
        {
            ThrowIfDisposed();
            if (completed) throw new InvalidOperationException("The PicoGK viewer command pump has completed.");
            return admissionCancellation.Token;
        }
    }

    private void EnqueueGeometry(object identity, string? name, int group)
    {
        _ = CheckAdmission();
        // Allocate the command before retaining arrays; an allocation failure cannot orphan them.
        GeometrySnapshot? snapshot = null;
        var command = new ViewerCommand(() => AddObject(identity, name, group, snapshot!))
        {
            Release = () => ReleaseGeometry(snapshot!),
        };
        // Both callbacks become reachable only after this owned capture completes.
        snapshot = SnapshotGeometry(identity);
        Enqueue(command);
    }

    private void AddObject(object identity, string? name, int group, GeometrySnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(identity);
        if (!componentIdentities.TryGetValue(identity, out var componentIdentity))
        {
            var ordinal = ++nextComponentOrdinal;
            componentIdentity = new ComponentIdentity($"component:picogk-{ordinal}");
            componentIdentities.Add(identity, componentIdentity);
        }
        if (name is not null)
        {
            authoredNames.Remove(identity);
            authoredNames.Add(identity, new AuthoredName(name));
        }
        objects.EnsureCapacity(objects.Count + 1);
        objectIndex.EnsureCapacity(objectIndex.Count + 1);
        var item = new SceneObject(
            identity,
            componentIdentity.Id,
            group,
            authoredNames.TryGetValue(identity, out var authored) ? authored.Value : null,
            snapshot,
            Matrix4x4.Identity);
        if (objectIndex.TryGetValue(identity, out var existing))
        {
            objects.Remove(existing);
            objectIndex.Remove(identity);
            materialized.Remove(identity);
            ReleaseGeometry(existing.Geometry);
        }
        lock (geometryGate) snapshot.Owners++;
        objects.Add(item);
        objectIndex.Add(identity, item);
    }

    private void RemoveObject(object identity)
    {
        if (!objectIndex.Remove(identity, out var item)) return;
        objects.Remove(item);
        materialized.Remove(identity);
        ReleaseGeometry(item.Geometry);
    }

    private void SetMatrix(object identity, Matrix4x4 matrix)
    {
        if (!objectIndex.TryGetValue(identity, out var item)) return;
        var replacement = item with { Matrix = matrix };
        objects[objects.IndexOf(item)] = replacement;
        objectIndex[identity] = replacement;
        materialized.Remove(identity);
    }

    private GeometrySnapshot SnapshotGeometry(object source)
    {
        ArgumentNullException.ThrowIfNull(source);
        var construction = Stopwatch.StartNew();
        using var capture = source switch
        {
            Mesh mesh => mesh.TauAcquireGeometry(),
            Voxels voxels => voxels.TauAcquireGeometry(),
            PolyLine line => line.TauAcquireGeometry(),
            _ => throw new ArgumentException("Unsupported PicoGK viewer geometry.", nameof(source)),
        };
        construction.Stop();
        var kind = source is PolyLine ? "lines" : "triangles";
        var key = (capture.Library, kind, capture.Generation);
        lock (geometryGate)
        {
            if (source is Voxels) meshConstruction += construction.Elapsed.TotalMilliseconds;
            if (geometry.TryGetValue(key, out var existing))
            {
                existing.Owners++;
                return existing;
            }
            var bytes = checked(((long)capture.PositionCount + capture.IndexCount) * sizeof(uint));
            if (bytes > MaximumOwnedGeometryBytes - geometryBytes)
                throw new WorkerException(new Issue("PicoGK owned source geometry exceeds 256 MiB.",
                    "CS_TAU_RUNTIME", "validation", "error"));
            var extraction = Stopwatch.StartNew();
            var positions = new float[capture.PositionCount];
            var indices = new uint[capture.IndexCount];
            capture.Copy(positions, indices);
            extraction.Stop();
            meshExtraction += extraction.Elapsed.TotalMilliseconds;
            var snapshot = new GeometrySnapshot(kind, positions, indices, source is PolyLine ? capture.Color : (ColorFloat?)null)
            {
                Identity = key,
                Owners = 1,
            };
            geometry.Add(key, snapshot);
            geometryBytes += bytes;
            geometryCopies++;
            return snapshot;
        }
    }

    private void ReleaseGeometry(GeometrySnapshot snapshot)
    {
        lock (geometryGate)
        {
            if (--snapshot.Owners != 0) return;
            geometry.Remove(snapshot.Identity);
            geometryBytes -= snapshot.ByteLength;
        }
    }

    private List<ExtractedComponent> MaterializeComponents(MaterialResources resources)
    {
        var components = new List<ExtractedComponent>();
        var names = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in objects.Where(item => !hiddenGroups.Contains(item.Group)))
        {
            if (item.Geometry.Positions.Length == 0 || item.Geometry.Indices.Length == 0) continue;
            if (item.Name is { } name && !names.Add(name))
                throw InvalidName($"Duplicate PicoGK authored name '{name}' in the final scene.");
            var matrix = MatrixFor(item);
            var material = MaterialFor(item);
            var authored = material.Authored;
            if (item.Geometry.Kind == "lines" && authored is not null && MaterialCapture.NeedsCoordinates(authored))
                throw MaterialCapture.Invalid($"group {item.Group}", "cannot apply texture maps or anisotropy to a PolyLine; use a surface mesh");
            var materialJson = authored is null ? (JsonElement?)null : MaterialCapture.Project(authored, resources);
            if (!materialized.TryGetValue(item.Identity, out var cached) || cached.Matrix != matrix)
            {
                var positions = TransformPositions(item.Geometry.Positions, matrix);
                var indices = item.Geometry.Indices;
                var normals = Array.Empty<float>();
                var sources = Array.Empty<int>();
                if (item.Geometry.Kind == "triangles")
                {
                    var generation = Stopwatch.StartNew();
                    normals = ModelRunner.VertexNormals(ref positions, ref indices, out sources);
                    generation.Stop();
                    normalGeneration += generation.Elapsed.TotalMilliseconds;
                }
                var geometry = new ExtractedComponent(item.Id, item.Geometry.Kind, item.Name,
                    ColorValues(material.Color), material.Metallic, material.Roughness, positions, normals, indices);
                cached = new MaterializedComponent(matrix, geometry, sources);
                materialized[item.Identity] = cached;
            }
            var component = cached.Component;
            if (item.Geometry.Kind == "triangles" && authored is not null && MaterialCapture.NeedsCoordinates(authored))
            {
                if (cached.TexturedComponent is null)
                {
                    var modelPositions = RemapVectors(item.Geometry.Positions, cached.Sources);
                    var coordinates = SurfaceCoordinates.Project(modelPositions, component.Indices);
                    var normals = RemapVectors(component.Normals, coordinates.Sources);
                    var (texCoords, tangents) = SurfaceCoordinates.Expand(coordinates, normals, matrix);
                    cached = cached with { TexturedComponent = component with
                    {
                        Positions = RemapVectors(component.Positions, coordinates.Sources),
                        Normals = normals, Indices = coordinates.Indices, TexCoords = texCoords, Tangents = tangents,
                    } };
                    materialized[item.Identity] = cached;
                }
                component = cached.TexturedComponent!;
            }
            components.Add(component with
            {
                Name = item.Name, Color = ColorValues(material.Color), Metallic = material.Metallic,
                Roughness = material.Roughness, Material = materialJson,
            });
        }
        return components;
    }

    private Matrix4x4 MatrixFor(SceneObject item) => item.Matrix * groupMatrices.GetValueOrDefault(item.Group, Matrix4x4.Identity);

    private Material MaterialFor(SceneObject item)
    {
        if (materials.TryGetValue(item.Group, out var material)) return material;
        return item.Geometry.LineColor is { } color ? DefaultMaterial with { Color = color } : DefaultMaterial;
    }

    private static float[] RemapVectors(float[] values, int[] sources)
    {
        var output = new float[sources.Length * 3];
        for (var vertex = 0; vertex < sources.Length; vertex++)
            Array.Copy(values, sources[vertex] * 3, output, vertex * 3, 3);
        return output;
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
        if (geometry.CachedBounds is { } cached) return cached;
        var bounds = new BBox3();
        for (var index = 0; index < geometry.Positions.Length; index += 3)
        {
            bounds.Include(new Vector3(geometry.Positions[index], geometry.Positions[index + 1], geometry.Positions[index + 2]));
        }
        geometry.CachedBounds = bounds;
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
    private static WorkerException InvalidName(string message) => new(new Issue(message, "CS_TAU_INVALID_NAME", "validation", "error"));
    private static WorkerException UnsupportedCapability(string capability) => new(new Issue(
        $"The hosted PicoGK viewer does not support {capability}.",
        "CS_TAU_VIEWER_CAPABILITY",
        "validation",
        "error"));
    private void ThrowIfDisposed() => ObjectDisposedException.ThrowIf(disposed, this);

    private sealed record ViewerCommand(Action Apply, ManualResetEventSlim? Completion = null)
    {
        internal Action? Release { get; init; }
    }
    private sealed record ComponentIdentity(string Id);
    private sealed record AuthoredName(string Value);
    private sealed record SceneObject(
        object Identity,
        string Id,
        int Group,
        string? Name,
        GeometrySnapshot Geometry,
        Matrix4x4 Matrix);
    private sealed record MaterializedComponent(Matrix4x4 Matrix, ExtractedComponent Component, int[] Sources, ExtractedComponent? TexturedComponent = null);
    private sealed record Material(ColorFloat Color, float Metallic, float Roughness, global::PicoGK.Material? Authored = null);
}
