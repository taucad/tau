# build123d — \_local

1 top-level symbols. Signatures are verbatim python.

// PurePath subclass that can make system calls
Path

// Return the path as a URI
as_uri()

Path(\*args, \*\*kwargs)

// Return the result of the stat() system call on this path, like
stat(follow_symlinks = True)

// Check if this path is a mount point
is_mount()

// Whether this path is a junction
is_junction()

// Open the file pointed to by this path and return a file object, as
open(mode = 'r', buffering = -1, encoding = None, errors = None, newline = None)

// Open the file in text mode, read it, and close the file
read_text(encoding = None, errors = None, newline = None)

// Open the file in text mode, write to it, and close the file
write_text(data, encoding = None, errors = None, newline = None)

// Yield path objects of the directory contents
iterdir()

// Iterate over this subtree and yield all existing files (of any
glob(pattern, case_sensitive = None, recurse_symlinks = False)

// Recursively yield all existing files (of any kind, including
rglob(pattern, case_sensitive = None, recurse_symlinks = False)

// Walk the directory tree from this directory, similar to os.walk()
walk(top_down = True, on_error = None, follow_symlinks = False)

// Return an absolute version of this path
absolute()

// Make the path absolute, resolving all symlinks on the way and also
resolve(strict = False)

// Return the login name of the file owner
owner(follow_symlinks = True)

// Return the group name of the file gid
group(follow_symlinks = True)

// Return the path to which the symbolic link points
readlink()

// Create this file with the given access mode, if it doesn't exist
touch(mode = 438, exist_ok = True)

// Create a new directory at this given path
mkdir(mode = 511, parents = False, exist_ok = False)

// Change the permissions of the path, like os.chmod()
chmod(mode, follow_symlinks = True)

// Remove this file or link
unlink(missing_ok = False)

// Remove this directory
rmdir()

// Rename this path to the target path
rename(target)

// Rename this path to the target path, overwriting if that path exists
replace(target)

// Make this path a symlink pointing to the target path
symlink_to(target, target_is_directory = False)

// Make this path a hard link pointing to the same file as _target_
hardlink_to(target)

// Return a new path with expanded ~ and ~user constructs
expanduser()

// Return a new path from the given 'file' URI
from_uri(uri)
