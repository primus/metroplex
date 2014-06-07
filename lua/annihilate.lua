--
-- Gather all the information.
--
local namespace = '{leverage::namespace}'
local address = assert(KEYS[1], 'The server address is missing')

local sparks = redis.call('SMEMBERS', namespace ..':'.. address)

--
-- Iterate over all the sparks in our collection and completely nuke every spark
-- which is connected on the given server address as it's dead.
--
for spark in sparks do
  redis.call('HDEL', namespace ..':sparks', spark)
end

--
-- Delete all left over references to this server address
--
redis.call('SREM', namespaces ..':servers', address);
redis.call('DEL', namespace ..':'.. address);

return 1
