# PicoGK — Selected BCL reference — System

2 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
// System.Array (class)
public abstract class Array

  // System.Array.Length (property)
  public int Length { get; }

  // System.Array.LongLength (property)
  public long LongLength { get; }

  // System.Array.Rank (property)
  public int Rank { get; }

  // System.Array.SyncRoot (property)
  public object SyncRoot { get; }

  // System.Array.IsReadOnly (property)
  public bool IsReadOnly { get; }

  // System.Array.IsFixedSize (property)
  public bool IsFixedSize { get; }

  // System.Array.IsSynchronized (property)
  public bool IsSynchronized { get; }

  // System.Array.MaxLength (property)
  public static int MaxLength { get; }

  // System.Array.Initialize (method)
  public void Initialize()

  // System.Array.AsReadOnly (method)
  public static ReadOnlyCollection<T> AsReadOnly<T>(T[] array)

  // System.Array.Resize (method)
  public static void Resize<T>(ref T[]? array, int newSize)

  // System.Array.CreateInstance (method)
  public static Array CreateInstance(Type elementType, int length)
  public static Array CreateInstance(Type elementType, int length1, int length2)
  public static Array CreateInstance(Type elementType, int length1, int length2, int length3)
  public static Array CreateInstance(Type elementType, params int[] lengths)
  public static Array CreateInstance(Type elementType, int[] lengths, int[] lowerBounds)
  public static Array CreateInstance(Type elementType, params long[] lengths)

  // System.Array.CreateInstanceFromArrayType (method)
  public static Array CreateInstanceFromArrayType(Type arrayType, int length)
  public static Array CreateInstanceFromArrayType(Type arrayType, params int[] lengths)
  public static Array CreateInstanceFromArrayType(Type arrayType, int[] lengths, int[] lowerBounds)

  // System.Array.Copy (method)
  public static void Copy(Array sourceArray, Array destinationArray, long length)
  public static void Copy(Array sourceArray, long sourceIndex, Array destinationArray, long destinationIndex, long length)
  public static void Copy(Array sourceArray, Array destinationArray, int length)
  public static void Copy(Array sourceArray, int sourceIndex, Array destinationArray, int destinationIndex, int length)

  // System.Array.ConstrainedCopy (method)
  public static void ConstrainedCopy(Array sourceArray, int sourceIndex, Array destinationArray, int destinationIndex, int length)

  // System.Array.Clear (method)
  public static void Clear(Array array)
  public static void Clear(Array array, int index, int length)

  // System.Array.GetLength (method)
  public int GetLength(int dimension)

  // System.Array.GetUpperBound (method)
  public int GetUpperBound(int dimension)

  // System.Array.GetLowerBound (method)
  public int GetLowerBound(int dimension)

  // System.Array.GetValue (method)
  public object? GetValue(params int[] indices)
  public object? GetValue(int index)
  public object? GetValue(int index1, int index2)
  public object? GetValue(int index1, int index2, int index3)
  public object? GetValue(long index)
  public object? GetValue(long index1, long index2)
  public object? GetValue(long index1, long index2, long index3)
  public object? GetValue(params long[] indices)

  // System.Array.SetValue (method)
  public void SetValue(object? value, int index)
  public void SetValue(object? value, int index1, int index2)
  public void SetValue(object? value, int index1, int index2, int index3)
  public void SetValue(object? value, params int[] indices)
  public void SetValue(object? value, long index)
  public void SetValue(object? value, long index1, long index2)
  public void SetValue(object? value, long index1, long index2, long index3)
  public void SetValue(object? value, params long[] indices)

  // System.Array.GetLongLength (method)
  public long GetLongLength(int dimension)

  // System.Array.Clone (method)
  public object Clone()

  // System.Array.BinarySearch (method)
  public static int BinarySearch(Array array, object? value)
  public static int BinarySearch(Array array, int index, int length, object? value)
  public static int BinarySearch(Array array, object? value, IComparer? comparer)
  public static int BinarySearch(Array array, int index, int length, object? value, IComparer? comparer)
  public static int BinarySearch<T>(T[] array, T value)
  public static int BinarySearch<T>(T[] array, T value, IComparer<T>? comparer)
  public static int BinarySearch<T>(T[] array, int index, int length, T value)
  public static int BinarySearch<T>(T[] array, int index, int length, T value, IComparer<T>? comparer)

  // System.Array.ConvertAll (method)
  public static TOutput[] ConvertAll<TInput, TOutput>(TInput[] array, Converter<TInput, TOutput> converter)

  // System.Array.CopyTo (method)
  public void CopyTo(Array array, int index)
  public void CopyTo(Array array, long index)

  // System.Array.Empty (method)
  public static T[] Empty<T>()

  // System.Array.Exists (method)
  public static bool Exists<T>(T[] array, Predicate<T> match)

  // System.Array.Fill (method)
  public static void Fill<T>(T[] array, T value)
  public static void Fill<T>(T[] array, T value, int startIndex, int count)

  // System.Array.Find (method)
  public static T? Find<T>(T[] array, Predicate<T> match)

  // System.Array.FindAll (method)
  public static T[] FindAll<T>(T[] array, Predicate<T> match)

  // System.Array.FindIndex (method)
  public static int FindIndex<T>(T[] array, Predicate<T> match)
  public static int FindIndex<T>(T[] array, int startIndex, Predicate<T> match)
  public static int FindIndex<T>(T[] array, int startIndex, int count, Predicate<T> match)

  // System.Array.FindLast (method)
  public static T? FindLast<T>(T[] array, Predicate<T> match)

  // System.Array.FindLastIndex (method)
  public static int FindLastIndex<T>(T[] array, Predicate<T> match)
  public static int FindLastIndex<T>(T[] array, int startIndex, Predicate<T> match)
  public static int FindLastIndex<T>(T[] array, int startIndex, int count, Predicate<T> match)

  // System.Array.ForEach (method)
  public static void ForEach<T>(T[] array, Action<T> action)

  // System.Array.IndexOf (method)
  public static int IndexOf(Array array, object? value)
  public static int IndexOf(Array array, object? value, int startIndex)
  public static int IndexOf(Array array, object? value, int startIndex, int count)
  public static int IndexOf<T>(T[] array, T value)
  public static int IndexOf<T>(T[] array, T value, int startIndex)
  public static int IndexOf<T>(T[] array, T value, int startIndex, int count)

  // System.Array.LastIndexOf (method)
  public static int LastIndexOf(Array array, object? value)
  public static int LastIndexOf(Array array, object? value, int startIndex)
  public static int LastIndexOf(Array array, object? value, int startIndex, int count)
  public static int LastIndexOf<T>(T[] array, T value)
  public static int LastIndexOf<T>(T[] array, T value, int startIndex)
  public static int LastIndexOf<T>(T[] array, T value, int startIndex, int count)

  // System.Array.Reverse (method)
  public static void Reverse(Array array)
  public static void Reverse(Array array, int index, int length)
  public static void Reverse<T>(T[] array)
  public static void Reverse<T>(T[] array, int index, int length)

  // System.Array.Sort (method)
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

  // System.Array.TrueForAll (method)
  public static bool TrueForAll<T>(T[] array, Predicate<T> match)

  // System.Array.GetEnumerator (method)
  public IEnumerator GetEnumerator()

// Category: Selected BCL reference
// System.Console (class)
public static class Console

  // System.Console.In (property)
  public static TextReader In { get; }

  // System.Console.InputEncoding (property)
  public static Encoding InputEncoding { get; set; }

  // System.Console.OutputEncoding (property)
  public static Encoding OutputEncoding { get; set; }

  // System.Console.KeyAvailable (property)
  public static bool KeyAvailable { get; }

  // System.Console.Out (property)
  public static TextWriter Out { get; }

  // System.Console.Error (property)
  public static TextWriter Error { get; }

  // System.Console.IsInputRedirected (property)
  public static bool IsInputRedirected { get; }

  // System.Console.IsOutputRedirected (property)
  public static bool IsOutputRedirected { get; }

  // System.Console.IsErrorRedirected (property)
  public static bool IsErrorRedirected { get; }

  // System.Console.CursorSize (property)
  public static int CursorSize { get; set; }

  // System.Console.NumberLock (property)
  public static bool NumberLock { get; }

  // System.Console.CapsLock (property)
  public static bool CapsLock { get; }

  // System.Console.BackgroundColor (property)
  public static ConsoleColor BackgroundColor { get; set; }

  // System.Console.ForegroundColor (property)
  public static ConsoleColor ForegroundColor { get; set; }

  // System.Console.BufferWidth (property)
  public static int BufferWidth { get; set; }

  // System.Console.BufferHeight (property)
  public static int BufferHeight { get; set; }

  // System.Console.WindowLeft (property)
  public static int WindowLeft { get; set; }

  // System.Console.WindowTop (property)
  public static int WindowTop { get; set; }

  // System.Console.WindowWidth (property)
  public static int WindowWidth { get; set; }

  // System.Console.WindowHeight (property)
  public static int WindowHeight { get; set; }

  // System.Console.LargestWindowWidth (property)
  public static int LargestWindowWidth { get; }

  // System.Console.LargestWindowHeight (property)
  public static int LargestWindowHeight { get; }

  // System.Console.CursorVisible (property)
  public static bool CursorVisible { get; set; }

  // System.Console.CursorLeft (property)
  public static int CursorLeft { get; set; }

  // System.Console.CursorTop (property)
  public static int CursorTop { get; set; }

  // System.Console.Title (property)
  public static string Title { get; set; }

  // System.Console.TreatControlCAsInput (property)
  public static bool TreatControlCAsInput { get; set; }

  // System.Console.CancelKeyPress (field)
  public static ConsoleCancelEventHandler? CancelKeyPress

  // System.Console.ReadKey (method)
  public static ConsoleKeyInfo ReadKey()
  public static ConsoleKeyInfo ReadKey(bool intercept)

  // System.Console.ResetColor (method)
  public static void ResetColor()

  // System.Console.SetBufferSize (method)
  public static void SetBufferSize(int width, int height)

  // System.Console.SetWindowPosition (method)
  public static void SetWindowPosition(int left, int top)

  // System.Console.SetWindowSize (method)
  public static void SetWindowSize(int width, int height)

  // System.Console.GetCursorPosition (method)
  public static (int Left, int Top) GetCursorPosition()

  // System.Console.Beep (method)
  public static void Beep()
  public static void Beep(int frequency, int duration)

  // System.Console.MoveBufferArea (method)
  public static void MoveBufferArea(int sourceLeft, int sourceTop, int sourceWidth, int sourceHeight, int targetLeft, int targetTop)
  public static void MoveBufferArea(int sourceLeft, int sourceTop, int sourceWidth, int sourceHeight, int targetLeft, int targetTop, char sourceChar, ConsoleColor sourceForeColor, ConsoleColor sourceBackColor)

  // System.Console.Clear (method)
  public static void Clear()

  // System.Console.SetCursorPosition (method)
  public static void SetCursorPosition(int left, int top)

  // System.Console.OpenStandardInput (method)
  public static Stream OpenStandardInput()
  public static Stream OpenStandardInput(int bufferSize)

  // System.Console.OpenStandardOutput (method)
  public static Stream OpenStandardOutput()
  public static Stream OpenStandardOutput(int bufferSize)

  // System.Console.OpenStandardError (method)
  public static Stream OpenStandardError()
  public static Stream OpenStandardError(int bufferSize)

  // System.Console.SetIn (method)
  public static void SetIn(TextReader newIn)

  // System.Console.SetOut (method)
  public static void SetOut(TextWriter newOut)

  // System.Console.SetError (method)
  public static void SetError(TextWriter newError)

  // System.Console.Read (method)
  public static int Read()

  // System.Console.ReadLine (method)
  public static string? ReadLine()

  // System.Console.WriteLine (method)
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

  // System.Console.Write (method)
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
