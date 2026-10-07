# kcl-std — std.array

9 top-level symbols. Signatures are verbatim kcl.

// Category: std.array
// Apply a function to every element of a list
// Remarks: Given a list like `[a, b, c]`, and a function like `f`, returns `[f(a), f(b), f(c)]`
// std.array.map (function)
map(
  @array: [any],
  f: fn(any): any,
): [any]
//   @array: Input array
//   f: A function
// Example (Legacy sketch syntax (deprecated in KCL 2.0)):
//   r = 10 // radius
//   fn drawCircle(@id) {
//     return startSketchOn(XY)
//       |> circle( center= [id * 2 * r, 0], radius= r)
//   }
//   
//   // Call `drawCircle`, passing in each element of the array.
//   // The outputs from each `drawCircle` form a new array,
//   // which is the return value from `map`.
//   circles = map(
//     [1..3],
//     f = drawCircle
//   )

// Category: std.array
// Take a starting value
// std.array.reduce (function)
reduce(
  @array: [any],
  initial: any,
  f: fn(any, accum: any): any,
): any
//   @array: Each element of this array gets run through the function `f`, combined with the previous output from `f`, and then used for the next run
//   initial: The first time `f` is run, it will be called with the first item of `array` and this initial starting value
//   f: Run once per item in the input `array`
// Example:
//   // This function adds two numbers.
//   fn add(@a, accum) { return a + accum }
//   
//   // This function adds an array of numbers.
//   // It uses the `reduce` function, to call the `add` function on every
//   // element of the `arr` parameter. The starting value is 0.
//   fn sum(@arr) { return reduce(arr, initial = 0, f = add) }
//   
//   /*
//   The above is basically like this pseudo-code:
//   fn sum(arr):
//       sumSoFar = 0
//       for i in arr:
//           sumSoFar = add(i, sumSoFar)
//       return sumSoFar
//   */
//   
//   // We use `assert` to check that our `sum` function gives the
//   // expected result. It's good to check your work!
//   assert(sum([1, 2, 3]), isEqualTo = 6, tolerance = 0.1, error = "1 + 2 + 3 summed is 6")

// Category: std.array
// Append an element to the end of an array
// Remarks: Returns a new array with the element appended.
// std.array.push (function)
push(
  @array: [any],
  item: any,
): [any; 1+]
//   @array: The array which you're adding a new item to
//   item: The new item to add to the array
// Example:
//   arr = [1, 2, 3]
//   new_arr = push(arr, item = 4)
//   assert(new_arr[3], isEqualTo = 4, tolerance = 0.1, error = "4 was added to the end of the array")

// Category: std.array
// Remove the last element from an array
// Remarks: Returns a new array with the last element removed.
// std.array.pop (function)
pop(@array: [any; 1+]): [any]
//   @array: The array to pop from
// Example:
//   arr = [1, 2, 3, 4]
//   new_arr = pop(arr)
//   assert(new_arr[0], isEqualTo = 1, tolerance = 0.00001, error = "1 is the first element of the array")
//   assert(new_arr[1], isEqualTo = 2, tolerance = 0.00001, error = "2 is the second element of the array")
//   assert(new_arr[2], isEqualTo = 3, tolerance = 0.00001, error = "3 is the third element of the array")

// Category: std.array
// Combine two arrays into one by concatenating them
// Remarks: Returns a new array with the all the elements of the first array followed by all the elements of the second array.
// std.array.concat (function)
concat(
  @array: [any],
  items: [any],
): [any]
//   @array: The array of starting elements
//   items: The array of ending elements
// Example:
//   arr1 = [10, 20, 30]
//   arr2 = [40, 50, 60]
//   newArr = concat(arr1, items = arr2)
//   assert(newArr[0], isEqualTo = 10, tolerance = 0.00001)
//   assert(newArr[1], isEqualTo = 20, tolerance = 0.00001)
//   assert(newArr[2], isEqualTo = 30, tolerance = 0.00001)
//   assert(newArr[3], isEqualTo = 40, tolerance = 0.00001)
//   assert(newArr[4], isEqualTo = 50, tolerance = 0.00001)
//   assert(newArr[5], isEqualTo = 60, tolerance = 0.00001)
//   assert(count(newArr), isEqualTo = 6, tolerance = 0.00001)

// Category: std.array
// Get a subarray from `start` (inclusive) to `end` (exclusive)
// Remarks: Returns a new array containing the elements in the requested range. Negative indexes count from the end of the array, so `-1` is the last element, `-2` is the second-to-last element, and so on. If `start` is omitted, it defaults to `0`. If `end` is omitted, it defaults to the length of the array. It is an error to omit both `start` and `end`. Arrays are immutable, so there's no need to copy the whole array.
// std.array.slice (function)
slice(
  @array: [any],
  start?: number(_),
  end?: number(_),
): [any]
//   @array: The array to slice
//   start: The starting index (inclusive)
//   end: The ending index (exclusive)
// Example:
//   s = slice([1, 2, 3, 4, 5], start = 1, end = 3)
//   assert(s[0], isEqualTo = 2)
//   assert(s[1], isEqualTo = 3)
//   assert(count(s), isEqualTo = 2)

// Category: std.array
// Flatten an array by one level
// Remarks: Returns a new array where any nested arrays are expanded into the top-level array. This only flattens one level deep.
// std.array.flatten (function)
flatten(@array: [any]): [any]
//   @array: The array to flatten by one level
// Example:
//   arr = [1, [2, 3], 4]
//   flat = flatten(arr)
//   assert(flat[0], isEqualTo = 1)
//   assert(flat[1], isEqualTo = 2)
//   assert(flat[2], isEqualTo = 3)
//   assert(flat[3], isEqualTo = 4)

// Category: std.array
// Find the number of elements in an array
// std.array.count (function)
count(@array: [any]): number
//   @array: The array whose length will be returned
// Example:
//   arr1 = [10, 20, 30]
//   assert(count(arr1), isEqualTo = 3)

// Category: std.array
// Functions for manipulating arrays of values
array
