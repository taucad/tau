import type postgres from 'postgres';

/** Install private billing privileges using the migration owner's protected connection. */
export async function installBillingProtections(client: postgres.Sql): Promise<void> {
  await client.begin(async (transaction) => {
    await transaction`DO $$ BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tau_billing_runtime') THEN CREATE ROLE tau_billing_runtime NOLOGIN; END IF;
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tau_billing_policy_publisher') THEN CREATE ROLE tau_billing_policy_publisher NOLOGIN; END IF;
    END $$`;
    await transaction`DO $$ BEGIN
      IF to_regprocedure('billing.observe_policy(text)') IS NULL AND EXISTS (
        SELECT FROM billing.billing_policy_head h WHERE h.observed_activation_id IS NULL
          AND (h.current_activation_id IS NOT NULL OR h.pending_activation_id IS NOT NULL
            OR EXISTS (SELECT FROM billing.billing_policy_activation a WHERE a.environment = h.environment))
      ) THEN RAISE EXCEPTION 'existing billing policy requires verified barrier initialization'; END IF;
    END $$`;
    await transaction`REVOKE ALL ON SCHEMA billing FROM PUBLIC`;
    await transaction`REVOKE ALL ON ALL TABLES IN SCHEMA billing FROM PUBLIC`;
    await transaction`GRANT USAGE ON SCHEMA billing TO tau_billing_runtime, tau_billing_policy_publisher`;
    await transaction`GRANT SELECT ON ALL TABLES IN SCHEMA billing TO tau_billing_runtime`;
    await transaction`REVOKE SELECT ON ALL TABLES IN SCHEMA billing FROM tau_billing_policy_publisher`;
    await transaction`GRANT SELECT ON billing.billing_policy, billing.billing_policy_activation,
      billing.billing_policy_activation_cancellation, billing.billing_policy_head TO tau_billing_policy_publisher`;
    await transaction`GRANT INSERT ON billing.credit_account, billing.billing_owner_binding, billing.credit_operation,
      billing.credit_transaction, billing.billing_budget_hold, billing.supplier_cost_evidence, billing.billing_invocation_evidence, billing.billing_operation_exception,
      billing.billing_route_pause, billing.billing_purchase, billing.billing_period, billing.billing_promotion_issuance, billing.billing_reversal_case TO tau_billing_runtime`;
    await transaction`GRANT INSERT ON billing.billing_stripe_customer, billing.billing_provider_leg,
      billing.stripe_event_inbox, billing.billing_stripe_source TO tau_billing_runtime`;
    await transaction`GRANT INSERT ON billing.billing_reload_consent, billing.billing_reload_work,
      billing.billing_subscription_offer, billing.billing_account_closure, billing.billing_refund_intent,
      billing.billing_cash_scan, billing.billing_cash_fact, billing.billing_cash_scan_fact, billing.billing_financial_case,
      billing.billing_tax_fact, billing.billing_recovery_notice, billing.billing_journal_checkpoint TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (incremental_occurred_at, incremental_transaction_id, sweep_account_id,
      sweep_cycles, generation, lease_until, last_completed_at)
      ON billing.billing_journal_checkpoint TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (checkout_session_id, setup_intent_id, payment_method_id, payment_method,
      consented_at, state, consecutive_terminal_failures, last_automatic_started_at, updated_at)
      ON billing.billing_reload_consent TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (reason_kind, reason_operation_id, reason_attempt_key, reason_request_digest,
      observed_account_revision, state, generation, lease_until, next_attempt_at, error_code, updated_at)
      ON billing.billing_reload_work TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (stripe_schedule_id, schedule_evidence, state, error_code, updated_at) ON billing.billing_subscription_offer TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (state, generation, lease_until, next_attempt_at, attempt_count,
      auth_deleted_at, closed_at, attention_code, updated_at) ON billing.billing_account_closure TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (hold_state, state, confirmed_at, error_code, updated_at)
      ON billing.billing_refund_intent TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (balance_cursor, payment_intent_cursor, charge_cursor, refund_cursor,
      journal_cursor, fact_cursor, balance_done, payment_intent_done, charge_done, refund_done, journal_done, fact_done,
      state, generation, lease_until, attempts, next_attempt_at, error_code, completed_at)
      ON billing.billing_cash_scan TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (evidence, owner, next_step, state, first_effective_at, last_seen_at, known_amount_minor,
      deadline_at, resolved_at, resolution_evidence) ON billing.billing_financial_case TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (state, generation, lease_until, next_attempt_at, attempt_count,
      error_code, delivery_receipt, delivered_at, updated_at) ON billing.billing_recovery_notice TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (deferred_issued_atoms, cumulative_principal_loss_minor,
      cumulative_tax_loss_minor, cumulative_gross_loss_minor, projection_digest, projection_source_id,
      projection_source_generation, projection_observed_at, projection_evidence, updated_at)
      ON billing.billing_reversal_case TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (automatic_source_accepted_at, automatic_terminal_outcome, automatic_terminal_at)
      ON billing.billing_purchase TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (generation, lease_until, expires_at, expiration_requested_at, terminal_evidence)
      ON billing.billing_provider_leg TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (stripe_customer_id) ON billing.billing_stripe_customer TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (state, updated_at, paid_at, paid_evidence, payment_intent_id, charge_id,
      fulfilled_at, receipt_id, granted_atoms, fulfilled_revision) ON billing.billing_purchase TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (state, receipt_id, granted_atoms, fulfilled_revision) ON billing.billing_period TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (dispatch_started_at, provider_object_id, redirect_url, state, cancellation_requested_at,
      cancellation_confirmed_at, no_charge_evidence, error_code, next_attempt_at) ON billing.billing_provider_leg TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (state, attempts, next_attempt_at, error_code, claim_generation, lease_until)
      ON billing.stripe_event_inbox TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (generation, lease_until, state, next_attempt_at, error_code)
      ON billing.billing_stripe_source TO tau_billing_runtime`;
    await transaction`REVOKE ALL ON public.subscription, public.subscription_extension FROM PUBLIC`;
    await transaction`ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY`;
    await transaction`ALTER TABLE public.subscription_extension ENABLE ROW LEVEL SECURITY`;
    await transaction`DROP POLICY IF EXISTS billing_runtime_subscription ON public.subscription`;
    await transaction`CREATE POLICY billing_runtime_subscription ON public.subscription TO tau_billing_runtime USING (true) WITH CHECK (true)`;
    await transaction`DROP POLICY IF EXISTS billing_runtime_subscription_extension ON public.subscription_extension`;
    await transaction`CREATE POLICY billing_runtime_subscription_extension ON public.subscription_extension FOR SELECT TO tau_billing_runtime USING (true)`;
    await transaction`GRANT SELECT, INSERT ON public.subscription TO tau_billing_runtime`;
    await transaction`GRANT SELECT ON public.subscription_extension TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (stripe_subscription_id, status, cancel_at_period_end, canceled_at, ended_at,
      slot_state, paid_through, failed_renewal_invoice_id, dunning_started_at, grace_ends_at, updated_at)
      ON public.subscription TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (status, promo_atoms, plan_atoms, purchased_atoms, debt_atoms,
      promo_held_atoms, plan_held_atoms, purchased_held_atoms, pending_issuance_atoms, revision)
      ON billing.credit_account TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (revoked_at) ON billing.billing_owner_binding TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (consumed, held) ON billing.billing_budget, billing.billing_budget_funding TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (remaining_held, consumed, finality_state) ON billing.billing_budget_hold TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (net_applied_atoms) ON billing.billing_reversal_case TO tau_billing_runtime`;
    await transaction`GRANT UPDATE (dispatch_state, customer_state, supplier_state, generation, lease_until,
      due_at, usage_occurred_at, resolved_at, terminal_revision, base_transaction_id, charged_atoms, actual_retail_atoms,
      meter_items, input_tokens, output_tokens, dispatch_intent_at, evidence_occurred_at,
      execution_status, metering_status, reasoning_tokens, normalization_evidence, cancellation_requested_at) ON billing.credit_operation TO tau_billing_runtime`;
    await transaction`GRANT INSERT ON billing.billing_policy, billing.billing_policy_activation,
      billing.billing_policy_activation_cancellation TO tau_billing_policy_publisher`;
    await transaction`REVOKE ALL ON billing.billing_policy_head FROM tau_billing_runtime, tau_billing_policy_publisher`;
    await transaction`GRANT SELECT ON billing.billing_policy_head TO tau_billing_runtime, tau_billing_policy_publisher`;
    await transaction`GRANT INSERT (environment, revision, current_activation_id) ON billing.billing_policy_head
      TO tau_billing_policy_publisher`;
    await transaction`GRANT UPDATE (revision, current_activation_id, pending_activation_id, updated_at)
      ON billing.billing_policy_head TO tau_billing_policy_publisher`;
    await transaction`CREATE OR REPLACE FUNCTION billing.observe_policy(p_environment text) RETURNS text
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE decision record; head_locked boolean := false;
      BEGIN
        IF current_setting('transaction_isolation') <> 'read committed' THEN
          RAISE EXCEPTION 'billing policy observation requires read committed';
        END IF;
        LOOP
          WITH candidates AS MATERIALIZED (
            SELECT a.id, a.effective_at, a.created_at
            FROM billing.billing_policy_activation a
            LEFT JOIN billing.billing_policy_activation_cancellation c ON c.activation_id = a.id
            WHERE a.environment = p_environment AND a.effective_at <= transaction_timestamp()
              AND c.activation_id IS NULL
            ORDER BY a.effective_at DESC, a.created_at DESC LIMIT 2
          ), candidate AS (SELECT * FROM candidates ORDER BY effective_at DESC, created_at DESC LIMIT 1)
          SELECT chosen.id AS candidate_id, h.observed_activation_id AS observed_id,
            h.environment IS NOT NULL AS has_head,
            (SELECT count(*) FROM candidates tied
              WHERE ROW(tied.effective_at,tied.created_at) = ROW(chosen.effective_at,chosen.created_at)) > 1 AS ambiguous,
            h.observed_activation_id IS NOT NULL AND (
              observed.effective_at > transaction_timestamp() OR chosen.id IS NULL
              OR ROW(chosen.effective_at,chosen.created_at) < ROW(observed.effective_at,observed.created_at)
              OR (chosen.id <> observed.id AND
                ROW(chosen.effective_at,chosen.created_at) = ROW(observed.effective_at,observed.created_at))
            ) AS regressed
          INTO decision
          FROM (SELECT 1) seed
          LEFT JOIN billing.billing_policy_head h ON h.environment = p_environment
          LEFT JOIN billing.billing_policy_activation observed
            ON observed.environment = h.environment AND observed.id = h.observed_activation_id
          LEFT JOIN candidate chosen ON true;
          IF decision.ambiguous THEN RAISE EXCEPTION 'ambiguous billing policy activation'; END IF;
          IF decision.regressed THEN RAISE EXCEPTION 'billing policy temporal regression'; END IF;
          IF NOT decision.has_head OR decision.candidate_id IS NULL THEN
            RETURN NULL;
          END IF;
          IF decision.candidate_id = decision.observed_id THEN RETURN decision.candidate_id; END IF;
          IF NOT head_locked THEN
            PERFORM 1 FROM billing.billing_policy_head WHERE environment = p_environment FOR UPDATE;
            IF NOT FOUND THEN RETURN NULL; END IF;
            head_locked := true;
            CONTINUE;
          END IF;
          UPDATE billing.billing_policy_head SET observed_activation_id = decision.candidate_id
            WHERE environment = p_environment;
          RETURN decision.candidate_id;
        END LOOP;
      END $$`;
    await transaction`REVOKE ALL ON FUNCTION billing.observe_policy(text) FROM PUBLIC`;
    await transaction`GRANT EXECUTE ON FUNCTION billing.observe_policy(text)
      TO tau_billing_runtime, tau_billing_policy_publisher`;
    await transaction`CREATE OR REPLACE FUNCTION billing.protect_policy_cancellation() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
      DECLARE head billing.billing_policy_head%ROWTYPE;
        target billing.billing_policy_activation%ROWTYPE;
        observed billing.billing_policy_activation%ROWTYPE;
      BEGIN
        SELECT * INTO head FROM billing.billing_policy_head WHERE environment = NEW.environment FOR UPDATE;
        IF NOT FOUND OR head.current_activation_id IS DISTINCT FROM NEW.activation_id
          OR head.pending_activation_id IS DISTINCT FROM NEW.activation_id
        THEN RAISE EXCEPTION 'only a pending future activation can be cancelled'; END IF;
        SELECT * INTO target FROM billing.billing_policy_activation
          WHERE environment = NEW.environment AND id = NEW.activation_id FOR UPDATE;
        SELECT * INTO observed FROM billing.billing_policy_activation
          WHERE environment = NEW.environment AND id = head.observed_activation_id;
        IF target.id IS NULL OR target.effective_at <= clock_timestamp() OR
          (observed.id IS NOT NULL AND ROW(target.effective_at,target.created_at)
            <= ROW(observed.effective_at,observed.created_at))
        THEN RAISE EXCEPTION 'only a pending future activation can be cancelled'; END IF;
        NEW.cancelled_at := clock_timestamp();
        RETURN NEW;
      END $$`;
    await transaction`REVOKE ALL ON FUNCTION billing.protect_policy_cancellation() FROM PUBLIC`;
    await transaction`DROP TRIGGER IF EXISTS protect_policy_cancellation ON billing.billing_policy_activation_cancellation`;
    await transaction`CREATE TRIGGER protect_policy_cancellation BEFORE INSERT ON billing.billing_policy_activation_cancellation
      FOR EACH ROW EXECUTE FUNCTION billing.protect_policy_cancellation()`;
    await transaction`CREATE OR REPLACE FUNCTION billing.reject_immutable_change() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        RAISE EXCEPTION 'immutable billing fact' USING ERRCODE = '23514';
      END $$`;
    await Promise.all(
      [
        'credit_transaction',
        'billing_policy',
        'billing_policy_activation',
        'billing_policy_activation_cancellation',
        'supplier_cost_evidence',
        'billing_invocation_evidence',
        'billing_operation_exception',
        'billing_promotion_issuance',
        'billing_cash_fact',
        'billing_cash_scan_fact',
        'billing_tax_fact',
      ].map(async (table) => {
        await transaction.unsafe(`DROP TRIGGER IF EXISTS immutable_billing_fact ON billing."${table}"`);
        await transaction.unsafe(`CREATE TRIGGER immutable_billing_fact BEFORE UPDATE OR DELETE ON billing."${table}"
        FOR EACH ROW EXECUTE FUNCTION billing.reject_immutable_change()`);
      }),
    );
    await transaction`CREATE OR REPLACE FUNCTION billing.protect_operation() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'financial operation cannot be deleted' USING ERRCODE = '23514'; END IF;
        IF NEW.history_version = 1 AND (
          (NEW.customer_state = 'pending' AND
            ROW(NEW.evidence_occurred_at,NEW.execution_status,NEW.metering_status,
              NEW.reasoning_tokens,NEW.normalization_evidence) IS DISTINCT FROM ROW(NULL,NULL,NULL,NULL,NULL))
          OR (NEW.customer_state <> 'pending' AND
            (NEW.execution_status IS NULL OR NEW.metering_status IS NULL))
        ) THEN RAISE EXCEPTION 'operation evidence requires terminal transition' USING ERRCODE = '23514'; END IF;
        IF OLD.customer_state = 'pending' AND NEW.customer_state = 'pending'
          AND OLD.dispatch_state = 'admitted' AND NEW.dispatch_state = 'intent_recorded'
          AND OLD.dispatch_intent_at IS NULL THEN
          NEW.dispatch_intent_at := clock_timestamp();
          NEW.usage_occurred_at := NEW.dispatch_intent_at;
        ELSIF ROW(OLD.dispatch_intent_at,OLD.usage_occurred_at)
          IS DISTINCT FROM ROW(NEW.dispatch_intent_at,NEW.usage_occurred_at) THEN
          IF NOT (OLD.customer_state = 'pending' AND NEW.customer_state = 'released'
            AND OLD.dispatch_intent_at IS NULL AND NEW.dispatch_intent_at IS NULL
            AND OLD.usage_occurred_at IS NULL
            AND NEW.usage_occurred_at IS NOT DISTINCT FROM OLD.admitted_at) THEN
            RAISE EXCEPTION 'immutable operation reporting time' USING ERRCODE = '23514';
          END IF;
        END IF;
        IF OLD.cancellation_requested_at IS NOT NULL AND NEW.cancellation_requested_at IS DISTINCT FROM OLD.cancellation_requested_at
        THEN RAISE EXCEPTION 'immutable cancellation intent' USING ERRCODE = '23514'; END IF;
        IF (to_jsonb(OLD) - ARRAY['cancellation_requested_at','dispatch_state','customer_state','supplier_state','generation','lease_until','due_at',
             'usage_occurred_at','dispatch_intent_at','evidence_occurred_at','execution_status','metering_status',
             'reasoning_tokens','normalization_evidence','resolved_at','terminal_revision','base_transaction_id','charged_atoms','actual_retail_atoms','meter_items','input_tokens','output_tokens'])
          IS DISTINCT FROM
           (to_jsonb(NEW) - ARRAY['cancellation_requested_at','dispatch_state','customer_state','supplier_state','generation','lease_until','due_at',
             'usage_occurred_at','dispatch_intent_at','evidence_occurred_at','execution_status','metering_status',
             'reasoning_tokens','normalization_evidence','resolved_at','terminal_revision','base_transaction_id','charged_atoms','actual_retail_atoms','meter_items','input_tokens','output_tokens'])
        THEN RAISE EXCEPTION 'immutable operation admission' USING ERRCODE = '23514'; END IF;
        IF OLD.customer_state <> 'pending' AND
          (to_jsonb(OLD) - ARRAY['supplier_state','generation','lease_until','due_at']) IS DISTINCT FROM
          (to_jsonb(NEW) - ARRAY['supplier_state','generation','lease_until','due_at'])
        THEN RAISE EXCEPTION 'immutable terminal receipt' USING ERRCODE = '23514'; END IF;
        IF NEW.generation < OLD.generation THEN RAISE EXCEPTION 'stale operation generation' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$`;
    await transaction`DROP TRIGGER IF EXISTS protect_operation ON billing.credit_operation`;
    await transaction`CREATE TRIGGER protect_operation BEFORE UPDATE OR DELETE ON billing.credit_operation
      FOR EACH ROW EXECUTE FUNCTION billing.protect_operation()`;
    await transaction`CREATE OR REPLACE FUNCTION billing.protect_owner_binding() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF ROW(OLD.id,OLD.account_id,OLD.environment) IS DISTINCT FROM ROW(NEW.id,NEW.account_id,NEW.environment)
          OR (OLD.auth_user_id IS DISTINCT FROM NEW.auth_user_id AND NEW.auth_user_id IS NOT NULL)
          OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
        THEN RAISE EXCEPTION 'financial identity cannot be reassigned' USING ERRCODE = '23514'; END IF;
        IF NEW.auth_user_id IS NULL AND NEW.revoked_at IS NULL THEN NEW.revoked_at = transaction_timestamp(); END IF;
        RETURN NEW;
      END $$`;
    await transaction`DROP TRIGGER IF EXISTS protect_owner_binding ON billing.billing_owner_binding`;
    await transaction`CREATE TRIGGER protect_owner_binding BEFORE UPDATE ON billing.billing_owner_binding
      FOR EACH ROW EXECUTE FUNCTION billing.protect_owner_binding()`;
    await transaction`REVOKE ALL ON FUNCTION billing.protect_owner_binding() FROM PUBLIC`;
    await transaction`CREATE OR REPLACE FUNCTION billing.require_operation_holds() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF NEW.spend_budget_hold_id = NEW.risk_budget_hold_id OR
          NOT EXISTS (SELECT FROM billing.billing_budget_hold h JOIN billing.billing_budget b ON b.id = h.budget_id
            WHERE h.id = NEW.spend_budget_hold_id AND h.operation_id = NEW.id AND b.environment = NEW.environment AND b.kind = 'spend') OR
          NOT EXISTS (SELECT FROM billing.billing_budget_hold h JOIN billing.billing_budget b ON b.id = h.budget_id
            WHERE h.id = NEW.risk_budget_hold_id AND h.operation_id = NEW.id AND b.environment = NEW.environment AND b.kind = 'risk')
        THEN RAISE EXCEPTION 'operation requires its own spend and risk holds' USING ERRCODE = '23503'; END IF;
        RETURN NEW;
      END $$`;
    await transaction`DROP TRIGGER IF EXISTS require_operation_holds ON billing.credit_operation`;
    await transaction`CREATE CONSTRAINT TRIGGER require_operation_holds AFTER INSERT ON billing.credit_operation
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.require_operation_holds()`;
    await transaction`CREATE OR REPLACE FUNCTION billing.protect_budget_hold() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF TG_OP = 'DELETE' OR ROW(OLD.id,OLD.budget_id,OLD.operation_id,OLD.initial_bound)
          IS DISTINCT FROM ROW(NEW.id,NEW.budget_id,NEW.operation_id,NEW.initial_bound)
        THEN RAISE EXCEPTION 'immutable budget hold cause' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$`;
    await transaction`DROP TRIGGER IF EXISTS protect_budget_hold ON billing.billing_budget_hold`;
    await transaction`CREATE TRIGGER protect_budget_hold BEFORE UPDATE OR DELETE ON billing.billing_budget_hold
      FOR EACH ROW EXECUTE FUNCTION billing.protect_budget_hold()`;
    await transaction`REVOKE ALL ON FUNCTION billing.require_operation_holds(), billing.protect_budget_hold() FROM PUBLIC`;
    await transaction`REVOKE ALL ON FUNCTION billing.reject_immutable_change(), billing.protect_operation() FROM PUBLIC`;
    await transaction`DROP TRIGGER IF EXISTS immutable_billing_fact ON billing.billing_period`;
    await transaction`CREATE OR REPLACE FUNCTION billing.protect_payment_identity() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$
      DECLARE mutable text[]; receipt billing.credit_transaction%ROWTYPE;
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payment evidence cannot be deleted' USING ERRCODE = '23514'; END IF;
        CASE TG_TABLE_NAME
        WHEN 'billing_stripe_customer' THEN
          mutable := ARRAY['stripe_customer_id'];
          IF OLD.stripe_customer_id IS NOT NULL AND OLD.stripe_customer_id IS DISTINCT FROM NEW.stripe_customer_id
          THEN RAISE EXCEPTION 'Customer identity is immutable' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_purchase' THEN
          IF NEW.customer_binding_id IS NOT NULL AND (
            NEW.stripe_account_id IS DISTINCT FROM NEW.offer_snapshot->>'stripeAccountId'
            OR NEW.livemode::text IS DISTINCT FROM NEW.offer_snapshot->>'livemode'
            OR (NEW.paid_evidence IS NOT NULL AND (
              NEW.stripe_account_id IS DISTINCT FROM NEW.paid_evidence->>'stripeAccountId'
              OR NEW.livemode::text IS DISTINCT FROM NEW.paid_evidence->>'livemode')))
          THEN RAISE EXCEPTION 'purchase Stripe scope must match its evidence' USING ERRCODE = '23514'; END IF;
          mutable := ARRAY['automatic_source_accepted_at','automatic_terminal_outcome','automatic_terminal_at','state','updated_at','paid_at','paid_evidence','payment_intent_id','charge_id','fulfilled_at','receipt_id','granted_atoms','fulfilled_revision'];
          IF (OLD.state IN ('paid','fulfilled','failed','canceled') AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW))
            OR (OLD.state = 'paid_unfulfilled' AND NEW.state NOT IN ('paid_unfulfilled','fulfilled'))
            OR (OLD.state <> 'prepared' AND NEW.state = 'prepared')
            OR (OLD.state NOT IN ('prepared','pending','attention') AND NEW.state = 'canceled')
            OR (OLD.paid_evidence IS NOT NULL AND ROW(OLD.paid_evidence,OLD.paid_at,OLD.payment_intent_id,OLD.charge_id)
              IS DISTINCT FROM ROW(NEW.paid_evidence,NEW.paid_at,NEW.payment_intent_id,NEW.charge_id))
          THEN RAISE EXCEPTION 'payment cannot regress or replace evidence' USING ERRCODE = '23514'; END IF;
          IF OLD.state <> NEW.state AND NOT (
            (OLD.state = 'prepared' AND NEW.state IN ('creating','pending','attention','paid_unfulfilled','canceled','failed')) OR
            (OLD.state = 'creating' AND NEW.state IN ('pending','attention','paid_unfulfilled','failed')) OR
            (OLD.state = 'pending' AND NEW.state IN ('attention','paid_unfulfilled','failed','canceled')) OR
            (OLD.state = 'attention' AND NEW.state IN ('creating','pending','paid_unfulfilled','failed','canceled')) OR
            (OLD.state = 'paid_unfulfilled' AND NEW.state = 'fulfilled'))
          THEN RAISE EXCEPTION 'invalid purchase transition' USING ERRCODE = '23514'; END IF;
          IF NEW.state IN ('failed','canceled') AND EXISTS (
            SELECT FROM billing.billing_provider_leg WHERE purchase_id = NEW.id AND dispatch_started_at IS NOT NULL
              AND state NOT IN ('no_charge','expired'))
          THEN RAISE EXCEPTION 'charge-capable payment cannot be discarded' USING ERRCODE = '23514'; END IF;
          IF NEW.state = 'fulfilled' THEN
            SELECT * INTO receipt FROM billing.credit_transaction WHERE id = NEW.receipt_id;
            IF receipt.id IS NULL OR receipt.kind IS DISTINCT FROM 'purchase_grant' OR receipt.purchase_id IS DISTINCT FROM NEW.id
              OR receipt.account_id IS DISTINCT FROM NEW.account_id OR receipt.revision IS DISTINCT FROM NEW.fulfilled_revision
              OR receipt.account_delta_atoms IS DISTINCT FROM NEW.granted_atoms OR receipt.plan_delta_atoms IS DISTINCT FROM 0 OR receipt.promo_delta_atoms IS DISTINCT FROM 0
              OR (receipt.purchased_delta_atoms - receipt.debt_delta_atoms) IS DISTINCT FROM NEW.granted_atoms
            THEN RAISE EXCEPTION 'purchase receipt must match its journal' USING ERRCODE = '23514'; END IF;
          END IF;
        WHEN 'billing_period' THEN
          mutable := ARRAY['state','receipt_id','granted_atoms','fulfilled_revision'];
          IF OLD.state = 'fulfilled' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)
          THEN RAISE EXCEPTION 'period receipt is immutable' USING ERRCODE = '23514'; END IF;
          IF NEW.state = 'fulfilled' THEN
            SELECT * INTO receipt FROM billing.credit_transaction WHERE id = NEW.receipt_id;
            IF receipt.id IS NULL OR receipt.kind IS DISTINCT FROM 'period_grant' OR receipt.period_id IS DISTINCT FROM NEW.id
              OR receipt.account_id IS DISTINCT FROM NEW.account_id OR receipt.revision IS DISTINCT FROM NEW.fulfilled_revision
              OR receipt.account_delta_atoms IS DISTINCT FROM NEW.granted_atoms OR receipt.purchased_delta_atoms IS DISTINCT FROM 0 OR receipt.promo_delta_atoms IS DISTINCT FROM 0
              OR (receipt.plan_delta_atoms - receipt.debt_delta_atoms) IS DISTINCT FROM NEW.granted_atoms
            THEN RAISE EXCEPTION 'period receipt must match its journal' USING ERRCODE = '23514'; END IF;
          END IF;
        WHEN 'billing_provider_leg' THEN
          IF NEW.generation < OLD.generation THEN RAISE EXCEPTION 'stale provider leg generation' USING ERRCODE = '23514'; END IF;
          mutable := ARRAY['generation','lease_until','expires_at','expiration_requested_at','terminal_evidence','dispatch_started_at','provider_object_id','redirect_url','state','cancellation_requested_at','cancellation_confirmed_at','no_charge_evidence','error_code','next_attempt_at'];
          IF (OLD.expires_at IS NOT NULL AND OLD.expires_at IS DISTINCT FROM NEW.expires_at)
            OR (OLD.expiration_requested_at IS NOT NULL AND OLD.expiration_requested_at IS DISTINCT FROM NEW.expiration_requested_at)
            OR (OLD.terminal_evidence IS NOT NULL AND OLD.terminal_evidence IS DISTINCT FROM NEW.terminal_evidence)
            OR (OLD.state = 'expired' AND NEW.state <> 'expired')
          THEN RAISE EXCEPTION 'immutable setup expiry evidence' USING ERRCODE = '23514'; END IF;
          IF NEW.terminal_evidence IS NOT NULL AND NEW.kind = 'checkout_setup' AND (NEW.state <> 'expired' OR NEW.kind <> 'checkout_setup'
            OR NEW.terminal_evidence->>'version' IS DISTINCT FROM 'stripe-checkout-expiry-v1'
            OR NEW.terminal_evidence->>'status' IS DISTINCT FROM 'expired'
            OR NEW.terminal_evidence->>'mode' IS DISTINCT FROM 'setup'
            OR NEW.terminal_evidence->>'checkoutSessionId' IS DISTINCT FROM NEW.provider_object_id
            OR NOT EXISTS (SELECT FROM billing.billing_stripe_customer c WHERE c.id = NEW.customer_binding_id
              AND c.account_id = NEW.account_id AND c.stripe_customer_id = NEW.terminal_evidence->>'customerId'
              AND c.stripe_account_id = NEW.terminal_evidence->>'stripeAccountId'
              AND c.livemode::text = NEW.terminal_evidence->>'livemode'))
          THEN RAISE EXCEPTION 'setup expiry must match its owned Session' USING ERRCODE = '23514'; END IF;
          IF NEW.kind = 'checkout_subscription' AND NEW.terminal_evidence IS NOT NULL AND (
            NEW.state <> 'expired' OR NEW.terminal_evidence->>'version' IS DISTINCT FROM 'stripe-subscription-checkout-expired-v1'
            OR NEW.terminal_evidence->>'status' IS DISTINCT FROM 'expired' OR NEW.terminal_evidence->>'mode' IS DISTINCT FROM 'subscription'
            OR NEW.terminal_evidence->>'checkoutSessionId' IS DISTINCT FROM NEW.provider_object_id
            OR NEW.terminal_evidence->'subscriptionId' IS DISTINCT FROM 'null'::jsonb
            OR NEW.terminal_evidence->'paymentIntentId' IS DISTINCT FROM 'null'::jsonb
            OR NEW.terminal_evidence->>'paymentStatus' IS DISTINCT FROM 'unpaid'
            OR NOT EXISTS (SELECT FROM billing.billing_stripe_customer c WHERE c.id = NEW.customer_binding_id
              AND c.account_id = NEW.account_id AND c.stripe_customer_id = NEW.terminal_evidence->>'customerId'
              AND c.stripe_account_id = NEW.terminal_evidence->>'stripeAccountId'
              AND c.livemode::text = NEW.terminal_evidence->>'livemode'))
          THEN RAISE EXCEPTION 'subscription checkout expiry must prove no created source' USING ERRCODE = '23514'; END IF;
          IF NEW.kind = 'payment_intent' AND NEW.terminal_evidence IS NOT NULL AND (
            NEW.state <> 'no_charge' OR NEW.provider_object_id IS NOT NULL
            OR NEW.terminal_evidence->>'version' IS DISTINCT FROM 'stripe-request-rejected-v1'
            OR NEW.terminal_evidence->>'idempotencyKey' IS DISTINCT FROM NEW.idempotency_key)
          THEN RAISE EXCEPTION 'rejected payment request must match its unlinked leg' USING ERRCODE = '23514'; END IF;
          IF NEW.kind = 'checkout_payment' AND NEW.terminal_evidence IS NOT NULL AND (
            NEW.state <> 'expired' OR NEW.terminal_evidence->>'version' IS DISTINCT FROM 'stripe-payment-checkout-expired-v1'
            OR NEW.terminal_evidence->>'status' IS DISTINCT FROM 'expired' OR NEW.terminal_evidence->>'mode' IS DISTINCT FROM 'payment'
            OR NEW.terminal_evidence->>'checkoutSessionId' IS DISTINCT FROM NEW.provider_object_id
            OR NEW.terminal_evidence->>'paymentStatus' IS DISTINCT FROM 'unpaid'
            OR NEW.terminal_evidence->>'amountReceived' IS DISTINCT FROM '0'
            OR NOT EXISTS (SELECT FROM billing.billing_stripe_customer c WHERE c.id = NEW.customer_binding_id
              AND c.account_id = NEW.account_id AND c.stripe_customer_id = NEW.terminal_evidence->>'customerId'
              AND c.stripe_account_id = NEW.terminal_evidence->>'stripeAccountId'
              AND c.livemode::text = NEW.terminal_evidence->>'livemode'))
          THEN RAISE EXCEPTION 'payment checkout expiry must prove no collected funds' USING ERRCODE = '23514'; END IF;
          IF NEW.kind = 'subscription_cancel' AND NEW.terminal_evidence IS NOT NULL AND (
            NEW.state <> 'no_charge' OR NEW.terminal_evidence->>'version' IS DISTINCT FROM 'stripe-subscription-canceled-v1'
            OR NEW.terminal_evidence->>'status' IS DISTINCT FROM 'canceled'
            OR NEW.terminal_evidence->>'subscriptionId' IS DISTINCT FROM NEW.provider_object_id
            OR NOT EXISTS (SELECT FROM billing.billing_stripe_customer c WHERE c.id = NEW.customer_binding_id
              AND c.account_id = NEW.account_id AND c.stripe_customer_id = NEW.terminal_evidence->>'customerId'
              AND c.stripe_account_id = NEW.terminal_evidence->>'stripeAccountId'
              AND c.livemode::text = NEW.terminal_evidence->>'livemode'))
          THEN RAISE EXCEPTION 'subscription cancellation must match its owned source' USING ERRCODE = '23514'; END IF;
          IF OLD.no_charge_evidence IS NOT NULL AND OLD.no_charge_evidence IS DISTINCT FROM NEW.no_charge_evidence
          THEN RAISE EXCEPTION 'no-charge evidence is immutable' USING ERRCODE = '23514'; END IF;
          IF NEW.no_charge_evidence IS NOT NULL AND (NEW.state <> 'no_charge' OR
            (NEW.no_charge_evidence->>'version') IS DISTINCT FROM 'stripe-no-charge-v1' OR
            (NEW.no_charge_evidence->>'status') IS DISTINCT FROM 'canceled' OR
            (NEW.no_charge_evidence->>'paymentIntentId') IS DISTINCT FROM NEW.provider_object_id OR
            (NEW.no_charge_evidence->>'amountReceived') IS DISTINCT FROM '0' OR
            (NEW.no_charge_evidence->>'amountCapturable') IS DISTINCT FROM '0' OR
            (NEW.no_charge_evidence->>'amountCaptured') IS DISTINCT FROM '0' OR
            NOT EXISTS (SELECT FROM billing.billing_stripe_customer c WHERE c.id = NEW.customer_binding_id
              AND c.account_id = NEW.account_id AND c.stripe_customer_id = NEW.no_charge_evidence->>'customerId'
              AND c.stripe_account_id = NEW.no_charge_evidence->>'stripeAccountId'
              AND c.livemode::text = NEW.no_charge_evidence->>'livemode'))
          THEN RAISE EXCEPTION 'no-charge proof must match the owned provider leg' USING ERRCODE = '23514'; END IF;
          IF OLD.state <> NEW.state AND NOT (
            (OLD.state = 'prepared' AND NEW.state IN ('dispatched','no_charge')) OR
            (OLD.state = 'dispatched' AND NEW.state IN ('known','attention','no_charge','expired')) OR
            (OLD.state = 'known' AND NEW.state IN ('attention','no_charge','expired')) OR
            (OLD.state = 'attention' AND NEW.state IN ('known','no_charge','expired')))
          THEN RAISE EXCEPTION 'invalid provider leg transition' USING ERRCODE = '23514'; END IF;
          IF OLD.dispatch_started_at IS NULL AND NEW.dispatch_started_at IS NOT NULL
            AND NOT (OLD.state = 'prepared' AND NEW.state = 'dispatched')
          THEN RAISE EXCEPTION 'dispatch timestamp requires the winning intent' USING ERRCODE = '23514'; END IF;
          IF (OLD.dispatch_started_at IS NOT NULL AND OLD.dispatch_started_at IS DISTINCT FROM NEW.dispatch_started_at)
            OR (OLD.provider_object_id IS NOT NULL AND OLD.provider_object_id IS DISTINCT FROM NEW.provider_object_id)
            OR (OLD.redirect_url IS NOT NULL AND OLD.redirect_url IS DISTINCT FROM NEW.redirect_url)
            OR (OLD.cancellation_requested_at IS NOT NULL AND OLD.cancellation_requested_at IS DISTINCT FROM NEW.cancellation_requested_at)
            OR (OLD.cancellation_confirmed_at IS NOT NULL AND OLD.cancellation_confirmed_at IS DISTINCT FROM NEW.cancellation_confirmed_at)
            OR (OLD.state <> 'prepared' AND NEW.state = 'prepared')
            OR (OLD.state = 'no_charge' AND NEW.state <> 'no_charge')
          THEN RAISE EXCEPTION 'immutable external dispatch identity' USING ERRCODE = '23514'; END IF;
        WHEN 'stripe_event_inbox' THEN
          mutable := ARRAY['state','attempts','next_attempt_at','error_code','claim_generation','lease_until'];
          IF (OLD.state = 'done' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) OR NEW.claim_generation < OLD.claim_generation OR NEW.attempts < OLD.attempts
          THEN RAISE EXCEPTION 'stale inbox claim' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_stripe_source' THEN
          mutable := ARRAY['generation','lease_until','state','next_attempt_at','error_code'];
          IF NEW.generation < OLD.generation THEN RAISE EXCEPTION 'stale source claim' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_reload_consent' THEN
          mutable := ARRAY['checkout_session_id','setup_intent_id','payment_method_id','payment_method','consented_at',
            'state','consecutive_terminal_failures','last_automatic_started_at','updated_at'];
          IF (OLD.consented_at IS NOT NULL AND NEW.consented_at IS DISTINCT FROM OLD.consented_at)
            OR (OLD.checkout_session_id IS NOT NULL AND NEW.checkout_session_id IS DISTINCT FROM OLD.checkout_session_id)
            OR (OLD.setup_intent_id IS NOT NULL AND NEW.setup_intent_id IS DISTINCT FROM OLD.setup_intent_id)
            OR (OLD.payment_method_id IS NOT NULL AND NEW.payment_method_id IS DISTINCT FROM OLD.payment_method_id)
            OR (OLD.payment_method IS NOT NULL AND NEW.payment_method IS DISTINCT FROM OLD.payment_method)
            OR (OLD.state IN ('revoked','disabled_failures','paused_terms') AND NEW.state <> OLD.state AND NEW.state <> 'revoked')
          THEN RAISE EXCEPTION 'consent terms and verified setup cannot be replaced' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_reload_work' THEN
          mutable := ARRAY['reason_kind','reason_operation_id','reason_attempt_key','reason_request_digest',
            'observed_account_revision','state','generation','lease_until','next_attempt_at','error_code','updated_at'];
          IF NEW.generation < OLD.generation OR NEW.observed_account_revision < OLD.observed_account_revision
          THEN RAISE EXCEPTION 'stale reload work' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_subscription_offer' THEN
          mutable := ARRAY['stripe_schedule_id','schedule_evidence','state','error_code','updated_at'];
          IF OLD.schedule_evidence IS NOT NULL AND NEW.schedule_evidence IS DISTINCT FROM OLD.schedule_evidence
          THEN RAISE EXCEPTION 'renewal confirmation evidence is immutable' USING ERRCODE = '23514'; END IF;
          IF OLD.stripe_schedule_id IS NOT NULL AND NEW.stripe_schedule_id IS DISTINCT FROM OLD.stripe_schedule_id
          THEN RAISE EXCEPTION 'renewal schedule identity is immutable' USING ERRCODE = '23514'; END IF;
          IF OLD.state = 'confirmed' AND NEW.state <> 'confirmed'
          THEN RAISE EXCEPTION 'confirmed renewal terms cannot regress' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_account_closure' THEN
          mutable := ARRAY['state','generation','lease_until','next_attempt_at','attempt_count','auth_deleted_at',
            'closed_at','attention_code','updated_at'];
          IF NEW.generation < OLD.generation OR NEW.attempt_count < OLD.attempt_count
            OR (OLD.auth_deleted_at IS NOT NULL AND NEW.auth_deleted_at IS DISTINCT FROM OLD.auth_deleted_at)
            OR (OLD.closed_at IS NOT NULL AND NEW.closed_at IS DISTINCT FROM OLD.closed_at)
            OR (OLD.state = 'closed' AND NEW.state <> 'closed')
          THEN RAISE EXCEPTION 'closure cannot erase completed evidence' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_refund_intent' THEN
          mutable := ARRAY['hold_state','state','confirmed_at','error_code','updated_at'];
          IF (OLD.hold_state <> 'held' AND NEW.hold_state <> OLD.hold_state)
            OR (OLD.confirmed_at IS NOT NULL AND NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at)
            OR (OLD.state IN ('succeeded','failed','canceled') AND NEW.state <> OLD.state)
          THEN RAISE EXCEPTION 'refund disposition cannot regress' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_cash_scan' THEN
          mutable := ARRAY['balance_cursor','payment_intent_cursor','charge_cursor','refund_cursor','journal_cursor','fact_cursor',
            'balance_done','payment_intent_done','charge_done','refund_done','journal_done','fact_done','state','generation',
            'lease_until','attempts','next_attempt_at','error_code','completed_at'];
          IF NEW.generation < OLD.generation OR NEW.attempts < OLD.attempts
            OR (OLD.state = 'complete' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW))
            OR (OLD.balance_done AND NOT NEW.balance_done) OR (OLD.payment_intent_done AND NOT NEW.payment_intent_done)
            OR (OLD.charge_done AND NOT NEW.charge_done) OR (OLD.refund_done AND NOT NEW.refund_done)
            OR (OLD.journal_done AND NOT NEW.journal_done) OR (OLD.fact_done AND NOT NEW.fact_done)
          THEN RAISE EXCEPTION 'cash scan coverage cannot regress' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_financial_case' THEN
          mutable := ARRAY['evidence','owner','next_step','state','first_effective_at','last_seen_at','deadline_at','known_amount_minor',
            'resolved_at','resolution_evidence'];
          IF (OLD.first_effective_at IS NOT NULL AND (NEW.first_effective_at IS NULL OR NEW.first_effective_at > OLD.first_effective_at))
            OR (OLD.deadline_at IS NOT NULL AND (NEW.deadline_at IS NULL OR NEW.deadline_at > OLD.deadline_at))
          THEN RAISE EXCEPTION 'case deadline cannot be postponed' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_recovery_notice' THEN
          mutable := ARRAY['state','generation','lease_until','next_attempt_at','attempt_count','error_code',
            'delivery_receipt','delivered_at','updated_at'];
          IF NEW.generation < OLD.generation OR NEW.attempt_count < OLD.attempt_count
            OR (OLD.state = 'delivered' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW))
          THEN RAISE EXCEPTION 'notification delivery cannot regress' USING ERRCODE = '23514'; END IF;
        WHEN 'billing_reversal_case' THEN
          mutable := ARRAY['net_applied_atoms','deferred_issued_atoms','cumulative_principal_loss_minor',
            'cumulative_tax_loss_minor','cumulative_gross_loss_minor','projection_digest','projection_source_id',
            'projection_source_generation','projection_observed_at','projection_evidence','updated_at'];
          IF NEW.deferred_issued_atoms < OLD.deferred_issued_atoms
            OR (OLD.projection_source_generation IS NOT NULL AND NEW.projection_source_generation < OLD.projection_source_generation)
          THEN RAISE EXCEPTION 'cash issuance/source generation cannot regress' USING ERRCODE = '23514'; END IF;
        WHEN 'subscription' THEN
          mutable := ARRAY['stripe_subscription_id','status','cancel_at_period_end','canceled_at','ended_at','slot_state','paid_through','failed_renewal_invoice_id','dunning_started_at','grace_ends_at','updated_at'];
          IF (OLD.stripe_subscription_id IS NOT NULL AND OLD.stripe_subscription_id IS DISTINCT FROM NEW.stripe_subscription_id)
            OR (OLD.paid_through IS NOT NULL AND (NEW.paid_through IS NULL OR NEW.paid_through < OLD.paid_through))
            OR (OLD.failed_renewal_invoice_id IS NOT NULL AND NEW.failed_renewal_invoice_id IS NOT NULL
              AND ROW(OLD.failed_renewal_invoice_id,OLD.dunning_started_at,OLD.grace_ends_at)
                IS DISTINCT FROM ROW(NEW.failed_renewal_invoice_id,NEW.dunning_started_at,NEW.grace_ends_at))
            OR (OLD.failed_renewal_invoice_id IS NOT NULL AND NEW.failed_renewal_invoice_id IS NULL
              AND (NEW.paid_through IS NULL OR NEW.paid_through <= OLD.dunning_started_at))
          THEN RAISE EXCEPTION 'subscription evidence cannot regress or extend grace' USING ERRCODE = '23514'; END IF;
        ELSE RAISE EXCEPTION 'unsupported payment identity table';
        END CASE;
        IF (to_jsonb(OLD) - mutable) IS DISTINCT FROM (to_jsonb(NEW) - mutable)
        THEN RAISE EXCEPTION 'immutable payment identity or terms' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$`;
    await Promise.all(
      [
        'billing_reload_consent',
        'billing_reload_work',
        'billing_subscription_offer',
        'billing_account_closure',
        'billing_refund_intent',
        'billing_cash_scan',
        'billing_financial_case',
        'billing_recovery_notice',
        'billing_reversal_case',
        'billing_stripe_customer',
        'billing_purchase',
        'billing_period',
        'billing_provider_leg',
        'stripe_event_inbox',
        'billing_stripe_source',
        'subscription',
      ].map(async (table) => {
        const namespace = table === 'subscription' ? 'public' : 'billing';
        await transaction.unsafe(`DROP TRIGGER IF EXISTS protect_payment_identity ON ${namespace}."${table}"`);
        await transaction.unsafe(
          `CREATE TRIGGER protect_payment_identity BEFORE UPDATE OR DELETE ON ${namespace}."${table}" FOR EACH ROW EXECUTE FUNCTION billing.protect_payment_identity()`,
        );
      }),
    );
    await transaction`CREATE OR REPLACE FUNCTION billing.require_financial_closure() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$ BEGIN
        PERFORM a.id FROM billing.credit_account a JOIN billing.billing_owner_binding b ON b.account_id = a.id
          WHERE b.auth_user_id = OLD.id ORDER BY a.id FOR UPDATE OF a;
        IF EXISTS (SELECT FROM billing.billing_owner_binding b WHERE b.auth_user_id = OLD.id AND (
          b.revoked_at IS NULL OR NOT EXISTS (SELECT FROM billing.billing_account_closure c
            WHERE c.account_id = b.account_id AND c.binding_id = b.id AND c.environment = b.environment
              AND c.binding_revoked_at IS NOT NULL AND c.obligations_frozen_at IS NOT NULL
              AND c.state IN ('cancellation_pending','ready_for_auth_deletion','closed'))))
        THEN RAISE EXCEPTION 'financial closure must precede auth deletion' USING ERRCODE = '23514'; END IF;
        UPDATE billing.billing_account_closure c SET auth_deleted_at = coalesce(c.auth_deleted_at, clock_timestamp()),
          updated_at = clock_timestamp() FROM billing.billing_owner_binding b
          WHERE b.auth_user_id = OLD.id AND c.account_id = b.account_id AND c.binding_id = b.id;
        RETURN OLD;
      END $$`;
    await transaction`DROP TRIGGER IF EXISTS require_financial_closure ON public."user"`;
    await transaction`CREATE TRIGGER require_financial_closure BEFORE DELETE ON public."user"
      FOR EACH ROW EXECUTE FUNCTION billing.require_financial_closure()`;
    await transaction`REVOKE ALL ON FUNCTION billing.require_financial_closure() FROM PUBLIC`;
    await transaction`CREATE OR REPLACE FUNCTION billing.require_paid_receipt() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$ BEGIN
        IF NEW.kind IN ('purchase_grant', 'period_grant') AND
          num_nonnulls(NEW.stripe_account_id, NEW.livemode, NEW.payment_intent_id, NEW.charge_id) <> 4
        THEN RAISE EXCEPTION 'paid journal requires canonical collected source' USING ERRCODE = '23514'; END IF;
        IF NEW.kind = 'purchase_grant' AND NOT EXISTS (
          SELECT FROM billing.billing_purchase p WHERE p.id = NEW.purchase_id AND p.account_id = NEW.account_id
            AND p.state = 'fulfilled' AND p.receipt_id = NEW.id AND p.fulfilled_revision = NEW.revision AND p.granted_atoms = NEW.account_delta_atoms
            AND p.offer_snapshot->>'stripeAccountId' = NEW.stripe_account_id AND p.offer_snapshot->>'livemode' = NEW.livemode::text
            AND p.paid_evidence->>'stripeAccountId' = NEW.stripe_account_id AND p.paid_evidence->>'livemode' = NEW.livemode::text
            AND p.paid_evidence->'paymentIntentIds' = jsonb_build_array(NEW.payment_intent_id)
            AND p.paid_evidence->'chargeIds' = jsonb_build_array(NEW.charge_id))
        THEN RAISE EXCEPTION 'purchase journal requires atomic fulfilled cause' USING ERRCODE = '23514'; END IF;
        IF NEW.kind = 'period_grant' AND NOT EXISTS (
          SELECT FROM billing.billing_period p WHERE p.id = NEW.period_id AND p.account_id = NEW.account_id
            AND p.state = 'fulfilled' AND p.receipt_id = NEW.id AND p.fulfilled_revision = NEW.revision AND p.granted_atoms = NEW.account_delta_atoms
            AND p.offer_snapshot->>'stripeAccountId' = NEW.stripe_account_id AND p.offer_snapshot->>'livemode' = NEW.livemode::text
            AND p.paid_evidence->>'stripeAccountId' = NEW.stripe_account_id AND p.paid_evidence->>'livemode' = NEW.livemode::text
            AND p.paid_evidence->'paymentIntentIds' = jsonb_build_array(NEW.payment_intent_id)
            AND p.paid_evidence->'chargeIds' = jsonb_build_array(NEW.charge_id))
        THEN RAISE EXCEPTION 'period journal requires atomic fulfilled cause' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$`;
    await transaction`CREATE OR REPLACE FUNCTION billing.require_cash_conservation() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog AS $$
      DECLARE c billing.billing_reversal_case%ROWTYPE; initial_amount bigint; deferred_amount numeric; reversed_amount numeric;
      BEGIN
        SELECT * INTO c FROM billing.billing_reversal_case WHERE id = NEW.id;
        IF c.initial_issued_atoms IS NULL THEN RETURN NEW; END IF;
        SELECT account_delta_atoms INTO initial_amount FROM billing.credit_transaction
          WHERE id = c.canonical_receipt_id AND account_id = c.account_id AND kind IN ('purchase_grant','period_grant');
        SELECT coalesce(sum(account_delta_atoms) FILTER (WHERE kind = 'deferred_grant'),0),
          coalesce(-sum(account_delta_atoms) FILTER (WHERE kind = 'reversal'),0)
          INTO deferred_amount,reversed_amount FROM billing.credit_transaction WHERE reversal_case_id = c.id;
        IF initial_amount IS DISTINCT FROM c.initial_issued_atoms OR deferred_amount <> c.deferred_issued_atoms
          OR reversed_amount <> c.net_applied_atoms
          OR c.initial_issued_atoms::numeric + c.deferred_issued_atoms - c.net_applied_atoms
            <> c.original_atoms::numeric - floor(c.original_atoms::numeric * c.cumulative_principal_loss_minor / c.original_principal_minor)
        THEN RAISE EXCEPTION 'cash entitlement must match atomic receipts and cumulative source loss' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$`;
    await transaction`DROP TRIGGER IF EXISTS require_cash_conservation ON billing.billing_reversal_case`;
    await transaction`CREATE CONSTRAINT TRIGGER require_cash_conservation AFTER INSERT OR UPDATE ON billing.billing_reversal_case
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.require_cash_conservation()`;
    await transaction`REVOKE ALL ON FUNCTION billing.require_cash_conservation() FROM PUBLIC`;
    await transaction`DROP TRIGGER IF EXISTS require_paid_receipt ON billing.credit_transaction`;
    await transaction`CREATE CONSTRAINT TRIGGER require_paid_receipt AFTER INSERT ON billing.credit_transaction
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION billing.require_paid_receipt()`;
    await transaction`REVOKE ALL ON FUNCTION billing.protect_payment_identity(), billing.require_paid_receipt() FROM PUBLIC`;
  });
}
