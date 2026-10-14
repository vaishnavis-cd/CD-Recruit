/**
 * Atomic Lua script to store a single Piston test case result into Redis hash,
 * set expiration, check if all test cases have arrived, and attempt to acquire
 * an atomic single-shot enqueue lock for outbound processor.
 *
 * KEYS[1]: execution:<executionId>:cases    (Hash storing caseIndex -> CaseResult JSON)
 * KEYS[2]: execution:<executionId>:enqueued (String lock flag preventing duplicate outbound enqueues)
 * ARGV[1]: caseIndex                        (String/Integer)
 * ARGV[2]: caseResultJson                   (String)
 * ARGV[3]: totalTests                       (Integer)
 * ARGV[4]: ttlSeconds                       (Integer, e.g. 600)
 *
 * Returns 1 if all test cases are received AND this call successfully acquired the single-shot enqueue lock.
 * Returns 0 otherwise.
 */
export const PISTON_ACCUMULATE_AND_CHECK_LUA = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[4])
local currentCount = redis.call('HLEN', KEYS[1])
local targetCount = tonumber(ARGV[3])

if currentCount >= targetCount then
    local acquired = redis.call('SET', KEYS[2], '1', 'EX', ARGV[4], 'NX')
    if acquired then
        return 1
    end
end

return 0
`;
