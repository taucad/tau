# openrscad — List / string functions

14 top-level symbols. Signatures are verbatim openscad.

// Category: List / string functions
// Length of a vector or string
len(value)

// Category: List / string functions
// Concatenate vectors/values into one list
concat(a, b, ...)

// Category: List / string functions
// Linear-interpolated table lookup
lookup(key, table)

// Category: List / string functions
// Concatenate values into a string
str(values...)

// Category: List / string functions
// Unicode code point(s) to a string
chr(codes...)

// Category: List / string functions
// First character to its Unicode code point
ord(char)

// Category: List / string functions
// Find matches in a list/string
search(match, table, num?)

// Category: List / string functions
// Name of a user module on the active instantiation stack
parent_module(i=1)

// Category: List / string functions
// True if `x` is undefined
is_undef(x)

// Category: List / string functions
// True if `x` is a boolean
is_bool(x)

// Category: List / string functions
// True if `x` is a number
is_num(x)

// Category: List / string functions
// True if `x` is a string
is_string(x)

// Category: List / string functions
// True if `x` is a list/vector
is_list(x)

// Category: List / string functions
// True if `x` is a function value
is_function(x)
