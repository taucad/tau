"""Doubles' ``evaluate_claim``: their plan and result framed as the native engine frames them."""

import json
import struct


def claim_frame(plan, evaluate_plan):
    """Return ``u32le plan length, u32le claim length, plan, claim, result`` for a one-claim plan."""
    claim = json.dumps(
        json.loads(plan)["plan"]["claims"][0], ensure_ascii=False, separators=(",", ":")
    ).encode()
    return struct.pack("<II", len(plan), len(claim)) + plan + claim + evaluate_plan(plan)
