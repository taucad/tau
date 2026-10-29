# smlibpy — _kernel

2 top-level symbols. Signatures are verbatim python.

# Category: _kernel
# An SMLib operation failed
# Remarks: ``operation`` names the smlibpy call, ``status`` the kernel status code (e.g. ``SM_ERR_INVALID_INPUT``) and ``hint`` a suggestion when one is known. ``trace`` says where the kernel gave up: the failures it reported during the call, oldest first, at most the last 48, as ``"SM_ERR at SmFilletExecutive.cpp:1603 (DoFillet)"``. It ends with the chain from the deepest function that failed to the kernel's API function; what comes before are errors the kernel recovered from. Empty where the error did not come from a kernel function. For bug reports: the sites change with the kernel.
# smlibpy._kernel.KernelError (class)
class KernelError(ModelingError)

  # smlibpy._kernel.KernelError.__init__ (constructor)
  KernelError(operation: str, detail: str, status: str | None = None, hint: str | None = None)

# Category: _kernel
# A modeling operation cannot be done (for example a fillet radius that does not fit)
# smlibpy._kernel.ModelingError (class)
class ModelingError(RuntimeError)
