---- MODULE GatewayInvocation_TTrace_1792349086 ----
EXTENDS Sequences, TLCExt, GatewayInvocation, Toolbox, Naturals, TLC

_expression ==
    LET GatewayInvocation_TEExpression == INSTANCE GatewayInvocation_TEExpression
    IN GatewayInvocation_TEExpression!expression
----

_trace ==
    LET GatewayInvocation_TETrace == INSTANCE GatewayInvocation_TETrace
    IN GatewayInvocation_TETrace!trace
----

_prop ==
    ~<>[](
        conn = ([a |-> "dropped", b |-> "none"])
        /\
        settledRow = ({})
        /\
        prepared = ({"a"})
        /\
        acctHeld = (0)
        /\
        bound = ({"a"})
        /\
        fin = ([a |-> "final", b |-> "none"])
        /\
        runLosses = (0)
        /\
        sup = ([a |-> "completed", b |-> "none"])
        /\
        refundHeld = (0)
        /\
        reprepares = (0)
        /\
        dispatches = ([a |-> 1, b |-> 0])
        /\
        shown = ({})
        /\
        marker = ({"a"})
        /\
        runRetries = (0)
        /\
        now = (3)
        /\
        claims = ({})
        /\
        host = ([ph |-> "ready", key |-> "a"])
        /\
        voided = ({})
        /\
        row = ([a |-> [ex |-> TRUE, cust |-> "settled", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {"final"}, tgen |-> 1, charged |-> 1, ttl |-> FALSE, rat |-> 3, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]])
        /\
        unrecorded = ([a |-> {}, b |-> {}])
        /\
        req = ([a |-> "done", b |-> "idle"])
    )
----

_init ==
    /\ acctHeld = _TETrace[1].acctHeld
    /\ runRetries = _TETrace[1].runRetries
    /\ conn = _TETrace[1].conn
    /\ now = _TETrace[1].now
    /\ bound = _TETrace[1].bound
    /\ sup = _TETrace[1].sup
    /\ shown = _TETrace[1].shown
    /\ row = _TETrace[1].row
    /\ refundHeld = _TETrace[1].refundHeld
    /\ settledRow = _TETrace[1].settledRow
    /\ voided = _TETrace[1].voided
    /\ dispatches = _TETrace[1].dispatches
    /\ marker = _TETrace[1].marker
    /\ claims = _TETrace[1].claims
    /\ req = _TETrace[1].req
    /\ host = _TETrace[1].host
    /\ reprepares = _TETrace[1].reprepares
    /\ fin = _TETrace[1].fin
    /\ prepared = _TETrace[1].prepared
    /\ runLosses = _TETrace[1].runLosses
    /\ unrecorded = _TETrace[1].unrecorded
----

_next ==
    /\ \E i,j \in DOMAIN _TETrace:
        /\ \/ /\ j = i + 1
              /\ i = TLCGet("level")
        /\ acctHeld  = _TETrace[i].acctHeld
        /\ acctHeld' = _TETrace[j].acctHeld
        /\ runRetries  = _TETrace[i].runRetries
        /\ runRetries' = _TETrace[j].runRetries
        /\ conn  = _TETrace[i].conn
        /\ conn' = _TETrace[j].conn
        /\ now  = _TETrace[i].now
        /\ now' = _TETrace[j].now
        /\ bound  = _TETrace[i].bound
        /\ bound' = _TETrace[j].bound
        /\ sup  = _TETrace[i].sup
        /\ sup' = _TETrace[j].sup
        /\ shown  = _TETrace[i].shown
        /\ shown' = _TETrace[j].shown
        /\ row  = _TETrace[i].row
        /\ row' = _TETrace[j].row
        /\ refundHeld  = _TETrace[i].refundHeld
        /\ refundHeld' = _TETrace[j].refundHeld
        /\ settledRow  = _TETrace[i].settledRow
        /\ settledRow' = _TETrace[j].settledRow
        /\ voided  = _TETrace[i].voided
        /\ voided' = _TETrace[j].voided
        /\ dispatches  = _TETrace[i].dispatches
        /\ dispatches' = _TETrace[j].dispatches
        /\ marker  = _TETrace[i].marker
        /\ marker' = _TETrace[j].marker
        /\ claims  = _TETrace[i].claims
        /\ claims' = _TETrace[j].claims
        /\ req  = _TETrace[i].req
        /\ req' = _TETrace[j].req
        /\ host  = _TETrace[i].host
        /\ host' = _TETrace[j].host
        /\ reprepares  = _TETrace[i].reprepares
        /\ reprepares' = _TETrace[j].reprepares
        /\ fin  = _TETrace[i].fin
        /\ fin' = _TETrace[j].fin
        /\ prepared  = _TETrace[i].prepared
        /\ prepared' = _TETrace[j].prepared
        /\ runLosses  = _TETrace[i].runLosses
        /\ runLosses' = _TETrace[j].runLosses
        /\ unrecorded  = _TETrace[i].unrecorded
        /\ unrecorded' = _TETrace[j].unrecorded

\* Uncomment the ASSUME below to write the states of the error trace
\* to the given file in Json format. Note that you can pass any tuple
\* to `JsonSerialize`. For example, a sub-sequence of _TETrace.
    \* ASSUME
    \*     LET J == INSTANCE Json
    \*         IN J!JsonSerialize("GatewayInvocation_TTrace_1792349086.json", _TETrace)

=============================================================================

 Note that you can extract this module `GatewayInvocation_TEExpression`
  to a dedicated file to reuse `expression` (the module in the 
  dedicated `GatewayInvocation_TEExpression.tla` file takes precedence 
  over the module `GatewayInvocation_TEExpression` below).

---- MODULE GatewayInvocation_TEExpression ----
EXTENDS Sequences, TLCExt, GatewayInvocation, Toolbox, Naturals, TLC

expression == 
    [
        \* To hide variables of the `GatewayInvocation` spec from the error trace,
        \* remove the variables below.  The trace will be written in the order
        \* of the fields of this record.
        acctHeld |-> acctHeld
        ,runRetries |-> runRetries
        ,conn |-> conn
        ,now |-> now
        ,bound |-> bound
        ,sup |-> sup
        ,shown |-> shown
        ,row |-> row
        ,refundHeld |-> refundHeld
        ,settledRow |-> settledRow
        ,voided |-> voided
        ,dispatches |-> dispatches
        ,marker |-> marker
        ,claims |-> claims
        ,req |-> req
        ,host |-> host
        ,reprepares |-> reprepares
        ,fin |-> fin
        ,prepared |-> prepared
        ,runLosses |-> runLosses
        ,unrecorded |-> unrecorded
        
        \* Put additional constant-, state-, and action-level expressions here:
        \* ,_stateNumber |-> _TEPosition
        \* ,_acctHeldUnchanged |-> acctHeld = acctHeld'
        
        \* Format the `acctHeld` variable as Json value.
        \* ,_acctHeldJson |->
        \*     LET J == INSTANCE Json
        \*     IN J!ToJson(acctHeld)
        
        \* Lastly, you may build expressions over arbitrary sets of states by
        \* leveraging the _TETrace operator.  For example, this is how to
        \* count the number of times a spec variable changed up to the current
        \* state in the trace.
        \* ,_acctHeldModCount |->
        \*     LET F[s \in DOMAIN _TETrace] ==
        \*         IF s = 1 THEN 0
        \*         ELSE IF _TETrace[s].acctHeld # _TETrace[s-1].acctHeld
        \*             THEN 1 + F[s-1] ELSE F[s-1]
        \*     IN F[_TEPosition - 1]
    ]

=============================================================================



Parsing and semantic processing can take forever if the trace below is long.
 In this case, it is advised to uncomment the module below to deserialize the
 trace from a generated binary file.

\*
\*---- MODULE GatewayInvocation_TETrace ----
\*EXTENDS IOUtils, GatewayInvocation, TLC
\*
\*trace == IODeserialize("GatewayInvocation_TTrace_1792349086.bin", TRUE)
\*
\*=============================================================================
\*

---- MODULE GatewayInvocation_TETrace ----
EXTENDS GatewayInvocation, TLC

trace == 
    <<
    ([conn |-> [a |-> "none", b |-> "none"],settledRow |-> {},prepared |-> {},acctHeld |-> 0,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "none", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 0, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 0,claims |-> {},host |-> [ph |-> "ready", key |-> "none"],voided |-> {},row |-> [a |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "idle", b |-> "idle"]]),
    ([conn |-> [a |-> "none", b |-> "none"],settledRow |-> {},prepared |-> {},acctHeld |-> 0,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "none", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 0, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 1,claims |-> {},host |-> [ph |-> "ready", key |-> "none"],voided |-> {},row |-> [a |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "idle", b |-> "idle"]]),
    ([conn |-> [a |-> "none", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 0,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "none", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 0, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 1,claims |-> {},host |-> [ph |-> "prepared", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "idle", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 0,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "none", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 0, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 1,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "sent", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "none", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 0, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 1,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "admitted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "admitted", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "none", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 0, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 1,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "intent_recorded", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "intent", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "generating", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 1,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "streaming", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "generating", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 2,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "streaming", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "generating", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "streaming", b |-> "idle"]]),
    ([conn |-> [a |-> "open", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {"a"},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "generating", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "inflight", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "streaming", b |-> "idle"]]),
    ([conn |-> [a |-> "dropped", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {"a"},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "generating", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {"a"},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "failed", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "streaming", b |-> "idle"]]),
    ([conn |-> [a |-> "dropped", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {"a"},fin |-> [a |-> "none", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "completed", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {"a"},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "failed", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "streaming", b |-> "idle"]]),
    ([conn |-> [a |-> "dropped", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 1,bound |-> {"a"},fin |-> [a |-> "final", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "completed", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {"a"},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "failed", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "pending", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {"final"}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "finishing", b |-> "idle"]]),
    ([conn |-> [a |-> "dropped", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 0,bound |-> {"a"},fin |-> [a |-> "final", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "completed", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {"a"},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "failed", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "settled", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {"final"}, tgen |-> 1, charged |-> 1, ttl |-> FALSE, rat |-> 3, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "done", b |-> "idle"]]),
    ([conn |-> [a |-> "dropped", b |-> "none"],settledRow |-> {},prepared |-> {"a"},acctHeld |-> 0,bound |-> {"a"},fin |-> [a |-> "final", b |-> "none"],runLosses |-> 0,sup |-> [a |-> "completed", b |-> "none"],refundHeld |-> 0,reprepares |-> 0,dispatches |-> [a |-> 1, b |-> 0],shown |-> {},marker |-> {"a"},runRetries |-> 0,now |-> 3,claims |-> {},host |-> [ph |-> "ready", key |-> "a"],voided |-> {},row |-> [a |-> [ex |-> TRUE, cust |-> "settled", disp |-> "accepted", gen |-> 1, lease |-> -1, due |-> 2, intent |-> 1, igen |-> 1, cancel |-> -1, ev |-> {"final"}, tgen |-> 1, charged |-> 1, ttl |-> FALSE, rat |-> 3, fails |-> 0], b |-> [ex |-> FALSE, cust |-> "none", disp |-> "none", gen |-> 0, lease |-> -1, due |-> 0, intent |-> -1, igen |-> 0, cancel |-> -1, ev |-> {}, tgen |-> 0, charged |-> 0, ttl |-> FALSE, rat |-> -1, fails |-> 0]],unrecorded |-> [a |-> {}, b |-> {}],req |-> [a |-> "done", b |-> "idle"]])
    >>
----


=============================================================================

---- CONFIG GatewayInvocation_TTrace_1792349086 ----
CONSTANTS
    Keys = { "a" , "b" }
    Workers = 1
    Crashes = FALSE
    MaxTime = 3
    Due = 1
    Grace = 1
    MaxRecovery = 1
    VoidOnLookup = TRUE
    LookupFailed = FALSE
    Reconcile = TRUE
    AutoProceed = FALSE
    RefundHolds = FALSE
    ServiceStops = FALSE
    CutSettles = TRUE
    FenceGen = TRUE
    DeferGrace = TRUE
    CountRetries = TRUE
    LostReplyRetries = 1
    KeepCompleted = TRUE

PROPERTY
    _prop

CHECK_DEADLOCK
    \* CHECK_DEADLOCK off because of PROPERTY or INVARIANT above.
    FALSE

INIT
    _init

NEXT
    _next

CONSTANT
    _TETrace <- _trace

ALIAS
    _expression
=============================================================================
\* Generated on Sun Oct 18 18:44:52 UTC 2026