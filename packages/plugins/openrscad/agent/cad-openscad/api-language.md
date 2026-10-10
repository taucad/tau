# openrscad — Language

10 top-level symbols. Signatures are verbatim openscad.

// Category: Language
// Declare a module, instantiated as a statement with optional children
// module (module)
module name(param, option = default) { children(); }

// Category: Language
// Declare a function, or bind a function literal to a variable
// Remarks: Call either form as name(...) or f(...).
// function (function)
function name(param, option = default) = expression;
f = function (x) expression;

// Category: Language
// Splice a file in place, running its top-level statements and assignments
// include (module)
include <path/file.scad>

// Category: Language
// Import only the modules and functions a file declares
// use (module)
use <path/file.scad>

// Category: Language
// Splice a list or range into the enclosing list
// each (function)
[each list, item]
[for (list = lists) each list]

// Category: Language
// Number of children passed to the current module
$children

// Category: Language
// Highlight a subtree in the preview
// # (module)
#cube(10);

// Category: Language
// Show a subtree as a transparent background, excluded from the result
// % (module)
%cube(10);

// Category: Language
// Render only this subtree
// ! (module)
!cube(10);

// Category: Language
// Disable a subtree
// * (module)
*cube(10);
