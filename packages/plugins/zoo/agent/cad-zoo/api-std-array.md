# kcl-std — std.array

7 top-level symbols. Signatures are verbatim kcl.

// Apply a function to every element of a list
map(
@array: [any],
f: fn(any): any,
): [any]
// @array: Input array
// f: A function

// Take a starting value
reduce(
@array: [any],
initial: any,
f: fn(any, accum: any): any,
): any
// @array: Each element of this array gets run through the function `f`, combined with the previous output from `f`, and then used for the next run
// initial: The first time `f` is run, it will be called with the first item of `array` and this initial starting value
// f: Run once per item in the input `array`

// Append an element to the end of an array
push(
@array: [any],
item: any,
): [any; 1+]
// @array: The array which you're adding a new item to
// item: The new item to add to the array

// Remove the last element from an array
pop(@array: [any; 1+]): [any]
// @array: The array to pop from

// Combine two arrays into one by concatenating them
concat(
@array: [any],
items: [any],
): [any]
// @array: The array of starting elements
// items: The array of ending elements

// Find the number of elements in an array
count(@array: [any]): number
// @array: The array whose length will be returned

// Functions for manipulating arrays of values
array
