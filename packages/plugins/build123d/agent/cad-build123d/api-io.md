# build123d — _io

1 top-level symbols. Signatures are verbatim python.

// Category: _io
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
  // Remarks: BytesIO objects are not connected to a TTY-like device.
  // _io.BytesIO.isatty (method)
  isatty()

  // Current file position, an integer
  // _io.BytesIO.tell (method)
  tell()

  // Write bytes to file
  // Remarks: Return the number of bytes written.
  // _io.BytesIO.write (method)
  write(b)

  // Write lines to the file
  // Remarks: Note that newlines are not added. lines can be any iterable object producing bytes-like objects. This is equivalent to calling write() for each element.
  // _io.BytesIO.writelines (method)
  writelines(lines)

  // Read at most size bytes, returned as a bytes object
  // Remarks: If the size argument is negative or omitted, read until EOF is reached. Return an empty bytes object at EOF.
  // _io.BytesIO.read1 (method)
  read1(size = -1)

  // Read bytes into buffer
  // Remarks: Returns number of bytes read (0 for EOF), or None if the object is set not to block and has no data to read.
  // _io.BytesIO.readinto (method)
  readinto(buffer)

  // Next line from the file, as a bytes object
  // Remarks: Retain newline. A non-negative size argument limits the maximum number of bytes to return (an incomplete line may be returned then). Return an empty bytes object at EOF.
  // _io.BytesIO.readline (method)
  readline(size = -1)

  // List of bytes objects, each a line from the file
  // Remarks: Call readline() repeatedly and return a list of the lines so read. The optional size argument, if given, is an approximate bound on the total number of bytes in the lines returned.
  // _io.BytesIO.readlines (method)
  readlines(size = None)

  // Read at most size bytes, returned as a bytes object
  // Remarks: If the size argument is negative, read until EOF is reached. Return an empty bytes object at EOF.
  // _io.BytesIO.read (method)
  read(size = -1)

  // Get a read-write view over the contents of the BytesIO object
  // _io.BytesIO.getbuffer (method)
  getbuffer()

  // Retrieve the entire contents of the BytesIO object
  // _io.BytesIO.getvalue (method)
  getvalue()

  // Change stream position
  // Remarks: Seek to byte offset pos relative to position indicated by whence: 0 Start of stream (the default). pos should be >= 0; 1 Current position - pos may be negative; 2 End of stream - pos usually negative. Returns the new absolute position.
  // _io.BytesIO.seek (method)
  seek(pos, whence = 0)

  // Truncate the file to at most size bytes
  // Remarks: Size defaults to the current file position, as returned by tell(). The current file position is unchanged. Returns the new size.
  // _io.BytesIO.truncate (method)
  truncate(size = None)
