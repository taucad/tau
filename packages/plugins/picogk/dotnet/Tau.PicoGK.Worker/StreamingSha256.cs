using System.Buffers;
using System.Buffers.Binary;
using System.Numerics;
#if !PICOGK_BROWSER
using System.Security.Cryptography;
#endif

namespace Tau.PicoGK.Worker;

/// <summary>
/// SHA-256 over appended spans, in constant memory on both runtimes.
/// </summary>
/// <remarks>
/// The browser's <c>System.Security.Cryptography</c> SHA-256 (<c>SHAManagedHashProvider</c>) is not
/// incremental: <c>IncrementalHash</c> and <c>SHA256.HashData(Stream)</c> append every byte to a
/// <c>MemoryStream</c> that starts at 1000 bytes and doubles, and hash it only at the end. A 512 MiB
/// file therefore held a 1000 MiB buffer and its 500 MiB predecessor at once, in a wasm heap that
/// never shrinks. Desktop keeps the platform's own incremental hash.
/// </remarks>
internal sealed class StreamingSha256 : IDisposable
{
    private const int ChunkBytes = 1 << 20;
#if PICOGK_BROWSER
    private readonly ManagedSha256 hash = new();
#else
    private readonly IncrementalHash hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
#endif

    internal void AppendData(ReadOnlySpan<byte> data) => hash.AppendData(data);

    internal byte[] GetHashAndReset() => hash.GetHashAndReset();

    /// <summary>The lowercase hex digest of a file, read once in bounded chunks.</summary>
    internal static string HexOf(string path) => Transfer(path, null);

    /// <summary>
    /// Copies a file to a new <paramref name="target"/> and returns the lowercase hex digest of exactly
    /// the bytes written, in one bounded read of the source.
    /// </summary>
    internal static string CopyAndHex(string source, string target)
    {
        using var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None, bufferSize: 0);
        return Transfer(source, output);
    }

    private static string Transfer(string path, Stream? output)
    {
        using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, bufferSize: 0);
        using var digest = new StreamingSha256();
        var buffer = ArrayPool<byte>.Shared.Rent(ChunkBytes);
        try
        {
            int read;
            while ((read = input.Read(buffer, 0, ChunkBytes)) > 0)
            {
                output?.Write(buffer, 0, read);
                digest.AppendData(buffer.AsSpan(0, read));
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
        return Convert.ToHexStringLower(digest.GetHashAndReset());
    }

    public void Dispose()
    {
#if !PICOGK_BROWSER
        hash.Dispose();
#endif
    }
}

/// <summary>FIPS 180-4 SHA-256 with a single 64-byte block buffer.</summary>
internal sealed class ManagedSha256
{
    private static readonly uint[] RoundConstants =
    [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    private readonly uint[] state = new uint[8];
    private readonly uint[] schedule = new uint[64];
    private readonly byte[] block = new byte[64];
    private int buffered;
    private ulong length;

    internal ManagedSha256() => Reset();

    internal void AppendData(ReadOnlySpan<byte> data)
    {
        length += (ulong)data.Length;
        if (buffered > 0)
        {
            var take = Math.Min(block.Length - buffered, data.Length);
            data[..take].CopyTo(block.AsSpan(buffered));
            buffered += take;
            data = data[take..];
            if (buffered < block.Length) return;
            Compress(block);
            buffered = 0;
        }
        while (data.Length >= block.Length)
        {
            Compress(data[..block.Length]);
            data = data[block.Length..];
        }
        data.CopyTo(block);
        buffered = data.Length;
    }

    internal byte[] GetHashAndReset()
    {
        var bits = length * 8;
        // 0x80, zeros to 56 mod 64, then the big-endian bit length: one or two final blocks.
        Span<byte> padding = stackalloc byte[72];
        padding.Clear();
        var zeros = (buffered < 56 ? 56 : 120) - buffered;
        padding[0] = 0x80;
        BinaryPrimitives.WriteUInt64BigEndian(padding[zeros..], bits);
        AppendData(padding[..(zeros + 8)]);
        var digest = new byte[32];
        for (var word = 0; word < state.Length; word++)
            BinaryPrimitives.WriteUInt32BigEndian(digest.AsSpan(word * 4), state[word]);
        Reset();
        return digest;
    }

    private void Reset()
    {
        state[0] = 0x6a09e667; state[1] = 0xbb67ae85; state[2] = 0x3c6ef372; state[3] = 0xa54ff53a;
        state[4] = 0x510e527f; state[5] = 0x9b05688c; state[6] = 0x1f83d9ab; state[7] = 0x5be0cd19;
        buffered = 0;
        length = 0;
    }

    private void Compress(ReadOnlySpan<byte> chunk)
    {
        var w = schedule;
        for (var index = 0; index < 16; index++) w[index] = BinaryPrimitives.ReadUInt32BigEndian(chunk[(index * 4)..]);
        for (var index = 16; index < 64; index++)
        {
            var x = w[index - 15];
            var y = w[index - 2];
            var s0 = BitOperations.RotateRight(x, 7) ^ BitOperations.RotateRight(x, 18) ^ (x >> 3);
            var s1 = BitOperations.RotateRight(y, 17) ^ BitOperations.RotateRight(y, 19) ^ (y >> 10);
            w[index] = w[index - 16] + s0 + w[index - 7] + s1;
        }
        uint a = state[0], b = state[1], c = state[2], d = state[3], e = state[4], f = state[5], g = state[6], h = state[7];
        for (var index = 0; index < 64; index++)
        {
            var t1 = h + (BitOperations.RotateRight(e, 6) ^ BitOperations.RotateRight(e, 11) ^ BitOperations.RotateRight(e, 25))
                + ((e & f) ^ (~e & g)) + RoundConstants[index] + w[index];
            var t2 = (BitOperations.RotateRight(a, 2) ^ BitOperations.RotateRight(a, 13) ^ BitOperations.RotateRight(a, 22))
                + ((a & b) ^ (a & c) ^ (b & c));
            h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
        }
        state[0] += a; state[1] += b; state[2] += c; state[3] += d;
        state[4] += e; state[5] += f; state[6] += g; state[7] += h;
    }
}
