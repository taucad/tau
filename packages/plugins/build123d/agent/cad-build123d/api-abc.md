# build123d — abc

6 top-level symbols. Signatures are verbatim python.

// Helper class that provides a standard way to create an ABC using
ABC

Callable

Collection

Iterable

// All the operations on a read-only sequence
Sequence

  // S.index(value, [start, [stop]]) -> integer -- return first index of
  index(value, start = 0, stop = None)

  // S.count(value) -> integer -- return number of occurrences of value
  count(value)

// A decorator indicating abstract methods
abstractmethod(funcobj)
