# build123d — typing

8 top-level symbols. Signatures are verbatim python.

// Category: typing
// Special type indicating an unconstrained type
// Remarks: - Any is assignable to every type.
- Any assumed to have all methods and attributes.
- All values are assignable to Any.

Note that all the above statements are true from the point of view of
static type checkers. At runtime, Any cannot be used with instance
checks.
Any

// Category: typing
// Typed approximation of the return of open() in binary mode
BinaryIO

  write(s: Union[bytes, bytearray]) -> int

// Category: typing
// Abstract base class for generic types
// Remarks: On Python 3.12 and newer, generic classes implicitly inherit from
Generic when they declare a parameter list after the class's name::

    class Mapping[KT, VT]:
        def __getitem__(self, key: KT) -> VT:
            ...
        # Etc.

On older versions of Python, however, generic classes have to
explicitly inherit from Generic.

After a class has been declared to be generic, it can then be used as
follows::

    def lookup_name[KT, VT](mapping: Mapping[KT, VT], key: KT, default: VT) -> VT:
        try:
            return mapping[key]
        except KeyError:
            return default
Generic

// Category: typing
// Typed approximation of the return of open() in text mode
TextIO

  buffer: BinaryIO

  encoding: str

  errors: Optional[str]

  line_buffering: bool

  newlines: Any

// Category: typing
// Type variable
// Remarks: The preferred way to construct a type variable is via the dedicated
syntax for generic functions, classes, and type aliases::

    class Sequence[T]:  # T is a TypeVar
        ...

This syntax can also be used to create bound and constrained type
variables::

    # S is a TypeVar bound to str
    class StrSequence[S: str]:
        ...

    # A is a TypeVar constrained to str or bytes
    class StrOrBytesSequence[A: (str, bytes)]:
        ...

Type variables can also have defaults:

    class IntDefault[T = int]:
        ...

However, if desired, reusable type variables can also be constructed
manually, like so::

   T = TypeVar('T')  # Can be anything
   S = TypeVar('S', bound=str)  # Can be any subtype of str
   A = TypeVar('A', str, bytes)  # Must be exactly str or bytes
   D = TypeVar('D', default=int)  # Defaults to int

Type variables exist primarily for the benefit of static type
checkers.  They serve as the parameters for generic types as well
as for generic function and type alias definitions.

The variance of type variables is inferred by type checkers when they
are created through the type parameter syntax and when
``infer_variance=True`` is passed. Manually created type variables may
be explicitly marked covariant or contravariant by passing
``covariant=True`` or ``contravariant=True``. By default, manually
created type variables are invariant. See PEP 484 and PEP 695 for more
details.
TypeVar

  has_default()

// Category: typing
// Cast a value to a type
// Remarks: This returns the value unchanged.  To the type checker this
signals that the return value has the designated type, but at
runtime we intentionally don't check anything (we want this
to be as fast as possible).
cast(typ, val)

// Category: typing
// Decorator for overloaded functions/methods
// Remarks: In a non-stub file, place two or more stub definitions for the same
function in a row, each decorated with @overload, followed
by an implementation.  The implementation should *not*
be decorated with @overload::

    @overload
    def utf8(value: None) -> None: ...
    @overload
    def utf8(value: bytes) -> bytes: ...
    @overload
    def utf8(value: str) -> bytes: ...
    def utf8(value):
        ...  # implementation goes here

In a stub file or in an abstract method (for example, in a Protocol definition),
the implementation may be omitted::

    @overload
    def utf8(value: None) -> None: ...
    @overload
    def utf8(value: bytes) -> bytes: ...
    @overload
    def utf8(value: str) -> bytes: ...

The overloads for a function can be retrieved at runtime using the
get_overloads() function.
overload(func)

// Category: typing
// Cast a value to a type
// Remarks: This returns the value unchanged.  To the type checker this
signals that the return value has the designated type, but at
runtime we intentionally don't check anything (we want this
to be as fast as possible).
tcast(typ, val)
