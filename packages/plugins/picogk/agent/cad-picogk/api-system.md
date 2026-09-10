# PicoGK — System

3 top-level symbols. Signatures are verbatim csharp.

Array

Length: int

LongLength: long

Rank: int

SyncRoot: object

IsReadOnly: bool

IsFixedSize: bool

IsSynchronized: bool

MaxLength: int

public void Initialize()

public static ReadOnlyCollection<T> AsReadOnly<T>(T[] array)

public static void Resize<T>(ref T[]? array, int newSize)

public static Array CreateInstance(Type elementType, int length)
public static Array CreateInstance(Type elementType, int length1, int length2)
public static Array CreateInstance(Type elementType, int length1, int length2, int length3)
public static Array CreateInstance(Type elementType, params int[] lengths)
public static Array CreateInstance(Type elementType, int[] lengths, int[] lowerBounds)
public static Array CreateInstance(Type elementType, params long[] lengths)

public static Array CreateInstanceFromArrayType(Type arrayType, int length)
public static Array CreateInstanceFromArrayType(Type arrayType, params int[] lengths)
public static Array CreateInstanceFromArrayType(Type arrayType, int[] lengths, int[] lowerBounds)

public static void Copy(Array sourceArray, Array destinationArray, long length)
public static void Copy(Array sourceArray, long sourceIndex, Array destinationArray, long destinationIndex, long length)
public static void Copy(Array sourceArray, Array destinationArray, int length)
public static void Copy(Array sourceArray, int sourceIndex, Array destinationArray, int destinationIndex, int length)

public static void ConstrainedCopy(Array sourceArray, int sourceIndex, Array destinationArray, int destinationIndex, int length)

public static void Clear(Array array)
public static void Clear(Array array, int index, int length)

public int GetLength(int dimension)

public int GetUpperBound(int dimension)

public int GetLowerBound(int dimension)

public object? GetValue(params int[] indices)
public object? GetValue(int index)
public object? GetValue(int index1, int index2)
public object? GetValue(int index1, int index2, int index3)
public object? GetValue(long index)
public object? GetValue(long index1, long index2)
public object? GetValue(long index1, long index2, long index3)
public object? GetValue(params long[] indices)

public void SetValue(object? value, int index)
public void SetValue(object? value, int index1, int index2)
public void SetValue(object? value, int index1, int index2, int index3)
public void SetValue(object? value, params int[] indices)
public void SetValue(object? value, long index)
public void SetValue(object? value, long index1, long index2)
public void SetValue(object? value, long index1, long index2, long index3)
public void SetValue(object? value, params long[] indices)

public long GetLongLength(int dimension)

public object Clone()

public static int BinarySearch(Array array, object? value)
public static int BinarySearch(Array array, int index, int length, object? value)
public static int BinarySearch(Array array, object? value, IComparer? comparer)
public static int BinarySearch(Array array, int index, int length, object? value, IComparer? comparer)
public static int BinarySearch<T>(T[] array, T value)
public static int BinarySearch<T>(T[] array, T value, IComparer<T>? comparer)
public static int BinarySearch<T>(T[] array, int index, int length, T value)
public static int BinarySearch<T>(T[] array, int index, int length, T value, IComparer<T>? comparer)

public static TOutput[] ConvertAll<TInput, TOutput>(TInput[] array, Converter<TInput, TOutput> converter)

public void CopyTo(Array array, int index)
public void CopyTo(Array array, long index)

public static T[] Empty<T>()

public static bool Exists<T>(T[] array, Predicate<T> match)

public static void Fill<T>(T[] array, T value)
public static void Fill<T>(T[] array, T value, int startIndex, int count)

public static T? Find<T>(T[] array, Predicate<T> match)

public static T[] FindAll<T>(T[] array, Predicate<T> match)

public static int FindIndex<T>(T[] array, Predicate<T> match)
public static int FindIndex<T>(T[] array, int startIndex, Predicate<T> match)
public static int FindIndex<T>(T[] array, int startIndex, int count, Predicate<T> match)

public static T? FindLast<T>(T[] array, Predicate<T> match)

public static int FindLastIndex<T>(T[] array, Predicate<T> match)
public static int FindLastIndex<T>(T[] array, int startIndex, Predicate<T> match)
public static int FindLastIndex<T>(T[] array, int startIndex, int count, Predicate<T> match)

public static void ForEach<T>(T[] array, Action<T> action)

public static int IndexOf(Array array, object? value)
public static int IndexOf(Array array, object? value, int startIndex)
public static int IndexOf(Array array, object? value, int startIndex, int count)
public static int IndexOf<T>(T[] array, T value)
public static int IndexOf<T>(T[] array, T value, int startIndex)
public static int IndexOf<T>(T[] array, T value, int startIndex, int count)

public static int LastIndexOf(Array array, object? value)
public static int LastIndexOf(Array array, object? value, int startIndex)
public static int LastIndexOf(Array array, object? value, int startIndex, int count)
public static int LastIndexOf<T>(T[] array, T value)
public static int LastIndexOf<T>(T[] array, T value, int startIndex)
public static int LastIndexOf<T>(T[] array, T value, int startIndex, int count)

public static void Reverse(Array array)
public static void Reverse(Array array, int index, int length)
public static void Reverse<T>(T[] array)
public static void Reverse<T>(T[] array, int index, int length)

public static void Sort(Array array)
public static void Sort(Array keys, Array? items)
public static void Sort(Array array, int index, int length)
public static void Sort(Array keys, Array? items, int index, int length)
public static void Sort(Array array, IComparer? comparer)
public static void Sort(Array keys, Array? items, IComparer? comparer)
public static void Sort(Array array, int index, int length, IComparer? comparer)
public static void Sort(Array keys, Array? items, int index, int length, IComparer? comparer)
public static void Sort<T>(T[] array)
public static void Sort<TKey, TValue>(TKey[] keys, TValue[]? items)
public static void Sort<T>(T[] array, int index, int length)
public static void Sort<TKey, TValue>(TKey[] keys, TValue[]? items, int index, int length)
public static void Sort<T>(T[] array, IComparer<T>? comparer)
public static void Sort<TKey, TValue>(TKey[] keys, TValue[]? items, IComparer<TKey>? comparer)
public static void Sort<T>(T[] array, int index, int length, IComparer<T>? comparer)
public static void Sort<TKey, TValue>(TKey[] keys, TValue[]? items, int index, int length, IComparer<TKey>? comparer)
public static void Sort<T>(T[] array, Comparison<T> comparison)

public static bool TrueForAll<T>(T[] array, Predicate<T> match)

public IEnumerator GetEnumerator()

Console

In: TextReader

InputEncoding: Encoding

OutputEncoding: Encoding

KeyAvailable: bool

Out: TextWriter

Error: TextWriter

IsInputRedirected: bool

IsOutputRedirected: bool

IsErrorRedirected: bool

CursorSize: int

NumberLock: bool

CapsLock: bool

BackgroundColor: ConsoleColor

ForegroundColor: ConsoleColor

BufferWidth: int

BufferHeight: int

WindowLeft: int

WindowTop: int

WindowWidth: int

WindowHeight: int

LargestWindowWidth: int

LargestWindowHeight: int

CursorVisible: bool

CursorLeft: int

CursorTop: int

Title: string

TreatControlCAsInput: bool

public static ConsoleKeyInfo ReadKey()
public static ConsoleKeyInfo ReadKey(bool intercept)

public static void ResetColor()

public static void SetBufferSize(int width, int height)

public static void SetWindowPosition(int left, int top)

public static void SetWindowSize(int width, int height)

public static (int Left, int Top) GetCursorPosition()

public static void Beep()
public static void Beep(int frequency, int duration)

public static void MoveBufferArea(int sourceLeft, int sourceTop, int sourceWidth, int sourceHeight, int targetLeft, int targetTop)
public static void MoveBufferArea(int sourceLeft, int sourceTop, int sourceWidth, int sourceHeight, int targetLeft, int targetTop, char sourceChar, ConsoleColor sourceForeColor, ConsoleColor sourceBackColor)

public static void Clear()

public static void SetCursorPosition(int left, int top)

public static Stream OpenStandardInput()
public static Stream OpenStandardInput(int bufferSize)

public static Stream OpenStandardOutput()
public static Stream OpenStandardOutput(int bufferSize)

public static Stream OpenStandardError()
public static Stream OpenStandardError(int bufferSize)

public static void SetIn(TextReader newIn)

public static void SetOut(TextWriter newOut)

public static void SetError(TextWriter newError)

public static int Read()

public static string? ReadLine()

public static void WriteLine()
public static void WriteLine(bool value)
public static void WriteLine(char value)
public static void WriteLine(char[]? buffer)
public static void WriteLine(char[] buffer, int index, int count)
public static void WriteLine(decimal value)
public static void WriteLine(double value)
public static void WriteLine(float value)
public static void WriteLine(int value)
public static void WriteLine(uint value)
public static void WriteLine(long value)
public static void WriteLine(ulong value)
public static void WriteLine(object? value)
public static void WriteLine(string? value)
public static void WriteLine(ReadOnlySpan<char> value)
public static void WriteLine(string format, object? arg0)
public static void WriteLine(string format, object? arg0, object? arg1)
public static void WriteLine(string format, object? arg0, object? arg1, object? arg2)
public static void WriteLine(string format, params object?[]? arg)
public static void WriteLine(string format, params ReadOnlySpan<object?> arg)

public static void Write(string format, object? arg0)
public static void Write(string format, object? arg0, object? arg1)
public static void Write(string format, object? arg0, object? arg1, object? arg2)
public static void Write(string format, params object?[]? arg)
public static void Write(string format, params ReadOnlySpan<object?> arg)
public static void Write(bool value)
public static void Write(char value)
public static void Write(char[]? buffer)
public static void Write(char[] buffer, int index, int count)
public static void Write(double value)
public static void Write(decimal value)
public static void Write(float value)
public static void Write(int value)
public static void Write(uint value)
public static void Write(long value)
public static void Write(ulong value)
public static void Write(object? value)
public static void Write(string? value)
public static void Write(ReadOnlySpan<char> value)

Convert

DBNull: object

public static TypeCode GetTypeCode(object? value)

public static bool IsDBNull(object? value)

public static object? ChangeType(object? value, TypeCode typeCode)
public static object? ChangeType(object? value, TypeCode typeCode, IFormatProvider? provider)
public static object? ChangeType(object? value, Type conversionType)
public static object? ChangeType(object? value, Type conversionType, IFormatProvider? provider)

public static bool ToBoolean(object? value)
public static bool ToBoolean(object? value, IFormatProvider? provider)
public static bool ToBoolean(bool value)
public static bool ToBoolean(sbyte value)
public static bool ToBoolean(char value)
public static bool ToBoolean(byte value)
public static bool ToBoolean(short value)
public static bool ToBoolean(ushort value)
public static bool ToBoolean(int value)
public static bool ToBoolean(uint value)
public static bool ToBoolean(long value)
public static bool ToBoolean(ulong value)
public static bool ToBoolean(string? value)
public static bool ToBoolean(string? value, IFormatProvider? provider)
public static bool ToBoolean(float value)
public static bool ToBoolean(double value)
public static bool ToBoolean(decimal value)
public static bool ToBoolean(DateTime value)

public static char ToChar(object? value)
public static char ToChar(object? value, IFormatProvider? provider)
public static char ToChar(bool value)
public static char ToChar(char value)
public static char ToChar(sbyte value)
public static char ToChar(byte value)
public static char ToChar(short value)
public static char ToChar(ushort value)
public static char ToChar(int value)
public static char ToChar(uint value)
public static char ToChar(long value)
public static char ToChar(ulong value)
public static char ToChar(string value)
public static char ToChar(string value, IFormatProvider? provider)
public static char ToChar(float value)
public static char ToChar(double value)
public static char ToChar(decimal value)
public static char ToChar(DateTime value)

public static sbyte ToSByte(object? value)
public static sbyte ToSByte(object? value, IFormatProvider? provider)
public static sbyte ToSByte(bool value)
public static sbyte ToSByte(sbyte value)
public static sbyte ToSByte(char value)
public static sbyte ToSByte(byte value)
public static sbyte ToSByte(short value)
public static sbyte ToSByte(ushort value)
public static sbyte ToSByte(int value)
public static sbyte ToSByte(uint value)
public static sbyte ToSByte(long value)
public static sbyte ToSByte(ulong value)
public static sbyte ToSByte(float value)
public static sbyte ToSByte(double value)
public static sbyte ToSByte(decimal value)
public static sbyte ToSByte(string? value)
public static sbyte ToSByte(string value, IFormatProvider? provider)
public static sbyte ToSByte(DateTime value)
public static sbyte ToSByte(string? value, int fromBase)

public static byte ToByte(object? value)
public static byte ToByte(object? value, IFormatProvider? provider)
public static byte ToByte(bool value)
public static byte ToByte(byte value)
public static byte ToByte(char value)
public static byte ToByte(sbyte value)
public static byte ToByte(short value)
public static byte ToByte(ushort value)
public static byte ToByte(int value)
public static byte ToByte(uint value)
public static byte ToByte(long value)
public static byte ToByte(ulong value)
public static byte ToByte(float value)
public static byte ToByte(double value)
public static byte ToByte(decimal value)
public static byte ToByte(string? value)
public static byte ToByte(string? value, IFormatProvider? provider)
public static byte ToByte(DateTime value)
public static byte ToByte(string? value, int fromBase)

public static short ToInt16(object? value)
public static short ToInt16(object? value, IFormatProvider? provider)
public static short ToInt16(bool value)
public static short ToInt16(char value)
public static short ToInt16(sbyte value)
public static short ToInt16(byte value)
public static short ToInt16(ushort value)
public static short ToInt16(int value)
public static short ToInt16(uint value)
public static short ToInt16(short value)
public static short ToInt16(long value)
public static short ToInt16(ulong value)
public static short ToInt16(float value)
public static short ToInt16(double value)
public static short ToInt16(decimal value)
public static short ToInt16(string? value)
public static short ToInt16(string? value, IFormatProvider? provider)
public static short ToInt16(DateTime value)
public static short ToInt16(string? value, int fromBase)

public static ushort ToUInt16(object? value)
public static ushort ToUInt16(object? value, IFormatProvider? provider)
public static ushort ToUInt16(bool value)
public static ushort ToUInt16(char value)
public static ushort ToUInt16(sbyte value)
public static ushort ToUInt16(byte value)
public static ushort ToUInt16(short value)
public static ushort ToUInt16(int value)
public static ushort ToUInt16(ushort value)
public static ushort ToUInt16(uint value)
public static ushort ToUInt16(long value)
public static ushort ToUInt16(ulong value)
public static ushort ToUInt16(float value)
public static ushort ToUInt16(double value)
public static ushort ToUInt16(decimal value)
public static ushort ToUInt16(string? value)
public static ushort ToUInt16(string? value, IFormatProvider? provider)
public static ushort ToUInt16(DateTime value)
public static ushort ToUInt16(string? value, int fromBase)

public static int ToInt32(object? value)
public static int ToInt32(object? value, IFormatProvider? provider)
public static int ToInt32(bool value)
public static int ToInt32(char value)
public static int ToInt32(sbyte value)
public static int ToInt32(byte value)
public static int ToInt32(short value)
public static int ToInt32(ushort value)
public static int ToInt32(uint value)
public static int ToInt32(int value)
public static int ToInt32(long value)
public static int ToInt32(ulong value)
public static int ToInt32(float value)
public static int ToInt32(double value)
public static int ToInt32(decimal value)
public static int ToInt32(string? value)
public static int ToInt32(string? value, IFormatProvider? provider)
public static int ToInt32(DateTime value)
public static int ToInt32(string? value, int fromBase)

public static uint ToUInt32(object? value)
public static uint ToUInt32(object? value, IFormatProvider? provider)
public static uint ToUInt32(bool value)
public static uint ToUInt32(char value)
public static uint ToUInt32(sbyte value)
public static uint ToUInt32(byte value)
public static uint ToUInt32(short value)
public static uint ToUInt32(ushort value)
public static uint ToUInt32(int value)
public static uint ToUInt32(uint value)
public static uint ToUInt32(long value)
public static uint ToUInt32(ulong value)
public static uint ToUInt32(float value)
public static uint ToUInt32(double value)
public static uint ToUInt32(decimal value)
public static uint ToUInt32(string? value)
public static uint ToUInt32(string? value, IFormatProvider? provider)
public static uint ToUInt32(DateTime value)
public static uint ToUInt32(string? value, int fromBase)

public static long ToInt64(object? value)
public static long ToInt64(object? value, IFormatProvider? provider)
public static long ToInt64(bool value)
public static long ToInt64(char value)
public static long ToInt64(sbyte value)
public static long ToInt64(byte value)
public static long ToInt64(short value)
public static long ToInt64(ushort value)
public static long ToInt64(int value)
public static long ToInt64(uint value)
public static long ToInt64(ulong value)
public static long ToInt64(long value)
public static long ToInt64(float value)
public static long ToInt64(double value)
public static long ToInt64(decimal value)
public static long ToInt64(string? value)
public static long ToInt64(string? value, IFormatProvider? provider)
public static long ToInt64(DateTime value)
public static long ToInt64(string? value, int fromBase)

public static ulong ToUInt64(object? value)
public static ulong ToUInt64(object? value, IFormatProvider? provider)
public static ulong ToUInt64(bool value)
public static ulong ToUInt64(char value)
public static ulong ToUInt64(sbyte value)
public static ulong ToUInt64(byte value)
public static ulong ToUInt64(short value)
public static ulong ToUInt64(ushort value)
public static ulong ToUInt64(int value)
public static ulong ToUInt64(uint value)
public static ulong ToUInt64(long value)
public static ulong ToUInt64(ulong value)
public static ulong ToUInt64(float value)
public static ulong ToUInt64(double value)
public static ulong ToUInt64(decimal value)
public static ulong ToUInt64(string? value)
public static ulong ToUInt64(string? value, IFormatProvider? provider)
public static ulong ToUInt64(DateTime value)
public static ulong ToUInt64(string? value, int fromBase)

public static float ToSingle(object? value)
public static float ToSingle(object? value, IFormatProvider? provider)
public static float ToSingle(sbyte value)
public static float ToSingle(byte value)
public static float ToSingle(char value)
public static float ToSingle(short value)
public static float ToSingle(ushort value)
public static float ToSingle(int value)
public static float ToSingle(uint value)
public static float ToSingle(long value)
public static float ToSingle(ulong value)
public static float ToSingle(float value)
public static float ToSingle(double value)
public static float ToSingle(decimal value)
public static float ToSingle(string? value)
public static float ToSingle(string? value, IFormatProvider? provider)
public static float ToSingle(bool value)
public static float ToSingle(DateTime value)

public static double ToDouble(object? value)
public static double ToDouble(object? value, IFormatProvider? provider)
public static double ToDouble(sbyte value)
public static double ToDouble(byte value)
public static double ToDouble(short value)
public static double ToDouble(char value)
public static double ToDouble(ushort value)
public static double ToDouble(int value)
public static double ToDouble(uint value)
public static double ToDouble(long value)
public static double ToDouble(ulong value)
public static double ToDouble(float value)
public static double ToDouble(double value)
public static double ToDouble(decimal value)
public static double ToDouble(string? value)
public static double ToDouble(string? value, IFormatProvider? provider)
public static double ToDouble(bool value)
public static double ToDouble(DateTime value)

public static decimal ToDecimal(object? value)
public static decimal ToDecimal(object? value, IFormatProvider? provider)
public static decimal ToDecimal(sbyte value)
public static decimal ToDecimal(byte value)
public static decimal ToDecimal(char value)
public static decimal ToDecimal(short value)
public static decimal ToDecimal(ushort value)
public static decimal ToDecimal(int value)
public static decimal ToDecimal(uint value)
public static decimal ToDecimal(long value)
public static decimal ToDecimal(ulong value)
public static decimal ToDecimal(float value)
public static decimal ToDecimal(double value)
public static decimal ToDecimal(string? value)
public static decimal ToDecimal(string? value, IFormatProvider? provider)
public static decimal ToDecimal(decimal value)
public static decimal ToDecimal(bool value)
public static decimal ToDecimal(DateTime value)

public static DateTime ToDateTime(DateTime value)
public static DateTime ToDateTime(object? value)
public static DateTime ToDateTime(object? value, IFormatProvider? provider)
public static DateTime ToDateTime(string? value)
public static DateTime ToDateTime(string? value, IFormatProvider? provider)
public static DateTime ToDateTime(sbyte value)
public static DateTime ToDateTime(byte value)
public static DateTime ToDateTime(short value)
public static DateTime ToDateTime(ushort value)
public static DateTime ToDateTime(int value)
public static DateTime ToDateTime(uint value)
public static DateTime ToDateTime(long value)
public static DateTime ToDateTime(ulong value)
public static DateTime ToDateTime(bool value)
public static DateTime ToDateTime(char value)
public static DateTime ToDateTime(float value)
public static DateTime ToDateTime(double value)
public static DateTime ToDateTime(decimal value)

public static string? ToString(object? value)
public static string? ToString(object? value, IFormatProvider? provider)
public static string ToString(bool value)
public static string ToString(bool value, IFormatProvider? provider)
public static string ToString(char value)
public static string ToString(char value, IFormatProvider? provider)
public static string ToString(sbyte value)
public static string ToString(sbyte value, IFormatProvider? provider)
public static string ToString(byte value)
public static string ToString(byte value, IFormatProvider? provider)
public static string ToString(short value)
public static string ToString(short value, IFormatProvider? provider)
public static string ToString(ushort value)
public static string ToString(ushort value, IFormatProvider? provider)
public static string ToString(int value)
public static string ToString(int value, IFormatProvider? provider)
public static string ToString(uint value)
public static string ToString(uint value, IFormatProvider? provider)
public static string ToString(long value)
public static string ToString(long value, IFormatProvider? provider)
public static string ToString(ulong value)
public static string ToString(ulong value, IFormatProvider? provider)
public static string ToString(float value)
public static string ToString(float value, IFormatProvider? provider)
public static string ToString(double value)
public static string ToString(double value, IFormatProvider? provider)
public static string ToString(decimal value)
public static string ToString(decimal value, IFormatProvider? provider)
public static string ToString(DateTime value)
public static string ToString(DateTime value, IFormatProvider? provider)
public static string? ToString(string? value)
public static string? ToString(string? value, IFormatProvider? provider)
public static string ToString(byte value, int toBase)
public static string ToString(short value, int toBase)
public static string ToString(int value, int toBase)
public static string ToString(long value, int toBase)

public static string ToBase64String(byte[] inArray)
public static string ToBase64String(byte[] inArray, Base64FormattingOptions options)
public static string ToBase64String(byte[] inArray, int offset, int length)
public static string ToBase64String(byte[] inArray, int offset, int length, Base64FormattingOptions options)
public static string ToBase64String(ReadOnlySpan<byte> bytes, Base64FormattingOptions options = None)

public static int ToBase64CharArray(byte[] inArray, int offsetIn, int length, char[] outArray, int offsetOut)
public static int ToBase64CharArray(byte[] inArray, int offsetIn, int length, char[] outArray, int offsetOut, Base64FormattingOptions options)

public static bool TryToBase64Chars(ReadOnlySpan<byte> bytes, Span<char> chars, out int charsWritten, Base64FormattingOptions options = None)

public static byte[] FromBase64String(string s)

public static bool TryFromBase64String(string s, Span<byte> bytes, out int bytesWritten)

public static bool TryFromBase64Chars(ReadOnlySpan<char> chars, Span<byte> bytes, out int bytesWritten)

public static byte[] FromBase64CharArray(char[] inArray, int offset, int length)

public static byte[] FromHexString(string s)
public static byte[] FromHexString(ReadOnlySpan<char> chars)
public static byte[] FromHexString(ReadOnlySpan<byte> utf8Source)
public static OperationStatus FromHexString(string source, Span<byte> destination, out int charsConsumed, out int bytesWritten)
public static OperationStatus FromHexString(ReadOnlySpan<char> source, Span<byte> destination, out int charsConsumed, out int bytesWritten)
public static OperationStatus FromHexString(ReadOnlySpan<byte> utf8Source, Span<byte> destination, out int bytesConsumed, out int bytesWritten)

public static string ToHexString(byte[] inArray)
public static string ToHexString(byte[] inArray, int offset, int length)
public static string ToHexString(ReadOnlySpan<byte> bytes)

public static bool TryToHexString(ReadOnlySpan<byte> source, Span<char> destination, out int charsWritten)
public static bool TryToHexString(ReadOnlySpan<byte> source, Span<byte> utf8Destination, out int bytesWritten)

public static string ToHexStringLower(byte[] inArray)
public static string ToHexStringLower(byte[] inArray, int offset, int length)
public static string ToHexStringLower(ReadOnlySpan<byte> bytes)

public static bool TryToHexStringLower(ReadOnlySpan<byte> source, Span<char> destination, out int charsWritten)
public static bool TryToHexStringLower(ReadOnlySpan<byte> source, Span<byte> utf8Destination, out int bytesWritten)
