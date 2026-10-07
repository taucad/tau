# kcl-std — std.string

8 top-level symbols. Signatures are verbatim kcl.

// Category: std.string
// Convert all cased characters in a string to uppercase
// Remarks: This conversion is Unicode-aware and locale-independent. Some characters expand into multiple characters; for example, `ß` becomes `SS`. The exact mappings follow the Unicode data bundled with KCL. Unicode normalization is not performed. Canonically equivalent strings therefore retain their original representations. Empty strings and strings without cased characters are returned unchanged.
// std.string.string::uppercase (function)
string::uppercase(@text: string): string
//   @text: The string to convert
// Example:
//   result = "Straße"
//     |> string::uppercase()
//   
//   assertIs(result == "STRASSE")

// Category: std.string
// Convert all cased characters in a string to lowercase
// Remarks: This conversion is Unicode-aware and locale-independent. Some conversions depend on the surrounding characters; for example, a Greek capital sigma becomes `ς` at the end of a word and `σ` elsewhere. Some characters expand into multiple characters; for example, `İ` becomes `i` followed by a combining dot above. The exact mappings follow the Unicode data bundled with KCL. Unicode normalization is not performed. Canonically equivalent strings therefore retain their original representations. Empty strings and strings without cased characters are returned unchanged.
// std.string.string::lowercase (function)
string::lowercase(@text: string): string
//   @text: The string to convert
// Example:
//   result = "KCL ΟΣ"
//     |> string::lowercase()
//   
//   assertIs(result == "kcl ος")

// Category: std.string
// Compare two strings for equality
// Remarks: By default, this performs an exact, case-sensitive comparison equivalent to the `==` operator. Set `caseInsensitive` to `true` to compare using locale-independent full Unicode case folding. Full case folding may expand characters; for example, `Straße` and `STRASSE` compare as equal. The exact mappings follow the Unicode data bundled with KCL. Unicode normalization is not performed. Canonically equivalent strings with different representations therefore compare as unequal. Empty strings are valid inputs, and comparison is symmetric. This function always returns a Boolean predicate, including inside a sketch block. It does not create an equivalence constraint.
// std.string.string::isEqual (function)
string::isEqual(
  @text: string,
  to: string,
  caseInsensitive?: bool,
): bool
//   @text: The string to compare
//   to: The string to compare `text` with
//   caseInsensitive: Whether to compare using locale-independent full Unicode case folding
// Example:
//   matches = "Straße"
//     |> string::isEqual(to = "STRASSE", caseInsensitive = true)
//   
//   assertIs(matches)

// Category: std.string
// Remove whitespace from the start and end of a string
// Remarks: Whitespace is defined by Unicode's `White_Space` property and includes spaces, tabs, newlines, and non-breaking spaces. Whitespace inside the string is preserved. If the input is empty or contains only whitespace, this returns an empty string. Unicode normalization and case conversion are not performed.
// std.string.string::trim (function)
string::trim(@text: string): string
//   @text: The string to trim
// Example:
//   result = "  KCL strings  "
//     |> string::trim()
//   
//   assertIs(result == "KCL strings")

// Category: std.string
// Remove whitespace from the start of a string
// Remarks: Whitespace is defined by Unicode's `White_Space` property and includes spaces, tabs, newlines, and non-breaking spaces. Only the contiguous whitespace at the start is removed; whitespace inside or at the end of the string is preserved. The start is the beginning of the string's character sequence, independent of how the text is displayed. If the input is empty or contains only whitespace, this returns an empty string. Unicode normalization and case conversion are not performed.
// std.string.string::trimStart (function)
string::trimStart(@text: string): string
//   @text: The string to trim
// Example:
//   result = "  KCL strings  "
//     |> string::trimStart()
//   
//   assertIs(result == "KCL strings  ")

// Category: std.string
// Remove whitespace from the end of a string
// Remarks: Whitespace is defined by Unicode's `White_Space` property and includes spaces, tabs, newlines, and non-breaking spaces. Only the contiguous whitespace at the end is removed; whitespace at the start or inside the string is preserved. The end is the end of the string's character sequence, independent of how the text is displayed. If the input is empty or contains only whitespace, this returns an empty string. Unicode normalization and case conversion are not performed.
// std.string.string::trimEnd (function)
string::trimEnd(@text: string): string
//   @text: The string to trim
// Example:
//   result = "  KCL strings  "
//     |> string::trimEnd()
//   
//   assertIs(result == "  KCL strings")

// Category: std.string
// Convert a number to human-readable text
// Remarks: Defined for every `number` value, including the non-finite ones. | Value | Result | Why | |---|---|---| | `12` | `"12"` | no units, so no suffix | | `1.5` | `"1.5"` | never rounded | | `0.1 + 0.2` | `"0.30000000000000004"` | no digits are dropped | | `-7` | `"-7"` | | | `-0` | `"0"` | the sign of zero is not kept | | `3_` | `"3_"` | a count keeps its `_` | | `12mm` | `"12mm"` | a concrete length keeps its suffix | | `12cm`, `12m`, `1.5in`, `2ft`, `3yd` | `"12cm"`, `"12m"`, `"1.5in"`, `"2ft"`, `"3yd"` | every length unit does | | `90deg` | `"90deg"` | a concrete angle keeps its suffix | | `1.5rad` | `"1.5rad"` | both angle units do | | `2mm + 10mm` | `"12mm"` | arithmetic that keeps its units | | `2mm * 10mm` | `"20"` | units no longer tracked, so none is shown | | `1 / 0` | `"Infinity"` | | | `-1 / 0` | `"-Infinity"` | | | `0 / 0` | `"NaN"` | | | `1mm / 0` | `"Infinity"` | a non-finite value never carries a unit | The output is meant to be read, not parsed. Some results are not valid KCL source and reading one back is not supported.
// std.string.string::toString (function)
string::toString(@num: number): string
//   @num: The number to convert
// Example:
//   lengthText = 12mm
//     |> string::toString()
//   
//   assertIs(lengthText == "12mm")
//   
//   countText = string::toString(3_)
//   
//   assertIs(countText == "3_")

// Category: std.string
// Operations on KCL strings
// Remarks: This module provides functions for transforming strings and inspecting their contents.
string
