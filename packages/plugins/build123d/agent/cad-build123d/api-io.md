# build123d — \_io

1 top-level symbols. Signatures are verbatim python.

// Buffered I/O implementation using an in-memory bytes buffer
BytesIO

// Initialize self
BytesIO(\*args, \*\*kwargs)

// Returns True if the IO object can be read
readable()

// Returns True if the IO object can be seeked
seekable()

// Returns True if the IO object can be written
writable()

// Disable all I/O operations
close()

// Does nothing
flush()

// Always returns False
isatty()

// Current file position, an integer
tell()

// Write bytes to file
write(b)

// Write lines to the file
writelines(lines)

// Read at most size bytes, returned as a bytes object
read1(size = -1)

// Read bytes into buffer
readinto(buffer)

// Next line from the file, as a bytes object
readline(size = -1)

// List of bytes objects, each a line from the file
readlines(size = None)

// Read at most size bytes, returned as a bytes object
read(size = -1)

// Get a read-write view over the contents of the BytesIO object
getbuffer()

// Retrieve the entire contents of the BytesIO object
getvalue()

// Change stream position
seek(pos, whence = 0)

// Truncate the file to at most size bytes
truncate(size = None)
