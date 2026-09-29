------------------------------ MODULE MC_LogFence ------------------------------
(* Apalache instance of LogFence. Three writers stand for two workers and    *)
(* S4's follower. IndInit starts from an arbitrary IndInv state whose log   *)
(* holds at most six rows; epochs and view lengths are unbounded integers.  *)
(* No EXTENDS Apalache (its Gen): the runner's SANY pass has no Apalache    *)
(* library, so the arbitrary state is built from existentials over Int.     *)
EXTENDS LogFence

ConstInit == Writers = {"w1", "w2", "f"} /\ Conditional = TRUE
ConstInitNoCheck == Writers = {"w1", "w2", "f"} /\ Conditional = FALSE

\* @type: (Int, Str) => {e: Int, w: Str};
R(e, w) == [e |-> e, w |-> w]

\* @type: (Int, Int, Int) => (Str -> Int);
PerWriter(a, b, c) == [w \in Writers |-> IF w = "w1" THEN a ELSE IF w = "w2" THEN b ELSE c]

IndInit ==
    /\ \E n \in 0..6, e1, e2, e3, e4, e5, e6 \in Int, w1, w2, w3, w4, w5, w6 \in Writers :
         log = SubSeq(<<R(e1, w1), R(e2, w2), R(e3, w3), R(e4, w4), R(e5, w5), R(e6, w6)>>, 1, n)
    /\ \E v1, v2, v3 \in Int : vlen = PerWriter(v1, v2, v3)
    /\ \E m1, m2, m3 \in Int : mine = PerWriter(m1, m2, m3)
    /\ \E c1, c2, c3 \in BOOLEAN : claimed = [w \in Writers |-> IF w = "w1" THEN c1 ELSE IF w = "w2" THEN c2 ELSE c3]
    /\ IndInv
=============================================================================
