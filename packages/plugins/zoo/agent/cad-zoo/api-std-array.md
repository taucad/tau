# kcl-std — std.array

7 top-level symbols. Signatures are verbatim kcl.

// Category: std.array
// Apply a function to every element of a list
// Remarks: Given a list like `[a, b, c]`, and a function like `f`, returns
`[f(a), f(b), f(c)]`
map(
  @array: [any],
  f: fn(any): any,
): [any]
//   @array: Input array
//   f: A function

// Category: std.array
// Take a starting value
reduce(
  @array: [any],
  initial: any,
  f: fn(any, accum: any): any,
): any
//   @array: Each element of this array gets run through the function `f`, combined with the previous output from `f`, and then used for the next run
//   initial: The first time `f` is run, it will be called with the first item of `array` and this initial starting value
//   f: Run once per item in the input `array`

// Category: std.array
// Append an element to the end of an array
// Remarks: Returns a new array with the element appended.
push(
  @array: [any],
  item: any,
): [any; 1+]
//   @array: The array which you're adding a new item to
//   item: The new item to add to the array

// Category: std.array
// Remove the last element from an array
// Remarks: Returns a new array with the last element removed.
pop(@array: [any; 1+]): [any]
//   @array: The array to pop from

// Category: std.array
// Combine two arrays into one by concatenating them
// Remarks: Returns a new array with the all the elements of the first array followed by all the elements of the second array.
concat(
  @array: [any],
  items: [any],
): [any]
//   @array: The array of starting elements
//   items: The array of ending elements

// Category: std.array
// Find the number of elements in an array
count(@array: [any]): number
//   @array: The array whose length will be returned

// Category: std.array
// Functions for manipulating arrays of values
array
