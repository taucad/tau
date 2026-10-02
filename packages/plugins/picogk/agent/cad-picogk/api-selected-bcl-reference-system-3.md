# PicoGK — Selected BCL reference — System (3)

2 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public class Random

  public static Random Shared { get; }

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

// Category: Selected BCL reference
public sealed class String

  public static readonly string Empty

  public char this[int index] { get; }

  public int Length { get; }

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
  public String(sbyte* value, int startIndex, int length, Encoding enc)
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
