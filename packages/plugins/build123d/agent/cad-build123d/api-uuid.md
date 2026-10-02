# build123d — uuid

1 top-level symbols. Signatures are verbatim python.

// Category: uuid
// Instances of the UUID class represent UUIDs as specified in RFC 4122
// Remarks: UUID objects are immutable, hashable, and usable as dictionary keys. Converting a UUID to a string with str() yields something in the form '12345678-1234-1234-1234-123456789abc'. The UUID constructor accepts five possible forms: a similar string of hexadecimal digits, or a tuple of six integer fields (with 32-bit, 16-bit, 16-bit, 8-bit, 8-bit, and 48-bit values respectively) as an argument named 'fields', or a string of 16 bytes (with all the integer fields in big-endian order) as an argument named 'bytes', or a string of 16 bytes (with the first three fields in little-endian order) as an argument named 'bytes_le', or a single 128-bit integer as an argument named 'int'. UUIDs have these read-only attributes: bytes the UUID as a 16-byte string (containing the six integer fields in big-endian byte order) bytes_le the UUID as a 16-byte string (with time_low, time_mid, and time_hi_version in little-endian byte order) fields a tuple of the six integer fields of the UUID, which are also available as six individual attributes and two derived attributes: time_low the first 32 bits of the UUID time_mid the next 16 bits of the UUID time_hi_version the next 16 bits of the UUID clock_seq_hi_variant the next 8 bits of the UUID clock_seq_low the next 8 bits of the UUID node the last 48 bits of the UUID time the 60-bit timestamp clock_seq the 14-bit sequence number hex the UUID as a 32-character hexadecimal string int the UUID as a 128-bit integer urn the UUID as a URN as specified in RFC 4122 variant the UUID variant (one of the constants RESERVED_NCS, RFC_4122, RESERVED_MICROSOFT, or RESERVED_FUTURE) version the UUID version number (1 through 5, meaningful only when the variant is RFC_4122) is_safe An enum indicating whether the UUID has been generated in a way that is safe for multiprocessing applications, via uuid_generate_time_safe(3).
UUID

  // Create a UUID from either a string of 32 hexadecimal digits,
  // Remarks: a string of 16 bytes as the 'bytes' argument, a string of 16 bytes in little-endian order as the 'bytes_le' argument, a tuple of six integers (32-bit time_low, 16-bit time_mid, 16-bit time_hi_version, 8-bit clock_seq_hi_variant, 8-bit clock_seq_low, 48-bit node) as the 'fields' argument, or a single 128-bit integer as the 'int' argument. When a string of hex digits is given, curly braces, hyphens, and a URN prefix are all optional. For example, these expressions all yield the same UUID: UUID('{12345678-1234-5678-1234-567812345678}') UUID('12345678123456781234567812345678') UUID('urn:uuid:12345678-1234-5678-1234-567812345678') UUID(bytes='\x12\x34\x56\x78'*4) UUID(bytes_le='\x78\x56\x34\x12\x34\x12\x78\x56' + '\x12\x34\x56\x78\x12\x34\x56\x78') UUID(fields=(0x12345678, 0x1234, 0x5678, 0x12, 0x34, 0x567812345678)) UUID(int=0x12345678123456781234567812345678) Exactly one of 'hex', 'bytes', 'bytes_le', 'fields', or 'int' must be given. The 'version' argument is optional; if given, the resulting UUID will have its variant and version set according to RFC 4122, overriding the given 'hex', 'bytes', 'bytes_le', 'fields', or 'int'. is_safe is an enum exposed as an attribute on the instance. It indicates whether the UUID has been generated in a way that is safe for multiprocessing applications, via uuid_generate_time_safe(3).
  UUID(hex = None, bytes = None, bytes_le = None, fields = None, int = None, version = None, is_safe = SafeUUID.unknown)

  bytes

  bytes_le

  fields

  time_low

  time_mid

  time_hi_version

  clock_seq_hi_variant

  clock_seq_low

  time

  clock_seq

  node

  hex

  urn

  variant

  version
