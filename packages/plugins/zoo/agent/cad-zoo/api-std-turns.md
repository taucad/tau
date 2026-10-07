# kcl-std — std.turns

5 top-level symbols. Signatures are verbatim kcl.

// Category: std.turns
// No turn, zero degrees/radians
turns::ZERO: number(Angle)

// Category: std.turns
// A quarter turn, 90 degrees or π/2 radians
turns::QUARTER_TURN: number(deg)
// Example (Value):
//   turns::QUARTER_TURN = 90deg

// Category: std.turns
// A half turn, 180 degrees or π radians
turns::HALF_TURN: number(deg)
// Example (Value):
//   turns::HALF_TURN = 180deg

// Category: std.turns
// Three quarters of a turn, 270 degrees or 1.5*π radians
turns::THREE_QUARTER_TURN: number(deg)
// Example (Value):
//   turns::THREE_QUARTER_TURN = 270deg

// Category: std.turns
// This module contains a few handy constants for defining turns
turns
