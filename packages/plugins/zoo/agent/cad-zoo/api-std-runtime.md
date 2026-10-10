# kcl-std — std.runtime

2 top-level symbols. Signatures are verbatim kcl.

// Category: std.runtime
// Exit the program early
// Remarks: Exiting early can be helpful to see the intermediate output of a program to help debug. Remember to always remove the call to `exit()` after debugging is complete. When `exit()` is used in an imported module, only the imported module exits early. Because imported modules execute concurrently, `exit()` in one module does not affect other modules. On the other hand, if you import a function from another module, and that function calls `exit()`, then calling the function exits the caller.
// EXPERIMENTAL
// std.runtime.exit (function)
exit()

// Category: std.runtime
// Functions for debugging and interacting with the runtime system
// EXPERIMENTAL
runtime
