# build123d — os

2 top-level symbols. Signatures are verbatim python.

// Category: os
// Abstract base class for implementing the file system path protocol
PathLike

// Category: os
// Decode filename (an os.PathLike, bytes, or str) from the filesystem
// Remarks: encoding with 'surrogateescape' error handler, return str unchanged. On
Windows, use 'strict' error handler if the file system encoding is
'mbcs' (which is the default encoding).
fsdecode(filename)
