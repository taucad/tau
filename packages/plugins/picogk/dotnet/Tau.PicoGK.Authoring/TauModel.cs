using PicoGK;

namespace Tau.PicoGK;

/// <summary>One named, colored PicoGK geometry component returned to Tau.</summary>
public sealed class TauComponent : IDisposable
{
    private bool claimed;
    private bool disposed;

    internal TauComponent(string name, IDisposable geometry, string color, TauGeometryKind kind)
    {
        Name = string.IsNullOrWhiteSpace(name)
            ? throw new ArgumentException("A Tau component requires a non-empty name.", nameof(name))
            : name.Trim();
        Color = NormalizeColor(color);
        Geometry = geometry ?? throw new ArgumentNullException(nameof(geometry));
        Kind = kind;
    }

    /// <summary>Create a component that owns a voxel field.</summary>
    public static TauComponent FromVoxels(string name, Voxels voxels, string color = "#4f7dd9") =>
        new(name, voxels, color, TauGeometryKind.Voxels);

    /// <summary>Create a component that owns a triangle mesh.</summary>
    public static TauComponent FromMesh(string name, Mesh mesh, string color = "#4f7dd9") =>
        new(name, mesh, color, TauGeometryKind.Mesh);

    /// <summary>Semantic component name.</summary>
    public string Name { get; }

    /// <summary>Authored sRGB color in normalized #RRGGBBAA form.</summary>
    public string Color { get; }

    internal IDisposable Geometry { get; }

    internal TauGeometryKind Kind { get; }

    internal void Claim()
    {
        if (claimed)
        {
            throw new InvalidOperationException($"Tau component '{Name}' is already owned by a model.");
        }
        claimed = true;
    }

    /// <inheritdoc />
    public void Dispose()
    {
        if (disposed)
        {
            return;
        }
        disposed = true;
        Geometry.Dispose();
    }

    private static string NormalizeColor(string color)
    {
        ArgumentNullException.ThrowIfNull(color);
        var value = color.StartsWith('#') ? color[1..] : color;
        if ((value.Length != 6 && value.Length != 8) || value.Any(character => !Uri.IsHexDigit(character)))
        {
            throw new ArgumentException("Tau component colors must be #RRGGBB or #RRGGBBAA.", nameof(color));
        }
        return $"#{value.ToLowerInvariant()}{(value.Length == 6 ? "ff" : string.Empty)}";
    }
}

/// <summary>Owned collection returned by the required Model.Build contract.</summary>
public sealed class TauModel : IDisposable
{
    private bool disposed;

    private TauModel(IReadOnlyList<TauComponent> components) => Components = components;

    /// <summary>Create a model and transfer ownership of every component to it.</summary>
    public static TauModel Create(params TauComponent[] components)
    {
        ArgumentNullException.ThrowIfNull(components);
        if (components.Length == 0)
        {
            throw new ArgumentException("TauModel requires at least one component.", nameof(components));
        }
        var names = new HashSet<string>(StringComparer.Ordinal);
        var geometry = new HashSet<IDisposable>(ReferenceEqualityComparer.Instance);
        foreach (var component in components)
        {
            ArgumentNullException.ThrowIfNull(component);
            if (!names.Add(component.Name))
            {
                throw new ArgumentException($"Tau component name '{component.Name}' is duplicated.", nameof(components));
            }
            if (!geometry.Add(component.Geometry))
            {
                throw new ArgumentException("Each Tau component must own distinct PicoGK geometry.", nameof(components));
            }
        }
        foreach (var component in components)
        {
            component.Claim();
        }
        return new TauModel(Array.AsReadOnly((TauComponent[])components.Clone()));
    }

    /// <summary>Components rendered and exported by Tau.</summary>
    public IReadOnlyList<TauComponent> Components { get; }

    /// <inheritdoc />
    public void Dispose()
    {
        if (disposed)
        {
            return;
        }
        disposed = true;
        foreach (var component in Components)
        {
            component.Dispose();
        }
    }
}

internal enum TauGeometryKind
{
    Voxels,
    Mesh,
}
