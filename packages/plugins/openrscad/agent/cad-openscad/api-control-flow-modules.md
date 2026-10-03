# openrscad — Control-flow modules

8 top-level symbols. Signatures are verbatim openscad.

// Category: Control-flow modules
// Iterate, instantiating children per value
// for (module)
for (var = range) ...

// Category: Control-flow modules
// Intersect children across all iterations
// intersection_for (module)
intersection_for (var = range) ...

// Category: Control-flow modules
// Conditionally instantiate children
// if (module)
if (cond) ... else ...

// Category: Control-flow modules
// Bind variables for the children scope
// let (module)
let (var = value) ...

// Category: Control-flow modules
// Instantiate the children passed to a module
// children (module)
children(idx?)

// Category: Control-flow modules
// Print values to the console
// echo (module)
echo(values...)

// Category: Control-flow modules
// Abort with a message if `cond` is false
// assert (module)
assert(cond, message?)

// Category: Control-flow modules
// Force a full CSG render of children
// render (module)
render(convexity)
