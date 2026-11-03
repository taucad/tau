#if PICOGK_BROWSER
using System.Buffers.Binary;
using PicoGK;

namespace Tau.PicoGK.Worker;

// Synchronous admission before any browser decoder allocation. Full raster/frame validation
// follows at artifact admission; this header check alone never publishes an image.
internal static class BrowserImageHeader
{
    internal static MaterialImageFormat Inspect(byte[] bytes, string path)
    {
        var data = bytes.AsSpan();
        MaterialImageFormat format;
        long width;
        long height;
        if (data.Length >= 33 && data.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) &&
            BinaryPrimitives.ReadUInt32BigEndian(data[8..]) == 13 && data.Slice(12, 4).SequenceEqual("IHDR"u8))
        {
            format = MaterialImageFormat.Png;
            width = BinaryPrimitives.ReadUInt32BigEndian(data[16..]);
            height = BinaryPrimitives.ReadUInt32BigEndian(data[20..]);
            if (!data.EndsWith(new byte[] { 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130 }))
                throw Invalid(path);
        }
        else if (data.Length >= 4 && data.StartsWith(new byte[] { 255, 216, 255 }) &&
            data.EndsWith(new byte[] { 255, 217 }))
        {
            format = MaterialImageFormat.Jpeg;
            (width, height) = JpegDimensions(data, path);
        }
        else if (data.Length >= 25 && data[..4].SequenceEqual("RIFF"u8) && data.Slice(8, 4).SequenceEqual("WEBP"u8) &&
            (ulong)BinaryPrimitives.ReadUInt32LittleEndian(data[4..]) + 8 == (ulong)data.Length)
        {
            format = MaterialImageFormat.WebP;
            var kind = data.Slice(12, 4);
            var length = BinaryPrimitives.ReadUInt32LittleEndian(data[16..]);
            if ((ulong)length + 20 > (ulong)data.Length) throw Invalid(path);
            if (kind.SequenceEqual("VP8X"u8) && length == 10 && data.Length >= 30)
            {
                width = UInt24(data[24..]) + 1L;
                height = UInt24(data[27..]) + 1L;
            }
            else if (kind.SequenceEqual("VP8L"u8) && length >= 5 && data[20] == 0x2f)
            {
                var packed = BinaryPrimitives.ReadUInt32LittleEndian(data[21..]);
                width = (packed & 0x3fff) + 1L;
                height = ((packed >> 14) & 0x3fff) + 1L;
            }
            else if (kind.SequenceEqual("VP8 "u8) && length >= 10 && data.Length >= 30 &&
                data.Slice(23, 3).SequenceEqual(new byte[] { 0x9d, 0x01, 0x2a }))
            {
                width = BinaryPrimitives.ReadUInt16LittleEndian(data[26..]) & 0x3fff;
                height = BinaryPrimitives.ReadUInt16LittleEndian(data[28..]) & 0x3fff;
            }
            else throw Invalid(path);
        }
        else throw Invalid(path);

        if (width <= 0 || height <= 0) throw Invalid(path);
        if (width > MaterialCapture.MaximumDecodedImageBytes / 4 / height)
            throw MaterialCapture.Invalid(path + ".Data", "decoded RGBA image must fit within 256 MiB");
        return format;
    }

    private static int UInt24(ReadOnlySpan<byte> data) => data[0] | data[1] << 8 | data[2] << 16;

    private static (long Width, long Height) JpegDimensions(ReadOnlySpan<byte> data, string path)
    {
        var offset = 2;
        while (offset < data.Length)
        {
            if (data[offset++] != 0xff) throw Invalid(path);
            while (offset < data.Length && data[offset] == 0xff) offset++;
            if (offset >= data.Length) break;
            var marker = data[offset++];
            if (marker is 0xda or 0xd9) break;
            if (marker is 0x01 or >= 0xd0 and <= 0xd7) continue;
            if (offset + 2 > data.Length) break;
            var length = BinaryPrimitives.ReadUInt16BigEndian(data[offset..]);
            if (length < 2 || offset + length > data.Length) break;
            if (marker is >= 0xc0 and <= 0xcf && marker is not (0xc4 or 0xc8 or 0xcc))
            {
                if (length < 8) break;
                return (BinaryPrimitives.ReadUInt16BigEndian(data[(offset + 5)..]),
                    BinaryPrimitives.ReadUInt16BigEndian(data[(offset + 3)..]));
            }
            offset += length;
        }
        throw Invalid(path);
    }

    private static WorkerException Invalid(string path) =>
        MaterialCapture.Invalid(path + ".Data", "must contain a complete supported PNG, JPEG or WebP image");
}
#endif
