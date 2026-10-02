# build123d — enum

4 top-level symbols. Signatures are verbatim python.

// Category: enum
// Create a collection of name/value pairs
// Remarks: Example enumeration: >>> class Color(Enum): ... RED = 1 ... BLUE = 2 ... GREEN = 3 Access them by: - attribute access: >>> Color.RED <Color.RED: 1> - value lookup: >>> Color(1) <Color.RED: 1> - name lookup: >>> Color['RED'] <Color.RED: 1> Enumerations can be iterated over, and know how many members they have: >>> len(Color) 3 >>> list(Color) [<Color.RED: 1>, <Color.BLUE: 2>, <Color.GREEN: 3>] Methods can be added to enumerations, and members can have their own attributes -- see the documentation for details.
Enum

// Category: enum
// Enum where members are also (and must be) ints
IntEnum

// Category: enum
// Instances are replaced with an appropriate value in Enum class suites
auto

  auto(value = _auto_null)

// Category: enum
// Class decorator for enumerations ensuring unique member values
unique(enumeration)
