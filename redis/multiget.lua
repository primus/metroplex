local namespace = '{leverage::namespace}'
local prefix = KEYS[1]
local keys = KEYS[2]
local result = { }

for key in string.gmatch(keys, '([^,]+)') do
  result[key] = redis.call('GET', namespace .. prefix .. key)
end

return cjson.encode(result)
