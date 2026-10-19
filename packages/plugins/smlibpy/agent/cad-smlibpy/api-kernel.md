# smlibpy — _kernel

2 top-level symbols. Signatures are verbatim python.

# Category: _kernel
# An SMLib operation failed
# Remarks: ``operation`` names the smlibpy call, ``status`` the kernel status code (e.g. ``SM_ERR_INVALID_INPUT``) and ``hint`` a suggestion when one is known.
# smlibpy._kernel.KernelError (class)
class KernelError(ModelingError)

  # smlibpy._kernel.KernelError.__init__ (constructor)
  KernelError(operation: str, detail: str, status: str | None = None, hint: str | None = None)

# Category: _kernel
# A modeling operation cannot be done (for example a fillet radius that does not fit)
# smlibpy._kernel.ModelingError (class)
class ModelingError(RuntimeError)
