# openrscad — List / string functions

14 top-level symbols. Signatures are verbatim openscad.

// Length of a vector or string
len(value)

// Concatenate vectors/values into one list
concat(a, b, ...)

// Linear-interpolated table lookup
lookup(key, table)

// Concatenate values into a string
str(values...)

// Unicode code point(s) to a string
chr(codes...)

// First character to its Unicode code point
ord(char)

// Find matches in a list/string
search(match, table, num?)

// Name of a user module on the active instantiation stack
parent_module(i=1)

// True if `x` is undefined
is_undef(x)

// True if `x` is a boolean
is_bool(x)

// True if `x` is a number
is_num(x)

// True if `x` is a string
is_string(x)

// True if `x` is a list/vector
is_list(x)

// True if `x` is a function value
is_function(x)
