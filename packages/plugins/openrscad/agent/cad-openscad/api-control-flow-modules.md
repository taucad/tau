# openrscad — Control-flow modules

8 top-level symbols. Signatures are verbatim openscad.

// Category: Control-flow modules
// Iterate, instantiating children per value
// Remarks: Ranges include their end. In a list comprehension, for yields one element per value.
// for (module)
for (i = [start : end]) children
for (i = [start : step : end]) children
for (item = [a, b, c]) children
for (i = [0 : 2], j = [0 : 2]) children
[for (i = [start : end]) expression]
[for (i = 0; i < n; i = i + 1) expression]

// Category: Control-flow modules
// Intersect children across all iterations
// intersection_for (module)
intersection_for (i = [start : end]) children

// Category: Control-flow modules
// Conditionally instantiate children
// if (module)
if (condition) children
if (condition) children else children
[for (x = list) if (condition) x]

// Category: Control-flow modules
// Bind variables for the children scope
// let (module)
let (name = value) children
y = let (name = value) expression;
[for (i = [start : end]) let (name = value) expression]

// Category: Control-flow modules
// Instantiate the children passed to a module
// Remarks: $children counts the children passed in.
// children (module)
children()
children(index)
children([i, j])
children([start : end])

// Category: Control-flow modules
// Print values to the console
// Remarks: A named argument prints as name = value.
// echo (module)
echo(value, ...)
y = echo(value) expression;

// Category: Control-flow modules
// Abort with a message if `cond` is false
// assert (module)
assert(condition, message)
y = assert(condition, message) expression;

// Category: Control-flow modules
// Force a full CSG render of children
// Remarks: A passthrough in OpenRSCAD.
// render (module)
render()
