# build123d — _io

1 top-level symbols. Signatures are verbatim python.

// Buffered I/O implementation using an in-memory bytes buffer
BytesIO

  // Initialize self
  // _io.BytesIO.__init__ (constructor)
  BytesIO(*args, **kwargs)

  // Returns True if the IO object can be read
  // _io.BytesIO.readable (method)
  readable()

  // Returns True if the IO object can be seeked
  // _io.BytesIO.seekable (method)
  seekable()

  // Returns True if the IO object can be written
  // _io.BytesIO.writable (method)
  writable()

  // Disable all I/O operations
  // _io.BytesIO.close (method)
  close()

  // Does nothing
  // _io.BytesIO.flush (method)
  flush()

  // Always returns False
  // _io.BytesIO.isatty (method)
  isatty()

  // Current file position, an integer
  // _io.BytesIO.tell (method)
  tell()

  // Write bytes to file
  // _io.BytesIO.write (method)
  write(b)

  // Write lines to the file
  // _io.BytesIO.writelines (method)
  writelines(lines)

  // Read at most size bytes, returned as a bytes object
  // _io.BytesIO.read1 (method)
  read1(size = -1)

  // Read bytes into buffer
  // _io.BytesIO.readinto (method)
  readinto(buffer)

  // Next line from the file, as a bytes object
  // _io.BytesIO.readline (method)
  readline(size = -1)

  // List of bytes objects, each a line from the file
  // _io.BytesIO.readlines (method)
  readlines(size = None)

  // Read at most size bytes, returned as a bytes object
  // _io.BytesIO.read (method)
  read(size = -1)

  // Get a read-write view over the contents of the BytesIO object
  // _io.BytesIO.getbuffer (method)
  getbuffer()

  // Retrieve the entire contents of the BytesIO object
  // _io.BytesIO.getvalue (method)
  getvalue()

  // Change stream position
  // _io.BytesIO.seek (method)
  seek(pos, whence = 0)

  // Truncate the file to at most size bytes
  // _io.BytesIO.truncate (method)
  truncate(size = None)
