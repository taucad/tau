# build123d — typing

8 top-level symbols. Signatures are verbatim python.

// Special type indicating an unconstrained type
Any

// Typed approximation of the return of open() in binary mode
BinaryIO

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

  has_default()

// Cast a value to a type
cast(typ, val)

// Decorator for overloaded functions/methods
overload(func)

// Cast a value to a type
tcast(typ, val)
