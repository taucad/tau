# openrscad — List / string functions

14 top-level symbols. Signatures are verbatim openscad.

// Category: List / string functions
// Length of a vector or string
// len (function)
len(value)

// Category: List / string functions
// Concatenate vectors/values into one list
// concat (function)
concat(a, b, ...)

// Category: List / string functions
// Linear-interpolated table lookup
// lookup (function)
lookup(key, table)

// Category: List / string functions
// Concatenate values into a string
// str (function)
str(value, ...)

// Category: List / string functions
// Unicode code point(s) to a string
// chr (function)
chr(code, ...)
chr(codes)

// Category: List / string functions
// First character to its Unicode code point
// ord (function)
ord(char)

// Category: List / string functions
// Find matches in a list/string
// Remarks: num_returns_per_match defaults to 1 (0 returns all); index_col_num to 0.
// search (function)
search(match_value, string_or_vector, num_returns_per_match, index_col_num)

// Category: List / string functions
// Name of a user module on the active instantiation stack
// Remarks: index defaults to 1.
// parent_module (function)
parent_module(index)

// Category: List / string functions
// True if `x` is undefined
// is_undef (function)
is_undef(x)

// Category: List / string functions
// True if `x` is a boolean
// is_bool (function)
is_bool(x)

// Category: List / string functions
// True if `x` is a number
// is_num (function)
is_num(x)

// Category: List / string functions
// True if `x` is a string
// is_string (function)
is_string(x)

// Category: List / string functions
// True if `x` is a list/vector
// is_list (function)
is_list(x)

// Category: List / string functions
// True if `x` is a function value
// is_function (function)
is_function(x)
