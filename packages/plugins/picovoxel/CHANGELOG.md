# Changelog

## 0.1.0-beta.0

- Add the PicoVoxel kernel: fast-lane viewer renders on the serial or multi-threaded build, exact
  exports on the serial build, indexed GLB meshes, stamped fast STL export, and a typed refusal for
  fast GLB export. Depends on the vendored `picovoxel@0.1.0` candidate until it is on npm.
- Keep one warm PicoVoxel runtime per build per worker, cancel superseded renders cooperatively, dispose
  sessions a model creates, rebuild an out-of-memory multi render on the serial build with a warning,
  refuse fast-lane data in exact builds with a typed issue, and drop exactly-zero-area triangles.
