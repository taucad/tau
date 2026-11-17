---
python-kernel-core: minor
build123d: minor
smlibpy: minor
---

Python kernels declare a Windows x64 closure. The shared `interpreter.json` pins python-build-standalone's `x86_64-pc-windows-msvc` CPython 3.13.15, and the generator selects `win_amd64` wheels by Windows' own markers (`os_name` `nt`, `sys_platform` `win32`, `platform_machine` `AMD64`). Wheels unpack into `python/Lib/site-packages`, and the variant's floor is Windows 10 (`minimumOsVersion` `10.0`). Build123d and SMLibPy each gain a `win32-x64` variant and a `pylock.win32-x64.toml`. Windows on Arm selects the x64 closure under emulation, because OCP and SMLib publish no `win_arm64` wheel.

A sealed closure launches `python\python.exe` on Windows (`pythonInterpreterPath`), and a session's default runtime root is the interpreter's own directory there. The seal's compileall skips shipped bytecode with one pattern grouped by directory (`shippedBytecodeExclusion`), which matches either path separator. Windows' interpreter ships 566 compiled sources, so one absolute path per source would exceed the 32,767-character command line.

The host still refuses native kernels on Windows until the Windows sandbox runs them.

The seal step passes the interpreter's verified digest to every sandboxed run, as the Windows sandbox requires. On Windows, compileall runs from a staged copy of `python.exe` and its DLLs outside the closure it writes, because the sandbox never runs an executable from a folder it may also write. A `python._pth` file names the closure's standard library for that copy.
