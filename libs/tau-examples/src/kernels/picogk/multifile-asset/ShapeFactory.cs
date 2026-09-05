using System.Globalization;
using System.IO;
using System.Numerics;
using PicoGK;

public static class ShapeFactory
{
    public static Voxels Create(float radiusMm)
    {
        var scale = float.Parse(File.ReadAllText("radius-scale.txt"), CultureInfo.InvariantCulture);
        return Voxels.voxSphere(Vector3.Zero, radiusMm * scale);
    }
}
