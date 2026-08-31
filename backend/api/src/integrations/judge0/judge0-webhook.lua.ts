/**
 * Atomic Lua script to store a single Judge0 test case result into Redis,
 * set expiration, check if all test cases have arrived, and attempt to acquire
 * an atomic single-shot enqueue lock.
 *
 * KEYS[1]: execution:<executionId>:results  (Hash)
 * KEYS[2]: execution:<executionId>:enqueued (Lock flag)
 * ARGV[1]: token                           (String)
 * ARGV[2]: resultJson                      (String)
 * ARGV[3]: totalTests                      (Integer)
 * ARGV[4]: ttlSeconds                      (Integer, e.g. 600)
 *
 * Returns 1 if all test cases are received AND this call successfully acquired the single-shot enqueue lock.
 * Returns 0 otherwise.
 */
export const JUDGE0_ACCUMULATE_AND_LOCK_LUA = `
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
