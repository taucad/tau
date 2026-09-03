using System.Reflection;
using System.Diagnostics;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;
using System.Runtime.ExceptionServices;
using System.Runtime.Loader;
using System.Text.Json;
using PicoGK;
using Tau.PicoGK;

namespace Tau.PicoGK.Worker;

internal sealed record ExtractedComponent(string Name, string Color, float[] Positions, float[] Normals, uint[] Indices);
internal sealed record ModelTimings(
    double ModelInvoke,
    double MeshConstruction,
    double MeshExtraction,
    double NormalGeneration,
    double Unload);
internal sealed record ModelExecutionResult(
    IReadOnlyList<ExtractedComponent> Components,
    bool RecycleAfterResponse,
    ModelTimings Timings);

internal static class ModelRunner
{
    internal static ModelExecutionResult Execute(
        CompiledModel compiled,
        IReadOnlyDictionary<string, object?> values)
    {
        var (components, context, modelInvoke, meshConstruction, meshExtraction, normalGeneration) = LoadBuildAndExtract(compiled, values);
        var unload = Stopwatch.StartNew();
        for (var attempt = 0; attempt < 8 && context.IsAlive; attempt++)
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            GC.Collect();
        }
        unload.Stop();
        return new ModelExecutionResult(
            components,
            context.IsAlive,
            new ModelTimings(
                modelInvoke,
                meshConstruction,
                meshExtraction,
                normalGeneration,
                unload.Elapsed.TotalMilliseconds));
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static (IReadOnlyList<ExtractedComponent>, WeakReference, double, double, double, double) LoadBuildAndExtract(
        CompiledModel compiled,
        IReadOnlyDictionary<string, object?> values)
    {
        var context = new AssemblyLoadContext($"TauModel_{Guid.NewGuid():N}", isCollectible: true);
        IReadOnlyList<ExtractedComponent> components;
        var modelInvoke = 0d;
        var meshConstruction = 0d;
        var meshExtraction = 0d;
        var normalGeneration = 0d;
        try
        {
            using var assemblyStream = new MemoryStream(compiled.Assembly, writable: false);
            using var pdbStream = new MemoryStream(compiled.Pdb, writable: false);
            var assembly = context.LoadFromStream(assemblyStream, pdbStream);
            var parameterType = assembly.GetType("Params", throwOnError: true)!;
            var parameterObject = Activator.CreateInstance(parameterType)!;
            foreach (var (name, value) in values)
            {
                var property = parameterType.GetProperty(name, BindingFlags.Public | BindingFlags.Instance)
                    ?? throw RuntimeError($"Compiled parameter '{name}' was not found.");
                property.SetValue(parameterObject, ConvertValue(value, property.PropertyType));
            }
            var modelType = assembly.GetType("Model", throwOnError: true)!;
            var build = modelType.GetMethod("Build", BindingFlags.Public | BindingFlags.Static, [parameterType])!;
            TauModel model = null!;
            var invoke = Stopwatch.StartNew();
            try
            {
                model = (TauModel?)build.Invoke(null, [parameterObject])
                    ?? throw RuntimeError("Model.Build returned null.");
            }
            catch (TargetInvocationException error) when (error.InnerException is not null) { Rethrow(error.InnerException); }
            finally
            {
                invoke.Stop();
                modelInvoke = invoke.Elapsed.TotalMilliseconds;
            }
            using (model)
            {
                var extracted = new List<ExtractedComponent>(model.Components.Count);
                foreach (var component in model.Components)
                {
                    var result = Extract(component);
                    extracted.Add(result.Component);
                    meshConstruction += result.MeshConstruction;
                    meshExtraction += result.MeshExtraction;
                    normalGeneration += result.NormalGeneration;
                }
                components = extracted;
            }
        }
        finally
        {
            context.Unload();
        }
        return (components, new WeakReference(context), modelInvoke, meshConstruction, meshExtraction, normalGeneration);
    }

    private static (ExtractedComponent Component, double MeshConstruction, double MeshExtraction, double NormalGeneration) Extract(TauComponent component)
    {
        if (component.Kind == TauGeometryKind.Voxels)
        {
            var construction = Stopwatch.StartNew();
            using var mesh = new Mesh((Voxels)component.Geometry);
            construction.Stop();
            var extracted = ExtractMesh(component.Name, component.Color, mesh);
            return (extracted.Component, construction.Elapsed.TotalMilliseconds, extracted.MeshExtraction, extracted.NormalGeneration);
        }
        var direct = ExtractMesh(component.Name, component.Color, (Mesh)component.Geometry);
        return (direct.Component, 0, direct.MeshExtraction, direct.NormalGeneration);
    }

    private static (ExtractedComponent Component, double MeshExtraction, double NormalGeneration) ExtractMesh(string name, string color, Mesh mesh)
    {
        var extraction = Stopwatch.StartNew();
        var positions = new float[checked(mesh.nVertexCount() * 3)];
        for (var index = 0; index < mesh.nVertexCount(); index++)
        {
            var vertex = mesh.vecVertexAt(index);
            positions[index * 3] = vertex.X;
            positions[index * 3 + 1] = vertex.Y;
            positions[index * 3 + 2] = vertex.Z;
        }
        var indices = new uint[checked(mesh.nTriangleCount() * 3)];
        for (var index = 0; index < mesh.nTriangleCount(); index++)
        {
            var triangle = mesh.oTriangleAt(index);
            indices[index * 3] = checked((uint)triangle.A);
            indices[index * 3 + 1] = checked((uint)triangle.B);
            indices[index * 3 + 2] = checked((uint)triangle.C);
        }
        extraction.Stop();
        var normals = Stopwatch.StartNew();
        var values = VertexNormals(positions, indices);
        normals.Stop();
        return (
            new ExtractedComponent(name, color, positions, values, indices),
            extraction.Elapsed.TotalMilliseconds,
            normals.Elapsed.TotalMilliseconds);
    }

    internal static float[] VertexNormals(float[] positions, uint[] indices)
    {
        var normals = new float[positions.Length];
        for (var index = 0; index < indices.Length; index += 3)
        {
            var a = checked((int)indices[index]) * 3;
            var b = checked((int)indices[index + 1]) * 3;
            var c = checked((int)indices[index + 2]) * 3;
            var ab = new System.Numerics.Vector3(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
            var ac = new System.Numerics.Vector3(positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]);
            var normal = System.Numerics.Vector3.Cross(ab, ac);
            foreach (var vertex in new[] { a, b, c })
            {
                normals[vertex] += normal.X;
                normals[vertex + 1] += normal.Y;
                normals[vertex + 2] += normal.Z;
            }
        }
        for (var index = 0; index < normals.Length; index += 3)
        {
            var normal = System.Numerics.Vector3.Normalize(new(normals[index], normals[index + 1], normals[index + 2]));
            if (!float.IsFinite(normal.X)) normal = System.Numerics.Vector3.UnitZ;
            normals[index] = normal.X;
            normals[index + 1] = normal.Y;
            normals[index + 2] = normal.Z;
        }
        return normals;
    }

    internal static IReadOnlyDictionary<string, object?> BindParameters(
        IReadOnlyList<ParameterDefinition> definitions,
        JsonElement supplied)
    {
        if (supplied.ValueKind != JsonValueKind.Object) throw RuntimeError("PicoGK parameters must be an object.");
        var definitionsByName = definitions.ToDictionary(definition => definition.Name, StringComparer.Ordinal);
        var values = definitions.ToDictionary(definition => definition.Name, DefaultValue, StringComparer.Ordinal);
        foreach (var property in supplied.EnumerateObject())
        {
            if (!definitionsByName.TryGetValue(property.Name, out var definition))
            {
                throw RuntimeError($"Unknown PicoGK parameter '{property.Name}'.");
            }
            var value = ReadJsonValue(property.Value, definition);
            if (definition.Minimum is not null && Convert.ToDouble(value) < definition.Minimum ||
                definition.Maximum is not null && Convert.ToDouble(value) > definition.Maximum)
            {
                throw RuntimeError($"PicoGK parameter '{property.Name}' is outside its Range.");
            }
            values[property.Name] = value;
        }
        var voxelSize = Convert.ToSingle(values["VoxelSizeMm"], System.Globalization.CultureInfo.InvariantCulture);
        if (!float.IsFinite(voxelSize) || voxelSize <= 0)
        {
            throw RuntimeError("PicoGK parameter 'VoxelSizeMm' must be positive and finite.");
        }
        return values;
    }

    private static object? DefaultValue(ParameterDefinition definition)
    {
        if (definition.EnumValues is null) return definition.Value;
        return ((Microsoft.CodeAnalysis.INamedTypeSymbol)definition.Type).GetMembers()
            .OfType<Microsoft.CodeAnalysis.IFieldSymbol>()
            .Single(field => Equals(field.ConstantValue, definition.Value)).Name;
    }

    private static object ReadJsonValue(JsonElement value, ParameterDefinition definition)
    {
        if (definition.EnumValues is not null)
        {
            var name = value.ValueKind == JsonValueKind.String ? value.GetString() : null;
            if (name is null || !definition.EnumValues.Contains(name, StringComparer.Ordinal)) throw RuntimeError($"Invalid enum value for '{definition.Name}'.");
            return name;
        }
        return definition.Type.SpecialType switch
        {
            Microsoft.CodeAnalysis.SpecialType.System_Boolean when value.ValueKind is JsonValueKind.True or JsonValueKind.False => value.GetBoolean(),
            Microsoft.CodeAnalysis.SpecialType.System_Int32 when value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var integer) => integer,
            Microsoft.CodeAnalysis.SpecialType.System_Single when value.ValueKind == JsonValueKind.Number && value.TryGetSingle(out var single) && float.IsFinite(single) => single,
            Microsoft.CodeAnalysis.SpecialType.System_Double when value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) && double.IsFinite(number) => number,
            Microsoft.CodeAnalysis.SpecialType.System_String when value.ValueKind == JsonValueKind.String => value.GetString()!,
            _ => throw RuntimeError($"Invalid value for PicoGK parameter '{definition.Name}'."),
        };
    }

    private static object? ConvertValue(object? value, Type target) => target.IsEnum
        ? Enum.Parse(target, (string)value!, ignoreCase: false)
        : Convert.ChangeType(value, target, System.Globalization.CultureInfo.InvariantCulture);

    private static WorkerException RuntimeError(string message) =>
        new(new Issue(message, "CS_TAU_RUNTIME", "runtime", "error"));

    [DoesNotReturn]
    private static void Rethrow(Exception error) => ExceptionDispatchInfo.Capture(error).Throw();
}
