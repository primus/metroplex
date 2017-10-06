--
-- Gather all the information.
--
local namespace = '{namespace}'
local address = assert(KEYS[1], 'The server address is missing')
local expire = assert(ARGV[1], 'The expire argument is missing')
local timestamp = assert(ARGV[2], 'The timestamp argument is missing')

--
-- Remove all sparks associated to this address.
--
local sparks = redis.call('SMEMBERS', namespace .. address ..':sparks')

if #sparks > 0 then
  redis.call('HDEL', namespace ..'sparks', unpack(sparks))
  redis.call('DEL', namespace .. address ..':sparks')
end

--
-- Set the expiring key for this address and add it "servers" set.
--
redis.call('SADD', namespace ..'servers', address)
redis.call('PSETEX', namespace .. address, expire, timestamp)

return 1
