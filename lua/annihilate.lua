--
-- Gather all the information.
--
local namespace = '{leverage::namespace}'
local address = assert(KEYS[1], 'The server address is missing')

--
-- Get all the sparks for our given address so we can nuke them from our "global"
-- spark registry>
--
local sparks = redis.call('SMEMBERS', namespace ..':'.. address ..':sparks')

--
-- Iterate over all the sparks in our collection and completely nuke every spark
-- which is connected on the given server address as it's dead.
--
for i = 1, #sparks do
  redis.call('HDEL', namespace ..':sparks', sparks[i])
end

--
-- Delete all left over references to this server address which are:
-- 
-- 1. Our dedicated sparks set
-- 2. Our server in the servers list
-- 3. The keep alive server update
--
redis.call('DEL', namespace ..':'.. address ..':sparks');
redis.call('SREM', namespace ..':servers', address);
redis.call('DEL', namespace ..':'.. address);

return 1
