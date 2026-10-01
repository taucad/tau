# PicoGK — System (2)

4 top-level symbols. Signatures are verbatim csharp.

Math

  E: double

  PI: double

  Tau: double

  // System.Math.Acos (method)
  public static double Acos(double d)

  // System.Math.Acosh (method)
  public static double Acosh(double d)

  // System.Math.Asin (method)
  public static double Asin(double d)

  // System.Math.Asinh (method)
  public static double Asinh(double d)

  // System.Math.Atan (method)
  public static double Atan(double d)

  // System.Math.Atanh (method)
  public static double Atanh(double d)

  // System.Math.Atan2 (method)
  public static double Atan2(double y, double x)

  // System.Math.Cbrt (method)
  public static double Cbrt(double d)

  // System.Math.Ceiling (method)
  public static double Ceiling(double a)
  public static decimal Ceiling(decimal d)

  // System.Math.Cos (method)
  public static double Cos(double d)

  // System.Math.Cosh (method)
  public static double Cosh(double value)

  // System.Math.Exp (method)
  public static double Exp(double d)

  // System.Math.Floor (method)
  public static double Floor(double d)
  public static decimal Floor(decimal d)

  // System.Math.FusedMultiplyAdd (method)
  public static double FusedMultiplyAdd(double x, double y, double z)

  // System.Math.Log (method)
  public static double Log(double d)
  public static double Log(double a, double newBase)

  // System.Math.Log2 (method)
  public static double Log2(double x)

  // System.Math.Log10 (method)
  public static double Log10(double d)

  // System.Math.Pow (method)
  public static double Pow(double x, double y)

  // System.Math.Sin (method)
  public static double Sin(double a)

  // System.Math.SinCos (method)
  public static (double Sin, double Cos) SinCos(double x)

  // System.Math.Sinh (method)
  public static double Sinh(double value)

  // System.Math.Sqrt (method)
  public static double Sqrt(double d)

  // System.Math.Tan (method)
  public static double Tan(double a)

  // System.Math.Tanh (method)
  public static double Tanh(double value)

  // System.Math.Abs (method)
  public static short Abs(short value)
  public static int Abs(int value)
  public static long Abs(long value)
  public static nint Abs(nint value)
  public static sbyte Abs(sbyte value)
  public static decimal Abs(decimal value)
  public static double Abs(double value)
  public static float Abs(float value)

  // System.Math.BigMul (method)
  public static ulong BigMul(uint a, uint b)
  public static long BigMul(int a, int b)
  public static ulong BigMul(ulong a, ulong b, out ulong low)
  public static long BigMul(long a, long b, out long low)
  public static UInt128 BigMul(ulong a, ulong b)
  public static Int128 BigMul(long a, long b)

  // System.Math.BitDecrement (method)
  public static double BitDecrement(double x)

  // System.Math.BitIncrement (method)
  public static double BitIncrement(double x)

  // System.Math.CopySign (method)
  public static double CopySign(double x, double y)

  // System.Math.DivRem (method)
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

  // System.Math.Clamp (method)
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

  // System.Math.IEEERemainder (method)
  public static double IEEERemainder(double x, double y)

  // System.Math.ILogB (method)
  public static int ILogB(double x)

  // System.Math.Max (method)
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

  // System.Math.MaxMagnitude (method)
  public static double MaxMagnitude(double x, double y)

  // System.Math.Min (method)
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

  // System.Math.MinMagnitude (method)
  public static double MinMagnitude(double x, double y)

  // System.Math.ReciprocalEstimate (method)
  public static double ReciprocalEstimate(double d)

  // System.Math.ReciprocalSqrtEstimate (method)
  public static double ReciprocalSqrtEstimate(double d)

  // System.Math.Round (method)
  public static decimal Round(decimal d)
  public static decimal Round(decimal d, int decimals)
  public static decimal Round(decimal d, MidpointRounding mode)
  public static decimal Round(decimal d, int decimals, MidpointRounding mode)
  public static double Round(double a)
  public static double Round(double value, int digits)
  public static double Round(double value, MidpointRounding mode)
  public static double Round(double value, int digits, MidpointRounding mode)

  // System.Math.Sign (method)
  public static int Sign(decimal value)
  public static int Sign(double value)
  public static int Sign(short value)
  public static int Sign(int value)
  public static int Sign(long value)
  public static int Sign(nint value)
  public static int Sign(sbyte value)
  public static int Sign(float value)

  // System.Math.Truncate (method)
  public static decimal Truncate(decimal d)
  public static double Truncate(double d)

  // System.Math.ScaleB (method)
  public static double ScaleB(double x, int n)

MathF

  E: float

  PI: float

  Tau: float

  // System.MathF.Acos (method)
  public static float Acos(float x)

  // System.MathF.Acosh (method)
  public static float Acosh(float x)

  // System.MathF.Asin (method)
  public static float Asin(float x)

  // System.MathF.Asinh (method)
  public static float Asinh(float x)

  // System.MathF.Atan (method)
  public static float Atan(float x)

  // System.MathF.Atanh (method)
  public static float Atanh(float x)

  // System.MathF.Atan2 (method)
  public static float Atan2(float y, float x)

  // System.MathF.Cbrt (method)
  public static float Cbrt(float x)

  // System.MathF.Ceiling (method)
  public static float Ceiling(float x)

  // System.MathF.Cos (method)
  public static float Cos(float x)

  // System.MathF.Cosh (method)
  public static float Cosh(float x)

  // System.MathF.Exp (method)
  public static float Exp(float x)

  // System.MathF.Floor (method)
  public static float Floor(float x)

  // System.MathF.FusedMultiplyAdd (method)
  public static float FusedMultiplyAdd(float x, float y, float z)

  // System.MathF.Log (method)
  public static float Log(float x)
  public static float Log(float x, float y)

  // System.MathF.Log2 (method)
  public static float Log2(float x)

  // System.MathF.Log10 (method)
  public static float Log10(float x)

  // System.MathF.Pow (method)
  public static float Pow(float x, float y)

  // System.MathF.Sin (method)
  public static float Sin(float x)

  // System.MathF.SinCos (method)
  public static (float Sin, float Cos) SinCos(float x)

  // System.MathF.Sinh (method)
  public static float Sinh(float x)

  // System.MathF.Sqrt (method)
  public static float Sqrt(float x)

  // System.MathF.Tan (method)
  public static float Tan(float x)

  // System.MathF.Tanh (method)
  public static float Tanh(float x)

  // System.MathF.Abs (method)
  public static float Abs(float x)

  // System.MathF.BitDecrement (method)
  public static float BitDecrement(float x)

  // System.MathF.BitIncrement (method)
  public static float BitIncrement(float x)

  // System.MathF.CopySign (method)
  public static float CopySign(float x, float y)

  // System.MathF.IEEERemainder (method)
  public static float IEEERemainder(float x, float y)

  // System.MathF.ILogB (method)
  public static int ILogB(float x)

  // System.MathF.Max (method)
  public static float Max(float x, float y)

  // System.MathF.MaxMagnitude (method)
  public static float MaxMagnitude(float x, float y)

  // System.MathF.Min (method)
  public static float Min(float x, float y)

  // System.MathF.MinMagnitude (method)
  public static float MinMagnitude(float x, float y)

  // System.MathF.ReciprocalEstimate (method)
  public static float ReciprocalEstimate(float x)

  // System.MathF.ReciprocalSqrtEstimate (method)
  public static float ReciprocalSqrtEstimate(float x)

  // System.MathF.Round (method)
  public static float Round(float x)
  public static float Round(float x, int digits)
  public static float Round(float x, MidpointRounding mode)
  public static float Round(float x, int digits, MidpointRounding mode)

  // System.MathF.Sign (method)
  public static int Sign(float x)

  // System.MathF.Truncate (method)
  public static float Truncate(float x)

  // System.MathF.ScaleB (method)
  public static float ScaleB(float x, int n)

Random

  Shared: Random

  // System.Random.Random (constructor)
  public Random()
  public Random(int Seed)

  // System.Random.Next (method)
  public virtual int Next()
  public virtual int Next(int maxValue)
  public virtual int Next(int minValue, int maxValue)

  // System.Random.NextInt64 (method)
  public virtual long NextInt64()
  public virtual long NextInt64(long maxValue)
  public virtual long NextInt64(long minValue, long maxValue)

  // System.Random.NextSingle (method)
  public virtual float NextSingle()

  // System.Random.NextDouble (method)
  public virtual double NextDouble()

  // System.Random.NextBytes (method)
  public virtual void NextBytes(byte[] buffer)
  public virtual void NextBytes(Span<byte> buffer)

  // System.Random.GetItems (method)
  public void GetItems<T>(ReadOnlySpan<T> choices, Span<T> destination)
  public T[] GetItems<T>(T[] choices, int length)
  public T[] GetItems<T>(ReadOnlySpan<T> choices, int length)

  // System.Random.Shuffle (method)
  public void Shuffle<T>(T[] values)
  public void Shuffle<T>(Span<T> values)

  // System.Random.GetString (method)
  public string GetString(ReadOnlySpan<char> choices, int length)

  // System.Random.GetHexString (method)
  public string GetHexString(int stringLength, bool lowercase = false)
  public void GetHexString(Span<char> destination, bool lowercase = false)

  // System.Random.Sample (method)
  protected virtual double Sample()

String

  Empty: string

  this[]: char

  Length: int

  // System.String.Intern (method)
  public static string Intern(string str)

  // System.String.IsInterned (method)
  public static string? IsInterned(string str)

  // System.String.Compare (method)
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

  // System.String.CompareOrdinal (method)
  public static int CompareOrdinal(string? strA, string? strB)
  public static int CompareOrdinal(string? strA, int indexA, string? strB, int indexB, int length)

  // System.String.CompareTo (method)
  public int CompareTo(object? value)
  public int CompareTo(string? strB)

  // System.String.EndsWith (method)
  public bool EndsWith(string value)
  public bool EndsWith(string value, StringComparison comparisonType)
  public bool EndsWith(string value, bool ignoreCase, CultureInfo? culture)
  public bool EndsWith(char value)

  // System.String.Equals (method)
  public override bool Equals(object? obj)
  public bool Equals(string? value)
  public bool Equals(string? value, StringComparison comparisonType)
  public static bool Equals(string? a, string? b)
  public static bool Equals(string? a, string? b, StringComparison comparisonType)

  // System.String.op_Equality (method)
  public static bool operator ==(string? a, string? b)

  // System.String.op_Inequality (method)
  public static bool operator !=(string? a, string? b)

  // System.String.GetHashCode (method)
  public override int GetHashCode()
  public int GetHashCode(StringComparison comparisonType)
  public static int GetHashCode(ReadOnlySpan<char> value)
  public static int GetHashCode(ReadOnlySpan<char> value, StringComparison comparisonType)

  // System.String.StartsWith (method)
  public bool StartsWith(string value)
  public bool StartsWith(string value, StringComparison comparisonType)
  public bool StartsWith(string value, bool ignoreCase, CultureInfo? culture)
  public bool StartsWith(char value)

  // System.String.String (constructor)
  public String(char[]? value)
  public String(char[] value, int startIndex, int length)
  public String(char* value)
  public String(char* value, int startIndex, int length)
  public String(sbyte* value)
  public String(sbyte* value, int startIndex, int length)
  public String(sbyte* value, int startIndex, int length, Encoding enc)
  public String(char c, int count)
  public String(ReadOnlySpan<char> value)

  // System.String.Create (method)
  public static string Create<TState>(int length, TState state, SpanAction<char, TState> action)
  public static string Create(IFormatProvider? provider, ref DefaultInterpolatedStringHandler handler)
  public static string Create(IFormatProvider? provider, Span<char> initialBuffer, ref DefaultInterpolatedStringHandler handler)

  // System.String.op_Implicit (method)
  public static implicit operator ReadOnlySpan<char>(string? value)

  // System.String.Clone (method)
  public object Clone()

  // DEPRECATED: This API should not be used to create mutable strings. See https://go.microsoft.com/fwlink/?linkid=2084035 for alternatives.
  // System.String.Copy (method)
  public static string Copy(string str)

  // System.String.CopyTo (method)
  public void CopyTo(int sourceIndex, char[] destination, int destinationIndex, int count)
  public void CopyTo(Span<char> destination)

  // System.String.TryCopyTo (method)
  public bool TryCopyTo(Span<char> destination)

  // System.String.ToCharArray (method)
  public char[] ToCharArray()
  public char[] ToCharArray(int startIndex, int length)

  // System.String.IsNullOrEmpty (method)
  public static bool IsNullOrEmpty(string? value)

  // System.String.IsNullOrWhiteSpace (method)
  public static bool IsNullOrWhiteSpace(string? value)

  // System.String.GetPinnableReference (method)
  public ref readonly char GetPinnableReference()

  // System.String.ToString (method)
  public override string ToString()
  public string ToString(IFormatProvider? provider)

  // System.String.GetEnumerator (method)
  public CharEnumerator GetEnumerator()

  // System.String.EnumerateRunes (method)
  public StringRuneEnumerator EnumerateRunes()

  // System.String.GetTypeCode (method)
  public TypeCode GetTypeCode()

  // System.String.IsNormalized (method)
  public bool IsNormalized()
  public bool IsNormalized(NormalizationForm normalizationForm)

  // System.String.Normalize (method)
  public string Normalize()
  public string Normalize(NormalizationForm normalizationForm)

  // System.String.Concat (method)
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

  // System.String.Format (method)
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

  // System.String.Insert (method)
  public string Insert(int startIndex, string value)

  // System.String.Join (method)
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

  // System.String.PadLeft (method)
  public string PadLeft(int totalWidth)
  public string PadLeft(int totalWidth, char paddingChar)

  // System.String.PadRight (method)
  public string PadRight(int totalWidth)
  public string PadRight(int totalWidth, char paddingChar)

  // System.String.Remove (method)
  public string Remove(int startIndex, int count)
  public string Remove(int startIndex)

  // System.String.Replace (method)
  public string Replace(string oldValue, string? newValue, bool ignoreCase, CultureInfo? culture)
  public string Replace(string oldValue, string? newValue, StringComparison comparisonType)
  public string Replace(char oldChar, char newChar)
  public string Replace(string oldValue, string? newValue)

  // System.String.ReplaceLineEndings (method)
  public string ReplaceLineEndings()
  public string ReplaceLineEndings(string replacementText)

  // System.String.Split (method)
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

  // System.String.Substring (method)
  public string Substring(int startIndex)
  public string Substring(int startIndex, int length)

  // System.String.ToLower (method)
  public string ToLower()
  public string ToLower(CultureInfo? culture)

  // System.String.ToLowerInvariant (method)
  public string ToLowerInvariant()

  // System.String.ToUpper (method)
  public string ToUpper()
  public string ToUpper(CultureInfo? culture)

  // System.String.ToUpperInvariant (method)
  public string ToUpperInvariant()

  // System.String.Trim (method)
  public string Trim()
  public string Trim(char trimChar)
  public string Trim(params char[]? trimChars)
  public string Trim(params ReadOnlySpan<char> trimChars)

  // System.String.TrimStart (method)
  public string TrimStart()
  public string TrimStart(char trimChar)
  public string TrimStart(params char[]? trimChars)
  public string TrimStart(params ReadOnlySpan<char> trimChars)

  // System.String.TrimEnd (method)
  public string TrimEnd()
  public string TrimEnd(char trimChar)
  public string TrimEnd(params char[]? trimChars)
  public string TrimEnd(params ReadOnlySpan<char> trimChars)

  // System.String.Contains (method)
  public bool Contains(string value)
  public bool Contains(string value, StringComparison comparisonType)
  public bool Contains(char value)
  public bool Contains(char value, StringComparison comparisonType)

  // System.String.IndexOf (method)
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

  // System.String.IndexOfAny (method)
  public int IndexOfAny(char[] anyOf)
  public int IndexOfAny(char[] anyOf, int startIndex)
  public int IndexOfAny(char[] anyOf, int startIndex, int count)

  // System.String.LastIndexOf (method)
  public int LastIndexOf(char value)
  public int LastIndexOf(char value, int startIndex)
  public int LastIndexOf(char value, int startIndex, int count)
  public int LastIndexOf(string value)
  public int LastIndexOf(string value, int startIndex)
  public int LastIndexOf(string value, int startIndex, int count)
  public int LastIndexOf(string value, StringComparison comparisonType)
  public int LastIndexOf(string value, int startIndex, StringComparison comparisonType)
  public int LastIndexOf(string value, int startIndex, int count, StringComparison comparisonType)

  // System.String.LastIndexOfAny (method)
  public int LastIndexOfAny(char[] anyOf)
  public int LastIndexOfAny(char[] anyOf, int startIndex)
  public int LastIndexOfAny(char[] anyOf, int startIndex, int count)
