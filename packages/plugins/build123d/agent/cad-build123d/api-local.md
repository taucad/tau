# build123d — _local

1 top-level symbols. Signatures are verbatim python.

// Category: _local
// PurePath subclass that can make system calls
// Remarks: Path represents a filesystem path but unlike PurePath, also offers methods to do system calls on path objects. Depending on your system, instantiating a Path will return either a PosixPath or a WindowsPath object. You can also instantiate a PosixPath or WindowsPath directly, but cannot instantiate a WindowsPath on a POSIX system or vice versa.
Path

  // Return the path as a URI
  // pathlib._local.Path.as_uri (method)
  as_uri()

  // pathlib._local.Path.__init__ (constructor)
  Path(*args, **kwargs)

  // Return the result of the stat() system call on this path, like
  // Remarks: os.stat() does.
  // pathlib._local.Path.stat (method)
  stat(follow_symlinks = True)

  // Check if this path is a mount point
  // pathlib._local.Path.is_mount (method)
  is_mount()

  // Whether this path is a junction
  // pathlib._local.Path.is_junction (method)
  is_junction()

  // Open the file pointed to by this path and return a file object, as
  // Remarks: the built-in open() function does.
  // pathlib._local.Path.open (method)
  open(mode = 'r', buffering = -1, encoding = None, errors = None, newline = None)

  // Open the file in text mode, read it, and close the file
  // pathlib._local.Path.read_text (method)
  read_text(encoding = None, errors = None, newline = None)

  // Open the file in text mode, write to it, and close the file
  // pathlib._local.Path.write_text (method)
  write_text(data, encoding = None, errors = None, newline = None)

  // Yield path objects of the directory contents
  // Remarks: The children are yielded in arbitrary order, and the special entries '.' and '..' are not included.
  // pathlib._local.Path.iterdir (method)
  iterdir()

  // Iterate over this subtree and yield all existing files (of any
  // Remarks: kind, including directories) matching the given relative pattern.
  // pathlib._local.Path.glob (method)
  glob(pattern, case_sensitive = None, recurse_symlinks = False)

  // Recursively yield all existing files (of any kind, including
  // Remarks: directories) matching the given relative pattern, anywhere in this subtree.
  // pathlib._local.Path.rglob (method)
  rglob(pattern, case_sensitive = None, recurse_symlinks = False)

  // Walk the directory tree from this directory, similar to os.walk()
  // pathlib._local.Path.walk (method)
  walk(top_down = True, on_error = None, follow_symlinks = False)

  // Return an absolute version of this path
  // Remarks: No normalization or symlink resolution is performed. Use resolve() to resolve symlinks and remove '..' segments.
  // pathlib._local.Path.absolute (method)
  absolute()

  // Make the path absolute, resolving all symlinks on the way and also
  // Remarks: normalizing it.
  // pathlib._local.Path.resolve (method)
  resolve(strict = False)

  // Return the login name of the file owner
  // pathlib._local.Path.owner (method)
  owner(follow_symlinks = True)

  // Return the group name of the file gid
  // pathlib._local.Path.group (method)
  group(follow_symlinks = True)

  // Return the path to which the symbolic link points
  // pathlib._local.Path.readlink (method)
  readlink()

  // Create this file with the given access mode, if it doesn't exist
  // pathlib._local.Path.touch (method)
  touch(mode = 438, exist_ok = True)

  // Create a new directory at this given path
  // pathlib._local.Path.mkdir (method)
  mkdir(mode = 511, parents = False, exist_ok = False)

  // Change the permissions of the path, like os.chmod()
  // pathlib._local.Path.chmod (method)
  chmod(mode, follow_symlinks = True)

  // Remove this file or link
  // Remarks: If the path is a directory, use rmdir() instead.
  // pathlib._local.Path.unlink (method)
  unlink(missing_ok = False)

  // Remove this directory
  // pathlib._local.Path.rmdir (method)
  rmdir()

  // Rename this path to the target path
  // Remarks: The target path may be absolute or relative. Relative paths are interpreted relative to the current working directory, *not* the directory of the Path object. Returns the new Path instance pointing to the target path.
  // pathlib._local.Path.rename (method)
  rename(target)

  // Rename this path to the target path, overwriting if that path exists
  // Remarks: The target path may be absolute or relative. Relative paths are interpreted relative to the current working directory, *not* the directory of the Path object. Returns the new Path instance pointing to the target path.
  // pathlib._local.Path.replace (method)
  replace(target)

  // Make this path a symlink pointing to the target path
  // Remarks: Note the order of arguments (link, target) is the reverse of os.symlink.
  // pathlib._local.Path.symlink_to (method)
  symlink_to(target, target_is_directory = False)

  // Make this path a hard link pointing to the same file as *target*
  // Remarks: Note the order of arguments (self, target) is the reverse of os.link's.
  // pathlib._local.Path.hardlink_to (method)
  hardlink_to(target)

  // Return a new path with expanded ~ and ~user constructs
  // Remarks: (as returned by os.path.expanduser)
  // pathlib._local.Path.expanduser (method)
  expanduser()

  // Return a new path from the given 'file' URI
  // pathlib._local.Path.from_uri (method)
  from_uri(uri)
