# openrscad — Control-flow modules

8 top-level symbols. Signatures are verbatim openscad.

// Iterate, instantiating children per value
// for (module)
for (var = range) ...

// Intersect children across all iterations
// intersection_for (module)
intersection_for (var = range) ...

// Conditionally instantiate children
// if (module)
if (cond) ... else ...

// Bind variables for the children scope
// let (module)
let (var = value) ...

// Instantiate the children passed to a module
// children (module)
children(idx?)

// Print values to the console
// echo (module)
echo(values...)

// Abort with a message if `cond` is false
// assert (module)
assert(cond, message?)

// Force a full CSG render of children
// render (module)
render(convexity)
