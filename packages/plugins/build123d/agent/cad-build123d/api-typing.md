# build123d — typing

8 top-level symbols. Signatures are verbatim python.

// Special type indicating an unconstrained type
Any

// Typed approximation of the return of open() in binary mode
BinaryIO

  // typing.BinaryIO.write (method)
  write(s: Union[bytes, bytearray]) -> int

// Abstract base class for generic types
Generic

// Typed approximation of the return of open() in text mode
TextIO

  buffer: BinaryIO

  encoding: str

  errors: Optional[str]

  line_buffering: bool

  newlines: Any

// Type variable
TypeVar

  // typing.TypeVar.has_default (method)
  has_default()

// Cast a value to a type
// typing.cast (function)
cast(typ, val)

// Decorator for overloaded functions/methods
// typing.overload (function)
overload(func)

// Cast a value to a type
// typing.tcast (function)
tcast(typ, val)
