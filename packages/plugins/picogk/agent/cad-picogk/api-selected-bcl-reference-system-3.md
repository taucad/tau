# PicoGK — Selected BCL reference — System (3)

2 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Random (class)
public class Random

  // System.Random.Shared (property)
  public static Random Shared { get; }

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

// Category: Selected BCL reference
// System.String (class)
public sealed class String

  // System.String.Empty (field)
  public static readonly string Empty

  // System.String.this[int index] (property)
  public char this[int index] { get; }

  // System.String.Length (property)
  public int Length { get; }

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
