# PicoGK — System (2)

4 top-level symbols. Signatures are verbatim csharp.

Math

E: double

PI: double

Tau: double

public static double Acos(double d)

public static double Acosh(double d)

public static double Asin(double d)

public static double Asinh(double d)

public static double Atan(double d)

public static double Atanh(double d)

public static double Atan2(double y, double x)

public static double Cbrt(double d)

public static double Ceiling(double a)
public static decimal Ceiling(decimal d)

public static double Cos(double d)

public static double Cosh(double value)

public static double Exp(double d)

public static double Floor(double d)
public static decimal Floor(decimal d)

public static double FusedMultiplyAdd(double x, double y, double z)

public static double Log(double d)
public static double Log(double a, double newBase)

public static double Log2(double x)

public static double Log10(double d)

public static double Pow(double x, double y)

public static double Sin(double a)

public static (double Sin, double Cos) SinCos(double x)

public static double Sinh(double value)

public static double Sqrt(double d)

public static double Tan(double a)

public static double Tanh(double value)

public static short Abs(short value)
public static int Abs(int value)
public static long Abs(long value)
public static nint Abs(nint value)
public static sbyte Abs(sbyte value)
public static decimal Abs(decimal value)
public static double Abs(double value)
public static float Abs(float value)

public static ulong BigMul(uint a, uint b)
public static long BigMul(int a, int b)
public static ulong BigMul(ulong a, ulong b, out ulong low)
public static long BigMul(long a, long b, out long low)
public static UInt128 BigMul(ulong a, ulong b)
public static Int128 BigMul(long a, long b)

public static double BitDecrement(double x)

public static double BitIncrement(double x)

public static double CopySign(double x, double y)

public static int DivRem(int a, int b, out int result)
public static long DivRem(long a, long b, out long result)
public static (sbyte Quotient, sbyte Remainder) DivRem(sbyte left, sbyte right)
public static (byte Quotient, byte Remainder) DivRem(byte left, byte right)
public static (short Quotient, short Remainder) DivRem(short left, short right)
public static (ushort Quotient, ushort Remainder) DivRem(ushort left, ushort right)
public static (int Quotient, int Remainder) DivRem(int left, int right)
public static (uint Quotient, uint Remainder) DivRem(uint left, uint right)
public static (long Quotient, long Remainder) DivRem(long left, long right)
public static (ulong Quotient, ulong Remainder) DivRem(ulong left, ulong right)
public static (nint Quotient, nint Remainder) DivRem(nint left, nint right)
public static (nuint Quotient, nuint Remainder) DivRem(nuint left, nuint right)

public static byte Clamp(byte value, byte min, byte max)
public static decimal Clamp(decimal value, decimal min, decimal max)
public static double Clamp(double value, double min, double max)
public static short Clamp(short value, short min, short max)
public static int Clamp(int value, int min, int max)
public static long Clamp(long value, long min, long max)
public static nint Clamp(nint value, nint min, nint max)
public static sbyte Clamp(sbyte value, sbyte min, sbyte max)
public static float Clamp(float value, float min, float max)
public static ushort Clamp(ushort value, ushort min, ushort max)
public static uint Clamp(uint value, uint min, uint max)
public static ulong Clamp(ulong value, ulong min, ulong max)
public static nuint Clamp(nuint value, nuint min, nuint max)

public static double IEEERemainder(double x, double y)

public static int ILogB(double x)

public static byte Max(byte val1, byte val2)
public static decimal Max(decimal val1, decimal val2)
public static double Max(double val1, double val2)
public static short Max(short val1, short val2)
public static int Max(int val1, int val2)
public static long Max(long val1, long val2)
public static nint Max(nint val1, nint val2)
public static sbyte Max(sbyte val1, sbyte val2)
public static float Max(float val1, float val2)
public static ushort Max(ushort val1, ushort val2)
public static uint Max(uint val1, uint val2)
public static ulong Max(ulong val1, ulong val2)
public static nuint Max(nuint val1, nuint val2)

public static double MaxMagnitude(double x, double y)

public static byte Min(byte val1, byte val2)
public static decimal Min(decimal val1, decimal val2)
public static double Min(double val1, double val2)
public static short Min(short val1, short val2)
public static int Min(int val1, int val2)
public static long Min(long val1, long val2)
public static nint Min(nint val1, nint val2)
public static sbyte Min(sbyte val1, sbyte val2)
public static float Min(float val1, float val2)
public static ushort Min(ushort val1, ushort val2)
public static uint Min(uint val1, uint val2)
public static ulong Min(ulong val1, ulong val2)
public static nuint Min(nuint val1, nuint val2)

public static double MinMagnitude(double x, double y)

public static double ReciprocalEstimate(double d)

public static double ReciprocalSqrtEstimate(double d)

public static decimal Round(decimal d)
public static decimal Round(decimal d, int decimals)
public static decimal Round(decimal d, MidpointRounding mode)
public static decimal Round(decimal d, int decimals, MidpointRounding mode)
public static double Round(double a)
public static double Round(double value, int digits)
public static double Round(double value, MidpointRounding mode)
public static double Round(double value, int digits, MidpointRounding mode)

public static int Sign(decimal value)
public static int Sign(double value)
public static int Sign(short value)
public static int Sign(int value)
public static int Sign(long value)
public static int Sign(nint value)
public static int Sign(sbyte value)
public static int Sign(float value)

public static decimal Truncate(decimal d)
public static double Truncate(double d)

public static double ScaleB(double x, int n)

MathF

E: float

PI: float

Tau: float

public static float Acos(float x)

public static float Acosh(float x)

public static float Asin(float x)

public static float Asinh(float x)

public static float Atan(float x)

public static float Atanh(float x)

public static float Atan2(float y, float x)

public static float Cbrt(float x)

public static float Ceiling(float x)

public static float Cos(float x)

public static float Cosh(float x)

public static float Exp(float x)

public static float Floor(float x)

public static float FusedMultiplyAdd(float x, float y, float z)

public static float Log(float x)
public static float Log(float x, float y)

public static float Log2(float x)

public static float Log10(float x)

public static float Pow(float x, float y)

public static float Sin(float x)

public static (float Sin, float Cos) SinCos(float x)

public static float Sinh(float x)

public static float Sqrt(float x)

public static float Tan(float x)

public static float Tanh(float x)

public static float Abs(float x)

public static float BitDecrement(float x)

public static float BitIncrement(float x)

public static float CopySign(float x, float y)

public static float IEEERemainder(float x, float y)

public static int ILogB(float x)

public static float Max(float x, float y)

public static float MaxMagnitude(float x, float y)

public static float Min(float x, float y)

public static float MinMagnitude(float x, float y)

public static float ReciprocalEstimate(float x)

public static float ReciprocalSqrtEstimate(float x)

public static float Round(float x)
public static float Round(float x, int digits)
public static float Round(float x, MidpointRounding mode)
public static float Round(float x, int digits, MidpointRounding mode)

public static int Sign(float x)

public static float Truncate(float x)

public static float ScaleB(float x, int n)

Random

Shared: Random

public Random()
public Random(int Seed)

public virtual int Next()
public virtual int Next(int maxValue)
public virtual int Next(int minValue, int maxValue)

public virtual long NextInt64()
public virtual long NextInt64(long maxValue)
public virtual long NextInt64(long minValue, long maxValue)

public virtual float NextSingle()

public virtual double NextDouble()

public virtual void NextBytes(byte[] buffer)
public virtual void NextBytes(Span<byte> buffer)

public void GetItems<T>(ReadOnlySpan<T> choices, Span<T> destination)
public T[] GetItems<T>(T[] choices, int length)
public T[] GetItems<T>(ReadOnlySpan<T> choices, int length)

public void Shuffle<T>(T[] values)
public void Shuffle<T>(Span<T> values)

public string GetString(ReadOnlySpan<char> choices, int length)

public string GetHexString(int stringLength, bool lowercase = false)
public void GetHexString(Span<char> destination, bool lowercase = false)

protected virtual double Sample()

String

Empty: string

this[]: char

Length: int

public static string Intern(string str)

public static string? IsInterned(string str)

public static int Compare(string? strA, string? strB)
public static int Compare(string? strA, string? strB, bool ignoreCase)
public static int Compare(string? strA, string? strB, StringComparison comparisonType)
public static int Compare(string? strA, string? strB, CultureInfo? culture, CompareOptions options)
public static int Compare(string? strA, string? strB, bool ignoreCase, CultureInfo? culture)
public static int Compare(string? strA, int indexA, string? strB, int indexB, int length)
public static int Compare(string? strA, int indexA, string? strB, int indexB, int length, bool ignoreCase)
public static int Compare(string? strA, int indexA, string? strB, int indexB, int length, bool ignoreCase, CultureInfo? culture)
public static int Compare(string? strA, int indexA, string? strB, int indexB, int length, CultureInfo? culture, CompareOptions options)
public static int Compare(string? strA, int indexA, string? strB, int indexB, int length, StringComparison comparisonType)

public static int CompareOrdinal(string? strA, string? strB)
public static int CompareOrdinal(string? strA, int indexA, string? strB, int indexB, int length)

public int CompareTo(object? value)
public int CompareTo(string? strB)

public bool EndsWith(string value)
public bool EndsWith(string value, StringComparison comparisonType)
public bool EndsWith(string value, bool ignoreCase, CultureInfo? culture)
public bool EndsWith(char value)

public override bool Equals(object? obj)
public bool Equals(string? value)
public bool Equals(string? value, StringComparison comparisonType)
public static bool Equals(string? a, string? b)
public static bool Equals(string? a, string? b, StringComparison comparisonType)

public static bool operator ==(string? a, string? b)

public static bool operator !=(string? a, string? b)

public override int GetHashCode()
public int GetHashCode(StringComparison comparisonType)
public static int GetHashCode(ReadOnlySpan<char> value)
public static int GetHashCode(ReadOnlySpan<char> value, StringComparison comparisonType)

public bool StartsWith(string value)
public bool StartsWith(string value, StringComparison comparisonType)
public bool StartsWith(string value, bool ignoreCase, CultureInfo? culture)
public bool StartsWith(char value)

public String(char[]? value)
public String(char[] value, int startIndex, int length)
public String(char* value)
public String(char* value, int startIndex, int length)
public String(sbyte* value)
public String(sbyte* value, int startIndex, int length)
public String(sbyte\* value, int startIndex, int length, Encoding enc)
public String(char c, int count)
public String(ReadOnlySpan<char> value)

public static string Create<TState>(int length, TState state, SpanAction<char, TState> action)
public static string Create(IFormatProvider? provider, ref DefaultInterpolatedStringHandler handler)
public static string Create(IFormatProvider? provider, Span<char> initialBuffer, ref DefaultInterpolatedStringHandler handler)

public static implicit operator ReadOnlySpan<char>(string? value)

public object Clone()

// DEPRECATED: This API should not be used to create mutable strings. See https://go.microsoft.com/fwlink/?linkid=2084035 for alternatives.
public static string Copy(string str)

public void CopyTo(int sourceIndex, char[] destination, int destinationIndex, int count)
public void CopyTo(Span<char> destination)

public bool TryCopyTo(Span<char> destination)

public char[] ToCharArray()
public char[] ToCharArray(int startIndex, int length)

public static bool IsNullOrEmpty(string? value)

public static bool IsNullOrWhiteSpace(string? value)

public ref readonly char GetPinnableReference()

public override string ToString()
public string ToString(IFormatProvider? provider)

public CharEnumerator GetEnumerator()

public StringRuneEnumerator EnumerateRunes()

public TypeCode GetTypeCode()

public bool IsNormalized()
public bool IsNormalized(NormalizationForm normalizationForm)

public string Normalize()
public string Normalize(NormalizationForm normalizationForm)

public static string Concat(object? arg0)
public static string Concat(object? arg0, object? arg1)
public static string Concat(object? arg0, object? arg1, object? arg2)
public static string Concat(params object?[] args)
public static string Concat(params ReadOnlySpan<object?> args)
public static string Concat<T>(IEnumerable<T> values)
public static string Concat(IEnumerable<string?> values)
public static string Concat(string? str0, string? str1)
public static string Concat(string? str0, string? str1, string? str2)
public static string Concat(string? str0, string? str1, string? str2, string? str3)
public static string Concat(ReadOnlySpan<char> str0, ReadOnlySpan<char> str1)
public static string Concat(ReadOnlySpan<char> str0, ReadOnlySpan<char> str1, ReadOnlySpan<char> str2)
public static string Concat(ReadOnlySpan<char> str0, ReadOnlySpan<char> str1, ReadOnlySpan<char> str2, ReadOnlySpan<char> str3)
public static string Concat(params string?[] values)
public static string Concat(params ReadOnlySpan<string?> values)

public static string Format(string format, object? arg0)
public static string Format(string format, object? arg0, object? arg1)
public static string Format(string format, object? arg0, object? arg1, object? arg2)
public static string Format(string format, params object?[] args)
public static string Format(string format, params ReadOnlySpan<object?> args)
public static string Format(IFormatProvider? provider, string format, object? arg0)
public static string Format(IFormatProvider? provider, string format, object? arg0, object? arg1)
public static string Format(IFormatProvider? provider, string format, object? arg0, object? arg1, object? arg2)
public static string Format(IFormatProvider? provider, string format, params object?[] args)
public static string Format(IFormatProvider? provider, string format, params ReadOnlySpan<object?> args)
public static string Format<TArg0>(IFormatProvider? provider, CompositeFormat format, TArg0 arg0)
public static string Format<TArg0, TArg1>(IFormatProvider? provider, CompositeFormat format, TArg0 arg0, TArg1 arg1)
public static string Format<TArg0, TArg1, TArg2>(IFormatProvider? provider, CompositeFormat format, TArg0 arg0, TArg1 arg1, TArg2 arg2)
public static string Format(IFormatProvider? provider, CompositeFormat format, params object?[] args)
public static string Format(IFormatProvider? provider, CompositeFormat format, params ReadOnlySpan<object?> args)

public string Insert(int startIndex, string value)

public static string Join(char separator, params string?[] value)
public static string Join(char separator, params ReadOnlySpan<string?> value)
public static string Join(string? separator, params string?[] value)
public static string Join(string? separator, params ReadOnlySpan<string?> value)
public static string Join(char separator, string?[] value, int startIndex, int count)
public static string Join(string? separator, string?[] value, int startIndex, int count)
public static string Join(string? separator, IEnumerable<string?> values)
public static string Join(char separator, params object?[] values)
public static string Join(char separator, params ReadOnlySpan<object?> values)
public static string Join(string? separator, params object?[] values)
public static string Join(string? separator, params ReadOnlySpan<object?> values)
public static string Join<T>(char separator, IEnumerable<T> values)
public static string Join<T>(string? separator, IEnumerable<T> values)

public string PadLeft(int totalWidth)
public string PadLeft(int totalWidth, char paddingChar)

public string PadRight(int totalWidth)
public string PadRight(int totalWidth, char paddingChar)

public string Remove(int startIndex, int count)
public string Remove(int startIndex)

public string Replace(string oldValue, string? newValue, bool ignoreCase, CultureInfo? culture)
public string Replace(string oldValue, string? newValue, StringComparison comparisonType)
public string Replace(char oldChar, char newChar)
public string Replace(string oldValue, string? newValue)

public string ReplaceLineEndings()
public string ReplaceLineEndings(string replacementText)

public string[] Split(char separator, StringSplitOptions options = None)
public string[] Split(char separator, int count, StringSplitOptions options = None)
public string[] Split(params char[]? separator)
public string[] Split(params ReadOnlySpan<char> separator)
public string[] Split(char[]? separator, int count)
public string[] Split(char[]? separator, StringSplitOptions options)
public string[] Split(char[]? separator, int count, StringSplitOptions options)
public string[] Split(string? separator, StringSplitOptions options = None)
public string[] Split(string? separator, int count, StringSplitOptions options = None)
public string[] Split(string[]? separator, StringSplitOptions options)
public string[] Split(string[]? separator, int count, StringSplitOptions options)

public string Substring(int startIndex)
public string Substring(int startIndex, int length)

public string ToLower()
public string ToLower(CultureInfo? culture)

public string ToLowerInvariant()

public string ToUpper()
public string ToUpper(CultureInfo? culture)

public string ToUpperInvariant()

public string Trim()
public string Trim(char trimChar)
public string Trim(params char[]? trimChars)
public string Trim(params ReadOnlySpan<char> trimChars)

public string TrimStart()
public string TrimStart(char trimChar)
public string TrimStart(params char[]? trimChars)
public string TrimStart(params ReadOnlySpan<char> trimChars)

public string TrimEnd()
public string TrimEnd(char trimChar)
public string TrimEnd(params char[]? trimChars)
public string TrimEnd(params ReadOnlySpan<char> trimChars)

public bool Contains(string value)
public bool Contains(string value, StringComparison comparisonType)
public bool Contains(char value)
public bool Contains(char value, StringComparison comparisonType)

public int IndexOf(char value)
public int IndexOf(char value, int startIndex)
public int IndexOf(char value, StringComparison comparisonType)
public int IndexOf(char value, int startIndex, int count)
public int IndexOf(string value)
public int IndexOf(string value, int startIndex)
public int IndexOf(string value, int startIndex, int count)
public int IndexOf(string value, StringComparison comparisonType)
public int IndexOf(string value, int startIndex, StringComparison comparisonType)
public int IndexOf(string value, int startIndex, int count, StringComparison comparisonType)

public int IndexOfAny(char[] anyOf)
public int IndexOfAny(char[] anyOf, int startIndex)
public int IndexOfAny(char[] anyOf, int startIndex, int count)

public int LastIndexOf(char value)
public int LastIndexOf(char value, int startIndex)
public int LastIndexOf(char value, int startIndex, int count)
public int LastIndexOf(string value)
public int LastIndexOf(string value, int startIndex)
public int LastIndexOf(string value, int startIndex, int count)
public int LastIndexOf(string value, StringComparison comparisonType)
public int LastIndexOf(string value, int startIndex, StringComparison comparisonType)
public int LastIndexOf(string value, int startIndex, int count, StringComparison comparisonType)

public int LastIndexOfAny(char[] anyOf)
public int LastIndexOfAny(char[] anyOf, int startIndex)
public int LastIndexOfAny(char[] anyOf, int startIndex, int count)
