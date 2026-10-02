# PicoGK — Selected BCL reference — System (2)

3 top-level symbols. Signatures are verbatim csharp.

// Category: Selected BCL reference
public static class Convert

  public static readonly object DBNull

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

// Category: Selected BCL reference
public static class Math

  public const double E = 2.718281828459045

  public const double PI = 3.141592653589793

  public const double Tau = 6.283185307179586

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

// Category: Selected BCL reference
public static class MathF

  public const float E = 2.7182817

  public const float PI = 3.1415927

  public const float Tau = 6.2831855

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
