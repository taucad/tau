/**
 * Redis Lua scripts for the credit-ledger hot path (AD3), registered via
 * ioredis `defineCommand` (EVALSHA with automatic NOSCRIPT re-EVAL).
 *
 * Data model (B2 design pass, plan deviation 10 — hold-only reservations):
 * - `tau:credits:{userId}`     hash: grant, topup, reserved, version (µ$ as
 *   Lua numbers — exact to 2^53, a $9.0B ceiling per AD16).
 * - `tau:credits:res:{userId}` hash: reservationId → "amount:floor:expiresAtMs".
 *   Expiry is EMBEDDED (the sweeper enforces it); per-reservation TTL keys
 *   would vanish with their amounts and permanently orphan `reserved`.
 *
 * Reserve only HOLDS (`reserved += amount` after an availability check); the
 * topup-first/grant-second split happens once, at commit, with actuals.
 * Reservations are never journaled — `SUM(credit_transaction) == grant+topup`
 * stays exact (C12). Every script returns `{-99}` when the account hash is
 * missing so the service can rehydrate from Postgres and retry once.
 */

export const missingAccountSentinel = -99;

/**
 * KEYS[1]=account hash, KEYS[2]=reservation hash.
 * ARGV[1]=amountMicro, ARGV[2]=reservationId, ARGV[3]=floorMicro, ARGV[4]=expiresAtMs.
 * Returns {1, balance, reserved} on success, {0, balance} on insufficient
 * funds (debt blocks all reserves — Q37), {-99} when the hash is missing.
 */
export const creditReserveLua = `
local acct = KEYS[1]
if redis.call('EXISTS', acct) == 0 then
  return {-99}
end
local grant = tonumber(redis.call('HGET', acct, 'grant')) or 0
local topup = tonumber(redis.call('HGET', acct, 'topup')) or 0
local reserved = tonumber(redis.call('HGET', acct, 'reserved')) or 0
local amount = tonumber(ARGV[1])
local balance = grant + topup
if balance <= 0 or (balance - reserved) < amount then
  return {0, balance}
end
redis.call('HINCRBY', acct, 'reserved', amount)
redis.call('HINCRBY', acct, 'version', 1)
redis.call('HSET', KEYS[2], ARGV[2], ARGV[1] .. ':' .. ARGV[3] .. ':' .. ARGV[4])
return {1, balance, reserved + amount}
`;

/**
 * KEYS[1]=account hash, KEYS[2]=reservation hash.
 * ARGV[1]=reservationId, ARGV[2]=actualMicro.
 * Idempotent: a missing reservation entry returns {0} (already settled or
 * swept — compaction retries and double commits are safe). On success returns
 * {1, grant, topup, reserved, topupDraw, version}.
 */
export const creditCommitLua = `
local acct = KEYS[1]
if redis.call('EXISTS', acct) == 0 then
  return {-99}
end
local entry = redis.call('HGET', KEYS[2], ARGV[1])
if not entry then
  return {0}
end
local sep1 = string.find(entry, ':', 1, true)
local reservedAmount = tonumber(string.sub(entry, 1, sep1 - 1))
redis.call('HDEL', KEYS[2], ARGV[1])
local reserved = tonumber(redis.call('HGET', acct, 'reserved')) or 0
reserved = reserved - reservedAmount
if reserved < 0 then reserved = 0 end
redis.call('HSET', acct, 'reserved', reserved)
local actual = tonumber(ARGV[2])
local topup = tonumber(redis.call('HGET', acct, 'topup')) or 0
local grant = tonumber(redis.call('HGET', acct, 'grant')) or 0
local topupDraw = math.min(topup, actual)
topup = topup - topupDraw
grant = grant - (actual - topupDraw)
local version = redis.call('HINCRBY', acct, 'version', 1)
redis.call('HSET', acct, 'grant', grant, 'topup', topup)
return {1, grant, topup, reserved, topupDraw, version}
`;

/**
 * KEYS[1]=account hash, KEYS[2]=reservation hash. ARGV[1]=reservationId.
 * Full release for provider-rejected calls (Q36's only free path). Idempotent.
 * Returns {1, version} on release, {0} when already settled, {-99} on a
 * missing hash.
 */
export const creditReleaseLua = `
local acct = KEYS[1]
if redis.call('EXISTS', acct) == 0 then
  return {-99}
end
local entry = redis.call('HGET', KEYS[2], ARGV[1])
if not entry then
  return {0}
end
local sep1 = string.find(entry, ':', 1, true)
local reservedAmount = tonumber(string.sub(entry, 1, sep1 - 1))
redis.call('HDEL', KEYS[2], ARGV[1])
local reserved = tonumber(redis.call('HGET', acct, 'reserved')) or 0
reserved = reserved - reservedAmount
if reserved < 0 then reserved = 0 end
redis.call('HSET', acct, 'reserved', reserved)
local version = redis.call('HINCRBY', acct, 'version', 1)
return {1, version}
`;

/**
 * KEYS[1]=account hash, KEYS[2]=reservation hash.
 * ARGV[1]=grantMicro, ARGV[2]=topupMicro.
 * Set-if-absent rehydration: recomputes `reserved` from surviving reservation
 * entries so a Redis flush cannot orphan holds. The EXISTS guard settles
 * cross-instance rehydrate races. Returns 1 when seeded, 0 when it lost.
 */
export const creditRehydrateLua = `
local acct = KEYS[1]
if redis.call('EXISTS', acct) == 1 then
  return 0
end
local reserved = 0
local entries = redis.call('HVALS', KEYS[2])
for _, entry in ipairs(entries) do
  local sep1 = string.find(entry, ':', 1, true)
  reserved = reserved + (tonumber(string.sub(entry, 1, sep1 - 1)) or 0)
end
redis.call('HSET', acct, 'grant', ARGV[1], 'topup', ARGV[2], 'reserved', reserved, 'version', 0)
return 1
`;

/**
 * KEYS[1]=account hash, KEYS[2]=reservation hash (unused; kept for a uniform
 * key signature). ARGV[1]=amountMicro.
 * Reservation-less debit for bounded secondary surfaces (name/commit
 * generators, code completion). May drive the balance negative (Q37).
 * Returns {1, grant, topup, reserved, topupDraw, version}.
 */
export const creditDebitLua = `
local acct = KEYS[1]
if redis.call('EXISTS', acct) == 0 then
  return {-99}
end
local actual = tonumber(ARGV[1])
local topup = tonumber(redis.call('HGET', acct, 'topup')) or 0
local grant = tonumber(redis.call('HGET', acct, 'grant')) or 0
local topupDraw = math.min(topup, actual)
if topupDraw < 0 then topupDraw = 0 end
topup = topup - topupDraw
grant = grant - (actual - topupDraw)
local version = redis.call('HINCRBY', acct, 'version', 1)
local reserved = tonumber(redis.call('HGET', acct, 'reserved')) or 0
redis.call('HSET', acct, 'grant', grant, 'topup', topup)
return {1, grant, topup, reserved, topupDraw, version}
`;
