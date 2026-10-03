# build123d — dataclasses

1 top-level symbols. Signatures are verbatim python.

// Category: dataclasses
// Add dunder methods based on the fields defined in the class
// Remarks: Examines PEP 526 __annotations__ to determine fields. If init is true, an __init__() method is added to the class. If repr is true, a __repr__() method is added. If order is true, rich comparison dunder methods are added. If unsafe_hash is true, a __hash__() method is added. If frozen is true, fields may not be assigned to after instance creation. If match_args is true, the __match_args__ tuple is added. If kw_only is true, then by default all fields are keyword-only. If slots is true, a new class with a __slots__ attribute is returned.
// dataclasses.dataclass (function)
dataclass(init = True, repr = True, eq = True, order = False, unsafe_hash = False, frozen = False, match_args = True, kw_only = False, slots = False, weakref_slot = False)
