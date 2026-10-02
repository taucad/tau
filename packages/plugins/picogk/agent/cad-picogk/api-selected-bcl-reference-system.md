# PicoGK — Selected BCL reference — System

2 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public abstract class Array

  public int Length { get; }

  public long LongLength { get; }

  public int Rank { get; }

  public object SyncRoot { get; }

  public bool IsReadOnly { get; }

  public bool IsFixedSize { get; }

  public bool IsSynchronized { get; }

  public static int MaxLength { get; }

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

// Category: Selected BCL reference
public static class Console

  public static TextReader In { get; }

  public static Encoding InputEncoding { get; set; }

  public static Encoding OutputEncoding { get; set; }

  public static bool KeyAvailable { get; }

  public static TextWriter Out { get; }

  public static TextWriter Error { get; }

  public static bool IsInputRedirected { get; }

  public static bool IsOutputRedirected { get; }

  public static bool IsErrorRedirected { get; }

  public static int CursorSize { get; set; }

  public static bool NumberLock { get; }

  public static bool CapsLock { get; }

  public static ConsoleColor BackgroundColor { get; set; }

  public static ConsoleColor ForegroundColor { get; set; }

  public static int BufferWidth { get; set; }

  public static int BufferHeight { get; set; }

  public static int WindowLeft { get; set; }

  public static int WindowTop { get; set; }

  public static int WindowWidth { get; set; }

  public static int WindowHeight { get; set; }

  public static int LargestWindowWidth { get; }

  public static int LargestWindowHeight { get; }

  public static bool CursorVisible { get; set; }

  public static int CursorLeft { get; set; }

  public static int CursorTop { get; set; }

  public static string Title { get; set; }

  public static bool TreatControlCAsInput { get; set; }

  public static ConsoleCancelEventHandler? CancelKeyPress

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
