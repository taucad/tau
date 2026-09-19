# openrscad — Control-flow modules

8 top-level symbols. Signatures are verbatim openscad.

// Iterate, instantiating children per value
for (var = range) ...

// Intersect children across all iterations
intersection_for (var = range) ...

// Conditionally instantiate children
if (cond) ... else ...

// Bind variables for the children scope
let (var = value) ...

// Instantiate the children passed to a module
children(idx?)

// Print values to the console
echo(values...)

// Abort with a message if `cond` is false
assert(cond, message?)

// Force a full CSG render of children
render(convexity)
