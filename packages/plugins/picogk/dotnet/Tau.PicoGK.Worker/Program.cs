using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using PicoGK;

namespace Tau.PicoGK.Worker;

internal static class Program
{
    private const int ProtocolVersion = 3;
    private const int MaximumRequestCharacters = 1_048_576;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly object ProtocolGate = new();
    private static TextWriter protocol = Console.Out;

    private static int Main(string[] args) => Run(args, Console.In, Console.Out, Console.Error, watchParent: true);

    internal static long ManagedHeapBytesAfterCollection()
    {
        // One completed-GC snapshot excludes fragmentation and later temporary
        // allocations without forcing another collection for telemetry.
        var collection = GC.GetGCMemoryInfo();
        return collection.HeapSizeBytes - collection.FragmentedBytes;
    }

    internal static int Run(string[] args, TextReader input, TextWriter output, TextWriter error, bool watchParent = false)
    {
        var arguments = ParseArguments(args);
        protocol = output;
        var originalOutput = Console.Out;
        Console.SetOut(error);
        try
        {
            if (watchParent) StartParentWatch(arguments.ParentPid);
            Write(new
            {
                protocolVersion = ProtocolVersion,
                type = "ready",
                dotnetVersion = Environment.Version.ToString(),
                picogkVersion = typeof(Library).Assembly.GetName().Version!.ToString(),
            });

            string? line;
            while ((line = input.ReadLine()) is not null)
            {
                if (line.Length > MaximumRequestCharacters) return 2;
                Request request;
                try
                {
                    request = JsonSerializer.Deserialize<Request>(line, JsonOptions)
                        ?? throw new JsonException("Request was null.");
                }
                catch (JsonException exception)
                {
                    error.WriteLine(exception.Message);
                    return 2;
                }
                if (request.ProtocolVersion != ProtocolVersion) return 2;
                try
                {
                    var shouldStop = Dispatch(request, arguments);
                    if (shouldStop) return 0;
                }
                catch (WorkerException exception)
                {
                    Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, error = new { issues = exception.Issues } });
                }
                catch (Exception exception)
                {
                    Write(new
                    {
                        protocolVersion = ProtocolVersion,
                        requestId = request.RequestId,
                        error = new { issues = new[] { new Issue(exception.Message, "CS_TAU_RUNTIME", "runtime", "error") } },
                    });
                }
            }
            return 0;
        }
        finally
        {
            Console.SetOut(originalOutput);
        }
    }

    private static bool Dispatch(Request request, Arguments arguments)
    {
        switch (request.Method)
        {
            case "analyze":
            {
                ValidateEntryPath(request.Params, arguments.Workspace);
                var model = CompilationService.Compile(arguments.Workspace);
                Write(new
                {
                    protocolVersion = ProtocolVersion,
                    requestId = request.RequestId,
                    result = new
                    {
                        defaultParameters = model.Defaults,
                        jsonSchema = model.JsonSchema,
                        timings = model.Timings,
                    },
                });
                return false;
            }
            case "build":
            {
                ValidateEntryPath(request.Params, arguments.Workspace);
                var parameters = request.Params.GetProperty("parameters");
                var capture = ParseCaptureOptions(request.Params);
                var compiled = CompilationService.Compile(arguments.Workspace);
                var progressRoot = Path.Combine(arguments.Artifacts, $"progress-{Guid.NewGuid():N}");
                var sequence = 0;
                var streamScene = StreamScene(request.Params);
                var compute = ParseComputeCache(request.Params, arguments.Artifacts);
                Action<SceneProgress>? onProgress = streamScene
                    ? progress =>
                    {
                        var artifact = progress.Upserts.Count == 0
                            ? null
                            : MeshArtifactWriter.WriteSceneComponents(progressRoot, progress.Upserts);
                        Write(new
                        {
                            protocolVersion = ProtocolVersion,
                            type = "event",
                            requestId = request.RequestId,
                            sequence = ++sequence,
                            @event = new
                            {
                                kind = "scene",
                                mode = progress.Mode.ToString().ToLowerInvariant(),
                                operation = progress.Operation.ToString().ToLowerInvariant(),
                                baseSceneGeneration = progress.BaseSceneGeneration,
                                sceneGeneration = progress.SceneGeneration,
                                artifact,
                                removedComponentIds = progress.RemovedComponentIds,
                                presentation = progress.Presentation,
                                bookmark = progress.Bookmark,
                            },
                        });
                    }
                    : null;
                ModelExecutionResult execution;
                try
                {
                    execution = ModelRunner.Execute(
                        compiled,
                        arguments.Artifacts,
                        parameters,
                        capture,
                        onProgress,
                        compute);
                }
                catch
                {
                    CleanupProgressArtifacts(progressRoot);
                    throw;
                }
                var result = MeshArtifactWriter.Write(
                    arguments.Artifacts,
                    execution,
                    new WorkerDiagnostics(
                        new WorkerTimings(
                            compiled.Timings.CacheHit,
                            compiled.Timings.SourceRead,
                            compiled.Timings.Parse,
                            compiled.Timings.Analyze,
                            compiled.Timings.Emit,
                            execution.Timings.LibraryInitialize,
                            execution.Timings.EntryPointInvoke,
                            execution.Timings.MeshConstruction,
                            execution.Timings.MeshExtraction,
                            execution.Timings.NormalGeneration,
                            0,
                            execution.Timings.Unload),
                        new WorkerMetrics(
                            ManagedHeapBytesAfterCollection(),
                            execution.PicoGkNativeBytes,
                            Environment.WorkingSet)),
                    execution.ComputePublications);
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, result });
                return false;
            }
            case "shutdown":
                Write(new { protocolVersion = ProtocolVersion, requestId = request.RequestId, result = new { shutdown = true } });
                return true;
            default:
                throw new WorkerException(new Issue($"Unknown PicoGK worker method '{request.Method}'.", "CS_TAU_PROTOCOL", "validation", "error"));
        }
    }

    internal static SceneCaptureOptions ParseCaptureOptions(JsonElement parameters)
    {
        if (!parameters.TryGetProperty("capture", out var value)) return SceneCaptureOptions.Default;
        var modeValue = value.GetProperty("mode").GetString();
        var mode = modeValue switch
        {
            "explicit" => SceneCaptureMode.Explicit,
            "update" => SceneCaptureMode.Update,
            "operation" => SceneCaptureMode.Operation,
            _ => throw new WorkerException(new Issue(
                "PicoGK capture mode must be explicit, update, or operation.",
                "CS_TAU_CAPTURE_MODE",
                "validation",
                "error")),
        };
        var interval = value.TryGetProperty("minimumIntervalMilliseconds", out var intervalValue)
            ? intervalValue.GetInt32()
            : SceneCaptureOptions.Default.MinimumIntervalMilliseconds;
        var maximumPending = value.TryGetProperty("maximumPendingCommands", out var pendingValue)
            ? pendingValue.GetInt32()
            : SceneCaptureOptions.Default.MaximumPendingCommands;
        if (interval is < 0 or > 10_000 || maximumPending is < 1 or > 4_096)
        {
            throw new WorkerException(new Issue(
                "PicoGK capture bounds are outside the supported range.",
                "CS_TAU_CAPTURE_BOUNDS",
                "validation",
                "error"));
        }
        return new SceneCaptureOptions(mode, interval, maximumPending);
    }

    internal static ComputeMaterializationCache? ParseComputeCache(JsonElement parameters, string artifactRoot)
    {
        if (!parameters.TryGetProperty("compute", out var value)) return null;
        var request = value.Deserialize<ComputeRequest>(JsonOptions)
            ?? throw new WorkerException(new Issue("PicoGK compute request is invalid.", "CS_TAU_COMPUTE", "validation", "error"));
        if (request.ModelDigest is null || request.Prepared is null ||
            !request.ModelDigest.StartsWith("sha256:", StringComparison.Ordinal) || request.ModelDigest.Length != 71)
        {
            throw new WorkerException(new Issue("PicoGK compute model identity is invalid.", "CS_TAU_COMPUTE", "validation", "error"));
        }
        var root = Path.GetFullPath(artifactRoot) + Path.DirectorySeparatorChar;
        var prepared = new List<(string CacheKey, GeometrySnapshot Snapshot)>();
        foreach (var artifact in request.Prepared)
        {
            var path = Path.GetFullPath(artifact.ArtifactPath);
            if (!path.StartsWith(root, StringComparison.Ordinal)) continue;
            try
            {
                prepared.Add((artifact.CacheKey, MeshArtifactWriter.ReadComputeArtifact(artifact)));
            }
            catch (Exception error) when (error is IOException or InvalidDataException)
            {
                // Durable corruption is a cache miss; the model remains authoritative.
            }
        }
        return new ComputeMaterializationCache(prepared);
    }

    [ExcludeFromCodeCoverage]
    private static bool StreamScene(JsonElement parameters) =>
        parameters.TryGetProperty("streamScene", out var value) && value.GetBoolean();

    [ExcludeFromCodeCoverage]
    private static void CleanupProgressArtifacts(string path)
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
        }
        catch (IOException)
        {
            // The host may be consuming a frame concurrently; its session owns final orphan cleanup.
        }
        catch (UnauthorizedAccessException)
        {
            // Preserve the model error; the confined session cleanup retries deletion.
        }
    }

    internal static void ValidateEntryPath(JsonElement parameters, string workspace)
    {
        var entryPath = parameters.GetProperty("entryPath").GetString();
        if (string.IsNullOrWhiteSpace(entryPath)) throw new WorkerException(new Issue("PicoGK entryPath is required.", "CS_TAU_PATH", "validation", "error"));
        var root = Path.GetFullPath(workspace) + Path.DirectorySeparatorChar;
        var path = Path.GetFullPath(Path.Combine(root, entryPath));
        if (!path.StartsWith(root, StringComparison.Ordinal) || !File.Exists(path) || !path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase))
        {
            throw new WorkerException(new Issue("PicoGK entryPath must name a C# file inside the workspace.", "CS_TAU_PATH", "validation", "error"));
        }
    }

    internal static Arguments ParseArguments(string[] args)
    {
        var values = new Dictionary<string, string>(StringComparer.Ordinal);
        for (var index = 0; index < args.Length; index += 2)
        {
            if (index + 1 >= args.Length || !args[index].StartsWith("--", StringComparison.Ordinal)) throw new ArgumentException("Invalid PicoGK worker arguments.");
            values.Add(args[index][2..], args[index + 1]);
        }
        return new Arguments(
            Path.GetFullPath(values["workspace"]),
            Path.GetFullPath(values["artifacts"]),
            int.Parse(values["parent-pid"], System.Globalization.CultureInfo.InvariantCulture));
    }

    [ExcludeFromCodeCoverage]
    internal static Thread StartParentWatch(
        int parentPid,
        Action? terminate = null,
        Func<int, bool>? parentIsAlive = null,
        int pollMilliseconds = 1000)
    {
        terminate ??= () => Environment.Exit(0);
        parentIsAlive ??= ParentIsAlive;
        var thread = new Thread(() =>
        {
            while (parentIsAlive(parentPid))
            {
                Thread.Sleep(pollMilliseconds);
            }
            terminate();
        }) { IsBackground = true, Name = "Tau parent watchdog" };
        thread.Start();
        return thread;
    }

    internal static bool ParentIsAlive(int parentPid)
    {
        try
        {
            using var parent = Process.GetProcessById(parentPid);
            return !parent.HasExited;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    internal static bool DisposeLibrary(IDisposable? library, TextWriter error)
    {
        if (library is null) return false;
        try
        {
            library.Dispose();
            return false;
        }
        catch (Exception exception)
        {
            error.WriteLine($"PicoGK cleanup requires worker recycling: {exception.Message}");
            return true;
        }
    }

    private static void Write(object value)
    {
        lock (ProtocolGate)
        {
            protocol.WriteLine(JsonSerializer.Serialize(value, JsonOptions));
            protocol.Flush();
        }
    }

    internal sealed record Arguments(string Workspace, string Artifacts, int ParentPid);
}
