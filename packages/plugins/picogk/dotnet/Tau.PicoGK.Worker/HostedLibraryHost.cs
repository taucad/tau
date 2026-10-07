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
using System.Reflection;
using PicoGK;
using PicoGK.Numerics;

namespace Tau.PicoGK.Worker;

internal sealed class HostedLibraryHost : ILibraryHost, IDisposable
{
    // How long the hosting thread waits between viewer polls while the model is still running.
    private const int ViewerPollIntervalMilliseconds = 5;

    private readonly string artifactRoot;
    private readonly CancellationToken cancellation;
    private readonly ComputeWorkerSession? compute;
    private ModelExecutionResult? result;
    private bool disposed;

    internal HostedLibraryHost(string artifactRoot, CancellationToken cancellation = default, ComputeWorkerSession? compute = null)
    {
        this.artifactRoot = Path.GetFullPath(artifactRoot);
        this.cancellation = cancellation;
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
        Task? task = null;
        TauComputeRun? reuse = null;
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
            reuse = compute?.Attach(library);
            backend.ComputeReuse = reuse;
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
            cancellation.ThrowIfCancellationRequested();
            var computeRecords = reuse?.EncodeSuccessful();
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
                captured.Resources, captured.WorkCounters) with { ComputeRecords = computeRecords };
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
            backend.ComputeReuse = null;
            if (library is not null) library.TauComputeReuse = null;
            Cleanup(() => reuse?.Dispose());
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
    MaterialResources? Resources = null, WorkCounters? WorkCounters = null);

internal sealed record GeometrySnapshot(string Kind, float[] Positions, uint[] Indices, ColorFloat? LineColor)
{
    internal (Library Library, string Kind, ulong Generation) Identity { get; init; }
    internal int Owners { get; set; }
    internal long LayoutBytes { get; set; }
    internal Dictionary<(Matrix4x4 Source, Matrix4x4 Baked), PrototypeLayout> Layouts { get; } = [];
    internal Dictionary<(Matrix4x4 Source, Matrix4x4 Baked), ExtractedComponent> TexturedLayouts { get; } = [];
    internal BBox3? CachedBounds { get; set; }
    internal long ByteLength => checked(((long)Positions.Length + Indices.Length) * sizeof(uint));
}

internal sealed record PrototypeLayout(ExtractedComponent Component, int[] Sources, LayoutStability? Stability);

internal readonly record struct GeometryPublication(GeometrySnapshot Geometry, Matrix4x4 SourceMatrix, bool IsPlaced, BBox3 SourceBounds);

/// <summary>
/// Applies hosted viewer calls on a bounded pump. One drained batch is one native-style poll update;
/// bounded enqueueing provides producer backpressure instead of retaining an unbounded scene history.
/// </summary>
internal sealed class CaptureViewerBackend : IViewerBackend
{
    internal TauComputeRun? ComputeReuse { get; set; }
    private static readonly Material DefaultMaterial = new(new ColorFloat("B8BCC4"), 0f, 0.7f);
    private readonly object gate = new();
    private readonly object geometryGate = new();
    private readonly CancellationTokenSource admissionCancellation = new();
    private readonly Dictionary<(Library Library, string Kind, ulong Generation), GeometrySnapshot> geometry = [];
    private long geometryBytes;
    private long layoutBytes;
    private long geometryCopies;
    private long capturedSnapshots;
    private long inputVertices;
    private long inputIndices;
    private long normalLayouts;
    private long uvLayouts;
    private long materialProjections;
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
            var snapshot = JsonSerializer.SerializeToElement(ProjectMechanism(source, new HashSet<object>(ReferenceEqualityComparer.Instance), 0, ref values, MechanismNode.Root));
            if (snapshot.ValueKind == JsonValueKind.Object && snapshot.TryGetProperty("schemaVersion", out var version) &&
                (version.ValueKind != JsonValueKind.Number || !version.TryGetDouble(out var number) || number != 1))
                throw new JsonException("Mechanism schemaVersion must be 1.");
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

    // Structural field vocabulary is owned by packages/kinematics/src/types.ts.
    // Context follows known fields; dynamic IDs, raw JSON and custom details remain exact.
    private enum MechanismNode { Exact, Root, Units, Links, Link, Joints, Joint, Limits, Couplings, Coupling, Curve, Animations, Animation, Keyframes, Keyframe }

    private static bool StructuralField(MechanismNode node, string name) => node switch
    {
        MechanismNode.Root => name is "schemaVersion" or "units" or "root" or "links" or "joints" or "couplings" or "animations",
        MechanismNode.Units => name is "length" or "angle",
        MechanismNode.Link => name is "shapes" or "components",
        MechanismNode.Joint => name is "name" or "parent" or "child" or "origin" or "type" or "axis" or "limits" or "lead" or "handedness" or "normal" or "xAxis",
        MechanismNode.Limits => name is "lower" or "upper" or "angle" or "distance" or "x" or "y",
        MechanismNode.Coupling => name is "driver" or "follower" or "ratio" or "offset" or "curve",
        MechanismNode.Curve => name is "driverPeriod" or "values",
        MechanismNode.Animation => name is "id" or "name" or "duration" or "loop" or "keyframes",
        MechanismNode.Keyframe => name is "time" or "coordinates",
        _ => false,
    };

    private static string MechanismField(MechanismNode node, string name)
    {
        var candidate = char.ToLowerInvariant(name[0]) + name[1..];
        return StructuralField(node, candidate) ? candidate : name;
    }

    private static MechanismNode MechanismChild(MechanismNode node, string name) => (node, name) switch
    {
        (MechanismNode.Root, "units") => MechanismNode.Units,
        (MechanismNode.Root, "links") => MechanismNode.Links,
        (MechanismNode.Root, "joints") => MechanismNode.Joints,
        (MechanismNode.Root, "couplings") => MechanismNode.Couplings,
        (MechanismNode.Root, "animations") => MechanismNode.Animations,
        (MechanismNode.Links, _) => MechanismNode.Link,
        (MechanismNode.Joints, _) => MechanismNode.Joint,
        (MechanismNode.Joint, "limits") => MechanismNode.Limits,
        (MechanismNode.Limits, "angle" or "distance" or "x" or "y") => MechanismNode.Limits,
        (MechanismNode.Coupling, "curve") => MechanismNode.Curve,
        (MechanismNode.Animation, "keyframes") => MechanismNode.Keyframes,
        _ => MechanismNode.Exact,
    };

    private static MechanismNode MechanismItem(MechanismNode node) => node switch
    {
        MechanismNode.Couplings => MechanismNode.Coupling,
        MechanismNode.Animations => MechanismNode.Animation,
        MechanismNode.Keyframes => MechanismNode.Keyframe,
        _ => MechanismNode.Exact,
    };

    private static object? MechanismProperty(System.Reflection.PropertyInfo property, object owner)
    {
        try { return property.GetValue(owner); }
        catch (System.Reflection.TargetInvocationException error)
        {
            if (error.InnerException is OperationCanceledException or OutOfMemoryException)
                System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(error.InnerException).Throw();
            throw;
        }
    }

    private static bool MechanismDefault(System.Reflection.PropertyInfo property, object? value)
    {
        if (value is null) return true;
        var type = property.PropertyType;
        if (!type.IsValueType || Nullable.GetUnderlyingType(type) is not null) return false;
        // Standard EqualityComparer<T> semantics, without invoking a user struct constructor
        // or retaining any model Type/comparer after this projection.
        var comparerType = typeof(EqualityComparer<>).MakeGenericType(type);
        var comparer = comparerType.GetProperty("Default")!.GetValue(null);
        var equals = comparerType.GetMethod("Equals", [type, type])!;
        try { return (bool)equals.Invoke(comparer, [value, System.Runtime.CompilerServices.RuntimeHelpers.GetUninitializedObject(type)])!; }
        catch (TargetInvocationException error)
        {
            if (error.InnerException is OperationCanceledException or OutOfMemoryException)
                ExceptionDispatchInfo.Capture(error.InnerException).Throw();
            throw;
        }
    }

    private object? ProjectMechanism(object? value, HashSet<object> path, int depth, ref int values, MechanismNode node)
    {
        if (cancelled) throw new OperationCanceledException("The PicoGK build was cancelled.");
        if (depth > 64) throw new JsonException("Mechanism exceeds the maximum JSON depth of 64.");
        if (++values > MaximumMechanismValues) throw new JsonException("Mechanism exceeds 100,000 JSON values.");
        if (value is null || value is string or bool or char or byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal or JsonElement)
            return value;
        if (value is JsonNode jsonNode) return JsonSerializer.SerializeToElement(jsonNode);
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
                    result.Add(key, ProjectMechanism(entry.Value, path, depth + 1, ref values, MechanismChild(node, key)));
                }
                return result;
            }
            if (value is IDictionary<string, object?> genericDictionary)
            {
                var result = new Dictionary<string, object?>();
                foreach (var entry in genericDictionary)
                    result.Add(entry.Key, ProjectMechanism(entry.Value, path, depth + 1, ref values, MechanismChild(node, entry.Key)));
                return result;
            }
            if (value is IEnumerable sequence)
            {
                var result = new List<object?>();
                foreach (var item in sequence) result.Add(ProjectMechanism(item, path, depth + 1, ref values, MechanismItem(node)));
                return result;
            }
            var descriptors = new List<(System.Reflection.PropertyInfo Property, string Name, JsonIgnoreCondition Ignore)>();
            var names = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var property in value.GetType().GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
            {
                if (property.GetMethod is not { IsPublic: true } || property.GetIndexParameters().Length != 0) continue;
                var ignore = property.GetCustomAttribute<JsonIgnoreAttribute>()?.Condition ?? JsonIgnoreCondition.Never;
                if (ignore == JsonIgnoreCondition.Always) continue;
                if (ignore is not (JsonIgnoreCondition.Never or JsonIgnoreCondition.WhenWritingNull or JsonIgnoreCondition.WhenWritingDefault))
                    throw new JsonException($"Unsupported JsonIgnore condition on mechanism property '{property.Name}'.");
                var name = property.GetCustomAttribute<JsonPropertyNameAttribute>()?.Name ?? MechanismField(node, property.Name);
                if (names.TryGetValue(name, out var prior))
                    throw new JsonException($"Ambiguous mechanism field '{name}' from properties '{string.Join("' and '", new[] { prior, property.Name }.Order(StringComparer.Ordinal))}'.");
                names.Add(name, property.Name);
                descriptors.Add((property, name, ignore));
            }
            var properties = new Dictionary<string, object?>();
            foreach (var descriptor in descriptors)
            {
                var item = MechanismProperty(descriptor.Property, value);
                if (descriptor.Ignore == JsonIgnoreCondition.WhenWritingNull && item is null) continue;
                if (descriptor.Ignore == JsonIgnoreCondition.WhenWritingDefault && MechanismDefault(descriptor.Property, item)) continue;
                properties.Add(descriptor.Name, ProjectMechanism(item, path, depth + 1, ref values, MechanismChild(node, descriptor.Name)));
            }
            if (node == MechanismNode.Root && !properties.ContainsKey("schemaVersion")) properties.Add("schemaVersion", 1);
            return properties;
        }
        finally { path.Remove(value); }
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
        var admission = CheckAdmission();
        var snapshot = MaterialCapture.Snapshot(material, groupId, out var digests, admission);
        Enqueue(new ViewerCommand(() => materials[groupId] = new Material(snapshot.Color, snapshot.Metallic, snapshot.Roughness, snapshot, digests)));
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
                IncludeTransformed(bounds: ref bounds, item.SourceBounds, MatrixFor(item));
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
            return new CapturedScene(MaterializeComponents(resources), meshConstruction, meshExtraction, normalGeneration, mechanism, warnings.ToArray(), resources,
                new WorkCounters(capturedSnapshots, geometryCopies, inputVertices, inputIndices, normalLayouts, uvLayouts, materialProjections));
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
        GeometryPublication publication = default;
        var command = new ViewerCommand(() => AddObject(identity, name, group, publication))
        {
            Release = () => ReleaseGeometry(publication.Geometry),
        };
        // Both callbacks become reachable only after this owned capture completes.
        publication = SnapshotGeometry(identity);
        Enqueue(command);
    }

    private void AddObject(object identity, string? name, int group, GeometryPublication publication)
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
            componentIdentity.Id,
            group,
            authoredNames.TryGetValue(identity, out var authored) ? authored.Value : null,
            publication.Geometry,
            Matrix4x4.Identity,
            publication.SourceMatrix,
            publication.IsPlaced,
            publication.SourceBounds);
        if (objectIndex.TryGetValue(identity, out var existing))
        {
            objects.Remove(existing);
            objectIndex.Remove(identity);
            ReleaseGeometry(existing.Geometry);
        }
        lock (geometryGate) publication.Geometry.Owners++;
        objects.Add(item);
        objectIndex.Add(identity, item);
    }

    private void RemoveObject(object identity)
    {
        if (!objectIndex.Remove(identity, out var item)) return;
        objects.Remove(item);
        ReleaseGeometry(item.Geometry);
    }

    private void SetMatrix(object identity, Matrix4x4 matrix)
    {
        if (!objectIndex.TryGetValue(identity, out var item)) return;
        var replacement = item with { Matrix = matrix };
        objects[objects.IndexOf(item)] = replacement;
        objectIndex[identity] = replacement;
    }

    private GeometryPublication SnapshotGeometry(object source)
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
        var placement = source is PolyLine ? (TauMeshPlacement?)null : Mesh.TauReadPlacement(capture);
        var key = (capture.Library, kind, placement?.PrototypeGeneration ?? capture.Generation);
        lock (geometryGate)
        {
            capturedSnapshots++;
            if (source is Voxels) meshConstruction += construction.Elapsed.TotalMilliseconds;
            if (geometry.TryGetValue(key, out var existing))
            {
                existing.Owners++;
                return new(existing, placement?.Matrix ?? Matrix4x4.Identity, placement?.IsPlaced ?? false, placement?.Bounds ?? BoundsOf(existing));
            }
            var bytes = checked(((long)capture.PositionCount + capture.IndexCount) * sizeof(uint));
            if (bytes > MaximumOwnedGeometryBytes - geometryBytes)
                throw new WorkerException(new Issue("PicoGK owned source geometry exceeds 256 MiB.",
                    "CS_TAU_RUNTIME", "validation", "error"));
            var extraction = Stopwatch.StartNew();
            var positions = new float[capture.PositionCount];
            var indices = new uint[capture.IndexCount];
            if (placement is null) capture.Copy(positions, indices);
            else Mesh.TauCopyPrototype(capture, positions, indices);
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
            inputVertices += positions.Length / 3;
            inputIndices += indices.Length;
            return new(snapshot, placement?.Matrix ?? Matrix4x4.Identity, placement?.IsPlaced ?? false, placement?.Bounds ?? BoundsOf(snapshot));
        }
    }

    private void ReleaseGeometry(GeometrySnapshot snapshot)
    {
        lock (geometryGate)
        {
            if (--snapshot.Owners != 0) return;
            geometry.Remove(snapshot.Identity);
            layoutBytes -= snapshot.LayoutBytes;
            snapshot.LayoutBytes = 0;
            snapshot.Layouts.Clear();
            snapshot.TexturedLayouts.Clear();
            geometryBytes -= snapshot.ByteLength;
        }
    }

    private long RemainingLayoutBytes { get { lock(geometryGate)return MaximumOwnedGeometryBytes-layoutBytes; } }

    private void ReserveLayout(GeometrySnapshot snapshot, long bytes)
    {
        lock (geometryGate)
        {
            if (bytes > MaximumOwnedGeometryBytes - layoutBytes)
                throw new WorkerException(new Issue("PicoGK derived layout geometry exceeds 256 MiB.", "CS_TAU_RUNTIME", "validation", "error"));
            layoutBytes += bytes;
            snapshot.LayoutBytes += bytes;
        }
    }

    private List<ExtractedComponent> MaterializeComponents(MaterialResources resources)
    {
        var components = new List<ExtractedComponent>();
        var names = new HashSet<string>(StringComparer.Ordinal);
        var projectedMaterials = new Dictionary<global::PicoGK.Material, JsonElement>(ReferenceEqualityComparer.Instance);
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
            JsonElement? materialJson = null;
            if (authored is not null)
            {
                if (!projectedMaterials.TryGetValue(authored, out var projected))
                {
                    projected = MaterialCapture.Project(authored, resources, material.ImageDigests);
                    projectedMaterials.Add(authored, projected);
                    materialProjections++;
                }
                materialJson = projected;
            }
            // Local layouts belong to native generations, not names, materials, or viewer identities.
            // Nonuniform scale, shear, reflection, singular/projective and nonfinite transforms use
            // the existing two-stage baked path: they can change the 30-degree crease partition.
            var sourceMatrix = item.IsPlaced ? item.SourceMatrix : Matrix4x4.Identity;
            var texturedMaterial = authored is not null && MaterialCapture.NeedsCoordinates(authored);
            // Source-world UV charts and unsafe source transforms own a derived local layout.
            // A later rigid viewer placement still shares that immutable variant.
            var localSource = !CanSharePlacement(sourceMatrix) || texturedMaterial && !TranslationOnly(sourceMatrix)
                ? sourceMatrix : Matrix4x4.Identity;
            var candidateMatrix = localSource == Matrix4x4.Identity ? sourceMatrix * matrix : matrix;
            var local = CanSharePlacement(matrix);
            PrototypeLayout BuildLayout(Matrix4x4 source, Matrix4x4 baked)
            {
                var layoutKey = (source, baked);
                if (item.Geometry.Layouts.TryGetValue(layoutKey, out var existing)) return existing;
                var positions = TransformPositions(item.Geometry.Positions, baked, source, source != Matrix4x4.Identity);
                var indices = item.Geometry.Indices;
                var normals = Array.Empty<float>();
                var sources = Array.Empty<int>();
                LayoutStability? stability = null;
                TauComputeLayoutTicket? ticket = null;
                var duration = 0d;
                var reused = false;
                if (item.Geometry.Kind == "triangles")
                {
                    if (ComputeReuse is {} compute) try {
                        var cached = compute.LookupLayout(new("mesh.normals", ComputeLayoutCodec.Arguments(source, baked)), ComputeLayoutCodec.Digest(positions, indices), out ticket);
                        if (cached is {} bytes) {
                            var template = new PrototypeLayout(new(item.Id,item.Geometry.Kind,item.Name,ColorValues(material.Color),material.Metallic,material.Roughness,positions,normals,indices),sources,stability);
                            var decoded = ComputeLayoutCodec.Decode(bytes,template,(positions.Length/3,RemainingLayoutBytes));
                            compute.RecordLayoutHit();
                            positions=decoded.Component.Positions;normals=decoded.Component.Normals;indices=decoded.Component.Indices;sources=decoded.Sources;stability=decoded.Stability;reused=true;
                        }
                    } catch(Exception error) when(ComputeWorkerSession.IsDisposableFailure(error)){ComputeWorkerSession.ReportBypass("normals-preload",error);}
                    if(!reused) {
                        var generation = Stopwatch.StartNew();
                        normals = ModelRunner.VertexNormals(ref positions, ref indices, out sources, out stability);
                        normalLayouts++;
                        generation.Stop();duration=generation.Elapsed.TotalMilliseconds;
                        normalGeneration += duration;
                    }
                }
                var built = new ExtractedComponent(item.Id, item.Geometry.Kind, item.Name,
                    ColorValues(material.Color), material.Metallic, material.Roughness, positions, normals, indices);
                var result = new PrototypeLayout(built, sources, stability);
                if(!reused)ComputeLayoutCodec.Admit(ComputeReuse,ticket,(result,duration));
                ReserveLayout(item.Geometry, checked(((long)positions.Length + normals.Length + (ReferenceEquals(indices, item.Geometry.Indices) ? 0 : indices.Length) + sources.Length) * sizeof(float)));
                item.Geometry.Layouts.Add(layoutKey, result);
                return result;
            }
            PrototypeLayout layout;
            if (local)
            {
                layout = BuildLayout(localSource, Matrix4x4.Identity);
                var qualificationBounds = BoundsOf(item.Geometry);
                if (localSource != Matrix4x4.Identity)
                {
                    var transformedBounds = new BBox3();
                    IncludeTransformed(ref transformedBounds, qualificationBounds, localSource);
                    qualificationBounds = transformedBounds;
                }
                local = QualifyPlacement(qualificationBounds, localSource == Matrix4x4.Identity ? sourceMatrix : Matrix4x4.Identity,
                    matrix, candidateMatrix, layout.Stability, texturedMaterial);
            }
            var bakedMatrix = local ? Matrix4x4.Identity : matrix;
            var key = local ? (localSource, Matrix4x4.Identity) : (sourceMatrix, bakedMatrix);
            layout = BuildLayout(key.Item1, key.Item2);
            var component = layout.Component;
            if (item.Geometry.Kind == "triangles" && authored is not null && MaterialCapture.NeedsCoordinates(authored))
            {
                if (!item.Geometry.TexturedLayouts.TryGetValue(key, out var textured))
                {
                    var modelPositions = RemapVectors(item.Geometry.Positions, layout.Sources);
                    if ((!local || localSource != Matrix4x4.Identity) && item.IsPlaced) modelPositions = TransformPositions(modelPositions, item.SourceMatrix);
                    TauComputeLayoutTicket? uvTicket = null;
                    ExtractedComponent? cachedUv = null;
                    if(ComputeReuse is {} compute) try {
                        var cached=compute.LookupLayout(new("mesh.uv",ComputeLayoutCodec.Arguments(item.SourceMatrix,bakedMatrix,true)),ComputeLayoutCodec.Digest(modelPositions,component.Positions,component.Normals,component.Indices),out uvTicket);
                        if(cached is {} bytes){cachedUv=ComputeLayoutCodec.Decode(bytes,new(component,Array.Empty<int>(),null),(component.Positions.Length/3,RemainingLayoutBytes)).Component;compute.RecordLayoutHit();}
                    }catch(Exception error)when(ComputeWorkerSession.IsDisposableFailure(error)){ComputeWorkerSession.ReportBypass("uv-preload",error);}
                    if(cachedUv is not null)textured=cachedUv;
                    else {
                        var generation=Stopwatch.StartNew();
                        var coordinates = SurfaceCoordinates.Project(modelPositions, component.Indices);
                        uvLayouts++;
                        var normals = RemapVectors(component.Normals, coordinates.Sources);
                        var (texCoords, tangents) = SurfaceCoordinates.Expand(coordinates, normals, bakedMatrix);
                        textured = component with
                        {
                            PrototypeIdentity = new(),
                            Positions = RemapVectors(component.Positions, coordinates.Sources),
                            Normals = normals, Indices = coordinates.Indices, TexCoords = texCoords, Tangents = tangents,
                        };
                        generation.Stop();ComputeLayoutCodec.Admit(ComputeReuse,uvTicket,(new(textured,Array.Empty<int>(),null),generation.Elapsed.TotalMilliseconds));
                    }
                    ReserveLayout(item.Geometry, checked(((long)textured.Positions.Length + textured.Normals.Length + textured.Indices.Length + textured.TexCoords!.Length + textured.Tangents!.Length) * sizeof(float)));
                    item.Geometry.TexturedLayouts.Add(key, textured);
                }
                component = textured;
            }
            components.Add(component with
            {
                Id = item.Id, Matrix = local ? candidateMatrix : Matrix4x4.Identity,
                Name = item.Name, Color = ColorValues(material.Color), Metallic = material.Metallic,
                Roughness = material.Roughness, Material = materialJson,
            });
        }
        return components;
    }

    private static bool TranslationOnly(Matrix4x4 matrix) => matrix with { M41 = 0, M42 = 0, M43 = 0 } == Matrix4x4.Identity;

    // Native placement provenance already certifies actual = Float32(prototype * source).
    // Gamma(n) bounds the two ordered dot products and their Float32 matrix composition.
    // Bounds are collected once per prototype; qualification never visits occurrence vertices.
    internal static bool QualifyPlacement(BBox3 bounds, Matrix4x4 source, Matrix4x4 viewer,
        Matrix4x4 composed, LayoutStability? stability, bool textured)
    {
        if (!CanSharePlacement(composed)) return false;
        if (source == Matrix4x4.Identity && viewer == Matrix4x4.Identity) return true;
        const double unitRoundoff = 1.0 / (1 << 24);
        static double Gamma(int operations) => operations * unitRoundoff / (1 - operations * unitRoundoff);
        var maximum = Vector3.Max(Vector3.Abs(bounds.vecMin), Vector3.Abs(bounds.vecMax));
        // One four-term dot product has at most seven rounded operations. The composed matrix
        // has the same bound. Absolute sums include translation and do not cancel large offsets.
        static double Row(Vector3 p, Matrix4x4 m, int column) => column switch
        {
            0 => p.X * (double)MathF.Abs(m.M11) + p.Y * (double)MathF.Abs(m.M21) + p.Z * (double)MathF.Abs(m.M31) + MathF.Abs(m.M41),
            1 => p.X * (double)MathF.Abs(m.M12) + p.Y * (double)MathF.Abs(m.M22) + p.Z * (double)MathF.Abs(m.M32) + MathF.Abs(m.M42),
            _ => p.X * (double)MathF.Abs(m.M13) + p.Y * (double)MathF.Abs(m.M23) + p.Z * (double)MathF.Abs(m.M33) + MathF.Abs(m.M43),
        };
        var firstMagnitude = new Vector3(MathF.BitIncrement((float)Row(maximum, source, 0)), MathF.BitIncrement((float)Row(maximum, source, 1)), MathF.BitIncrement((float)Row(maximum, source, 2)));
        var firstError = Gamma(7) * Math.Max(firstMagnitude.X, Math.Max(firstMagnitude.Y, firstMagnitude.Z));
        double error = 0;
        for (var column = 0; column < 3; column++)
        {
            var secondMagnitude = Row(firstMagnitude, viewer, column);
            var amplification = column == 0 ? Math.Abs(viewer.M11) + Math.Abs(viewer.M21) + Math.Abs(viewer.M31)
                : column == 1 ? Math.Abs(viewer.M12) + Math.Abs(viewer.M22) + Math.Abs(viewer.M32)
                : Math.Abs(viewer.M13) + Math.Abs(viewer.M23) + Math.Abs(viewer.M33);
            error = Math.Max(error, firstError * amplification + Gamma(7) * (secondMagnitude + firstError * amplification)
                + Gamma(7) * secondMagnitude + Gamma(7) * Row(maximum, composed, column));
        }
        if (!double.IsFinite(error)) return false;
        if (stability is null) return true;
        var scale = new Vector3(composed.M11, composed.M12, composed.M13).Length();
        var displacement = Math.Sqrt(3) * error;
        var edgeSum = stability.MaximumEdgeSum * scale;
        var crossError = 2 * displacement * edgeSum + 4 * displacement * displacement
            + 32 * unitRoundoff * edgeSum * edgeSum;
        var area = stability.MinimumArea * scale * scale;
        var fan = stability.MinimumFanArea * scale * scale;
        if (!(area > crossError) || !(fan > crossError * stability.MaximumFanFaces)) return false;
        var directionError = 2 * crossError / (area - crossError);
        if (!(stability.CreaseMargin > 2 * directionError + directionError * directionError)) return false;
        return !textured || TranslationOnly(source) && (source == Matrix4x4.Identity || stability.UvAxisMargin > 2 * crossError);
    }

    internal static bool CanSharePlacement(Matrix4x4 matrix)
    {
        if (!AffineFinite(matrix)) return false;
        var x = new Vector3(matrix.M11, matrix.M12, matrix.M13);
        var y = new Vector3(matrix.M21, matrix.M22, matrix.M23);
        var z = new Vector3(matrix.M31, matrix.M32, matrix.M33);
        var scale = x.LengthSquared();
        // Seven rounded operations bound a Float32 dot product. This normalized algebra guard
        // admits rounded rigid matrices; layout qualification separately certifies crease decisions.
        const double dotRoundoff = 7.0 / (1 << 24) / (1 - 7.0 / (1 << 24));
        var guard = dotRoundoff * scale;
        return scale > 0 && float.IsFinite(scale) && Math.Abs(y.LengthSquared() - scale) <= 2 * guard && Math.Abs(z.LengthSquared() - scale) <= 2 * guard
            && Math.Abs(Vector3.Dot(x, y)) <= guard && Math.Abs(Vector3.Dot(x, z)) <= guard && Math.Abs(Vector3.Dot(y, z)) <= guard
            && matrix.GetDeterminant() > 0;
    }

    internal static bool AffineFinite(Matrix4x4 matrix) =>
        float.IsFinite(matrix.M11) && float.IsFinite(matrix.M12) && float.IsFinite(matrix.M13) && matrix.M14 == 0 &&
        float.IsFinite(matrix.M21) && float.IsFinite(matrix.M22) && float.IsFinite(matrix.M23) && matrix.M24 == 0 &&
        float.IsFinite(matrix.M31) && float.IsFinite(matrix.M32) && float.IsFinite(matrix.M33) && matrix.M34 == 0 &&
        float.IsFinite(matrix.M41) && float.IsFinite(matrix.M42) && float.IsFinite(matrix.M43) && matrix.M44 == 1;

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

    private static float[] TransformPositions(float[] source, Matrix4x4 matrix, Matrix4x4 sourceMatrix = default, bool isPlaced = false)
    {
        var positions = new float[source.Length];
        for (var index = 0; index < source.Length / 3; index++)
        {
            var point = new Vector3(source[index * 3], source[index * 3 + 1], source[index * 3 + 2]);
            // Preserve the source transform's float rounding before applying viewer/group placement.
            if (isPlaced) point = Vector3.Transform(point, sourceMatrix);
            WriteVector(positions, index, Vector3.Transform(point, matrix));
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
        string Id,
        int Group,
        string? Name,
        GeometrySnapshot Geometry,
        Matrix4x4 Matrix,
        Matrix4x4 SourceMatrix,
        bool IsPlaced,
        BBox3 SourceBounds);
    private sealed record Material(ColorFloat Color, float Metallic, float Roughness, global::PicoGK.Material? Authored = null, Dictionary<byte[], string>? ImageDigests = null);
}
