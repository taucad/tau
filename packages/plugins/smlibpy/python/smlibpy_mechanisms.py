"""Read an SMLibPy model's `mechanism`: Tau's shared kinematics source, authored as plain data.

smlibpy has no native joints, so a model states its moving assembly the way the SMLib (smlibwasm) kernel does: a
module-level `mechanism` dict, or a `mechanism(params)` function called with the same validated parameters as `main`,
holding a `MechanismSource` (`@taucad/kinematics`) whose links name the returned shapes. The TypeScript kernel resolves
those names to component ids, moves the mechanism into the GLB frame and admits it with the shared contract.
"""

from __future__ import annotations

import asyncio
from typing import Any

from smlibpy_materials import plain_json


def read_mechanism(module: Any, parameters: Any) -> Any:
    """The entry module's mechanism source as plain JSON, or `None` when it declares none."""

    declaration = getattr(module, "mechanism", None)
    if declaration is None:
        return None
    value = declaration(parameters) if callable(declaration) else declaration
    if asyncio.iscoroutine(value):
        value.close()
        raise TypeError("mechanism(params) must return its source, not a coroutine")
    if value is None:
        return None
    if not isinstance(value, dict):
        raise TypeError("mechanism must be a MechanismSource dict or a mechanism(params) function returning one")
    return plain_json(value, "mechanism")
