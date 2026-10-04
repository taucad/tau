# build123d — abc

6 top-level symbols. Signatures are verbatim python.

// Category: abc
// Helper class that provides a standard way to create an ABC using
// Remarks: inheritance.
ABC

// Category: abc
Callable

// Category: abc
Collection

// Category: abc
Iterable

// Category: abc
// All the operations on a read-only sequence
// Remarks: Concrete subclasses must override __new__ or __init__, __getitem__, and __len__.
Sequence

  // S.index(value, [start, [stop]]) -> integer -- return first index of
  // Remarks: value. Raises ValueError if the value is not present. Supporting start and stop arguments is optional, but recommended.
  // collections.abc.Sequence.index (method)
  index(value, start = 0, stop = None)

  // S.count(value) -> integer -- return number of occurrences of value
  // collections.abc.Sequence.count (method)
  count(value)

// Category: abc
// A decorator indicating abstract methods
// Remarks: Requires that the metaclass is ABCMeta or derived from it. A class that has a metaclass derived from ABCMeta cannot be instantiated unless all of its abstract methods are overridden. The abstract methods can be called using any of the normal 'super' call mechanisms. abstractmethod() may be used to declare abstract methods for properties and descriptors. Usage: class C(metaclass=ABCMeta): @abstractmethod def my_abstract_method(self, arg1, arg2, argN): ...
// abc.abstractmethod (function)
abstractmethod(funcobj)
