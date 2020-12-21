# Metroplex

[![Version npm](https://img.shields.io/npm/v/metroplex.svg?style=flat-square)](https://www.npmjs.com/package/metroplex)[![Build Status](https://img.shields.io/github/workflow/status/primus/metroplex/CI/master?label=CI&style=flat-square)](https://github.com/primus/metroplex/actions?query=workflow%3ACI+branch%3Amaster)[![Dependencies](https://img.shields.io/david/primus/metroplex.svg?style=flat-square)](https://david-dm.org/primus/metroplex)[![Coverage Status](https://img.shields.io/coveralls/primus/metroplex/master.svg?style=flat-square)](https://coveralls.io/r/primus/metroplex?branch=master)[![IRC channel](https://img.shields.io/badge/IRC-irc.freenode.net%23primus-00a8ff.svg?style=flat-square)](https://webchat.freenode.net/?channels=primus)

Metroplex a Redis based spark/connection registry for Primus.

## Installation

Metroplex is released in the npm registry and can therefor be installed using:

```
npm install --save metroplex
```

Once you've installed the module you need to tell Primus to use the plugin which
is done using the `primus.plugin` method:

```js
'use strict';

var http = require('http').createServer()
  , Primus = require('primus')
  , primus = new Primus(http, { transformer: 'sockjs' });

primus.plugin('metroplex', require('metroplex'));
```

## Usage

In the example above you've seen how to add the plugin to your Primus server but
not how to configure it. We have various of options that can be configured in
this plugin:

- *redis*: Metroplex is currently using Redis as its default back-end for storing
  the state of the connections. If you do not supply us with a pre-defined Redis
  client (or authorized) we will create a Redis client which only connects to
  localhost and Redis's default port number. When provided this must be an
  [`ioredis`](https://github.com/luin/ioredis) client.
- *namespace*: As the databases are usually shared with other programs it's good
  to prefix all the data that you store, in Metroplex we prefix every key with
  the set namespace. The default namespace is `metroplex`.
- *interval*: We are using "alive" suffixed keys in the database to see which
  node process is still alive. The interval determines the interval of these
  updates. When the interval is reached we update the key in the database with
  the current EPOCH as well as start a scan for possible dead servers and
  removing them. The default interval `300000` ms
- *latency*: The maximum time it would take to update the `alive` key in Redis.
  This time is subtracted from the set `interval` so we update the key BEFORE
  it expires. Defaults to `2000` ms.
- *address* The address or public URL on which this SPECIFIC server is
  reachable. Should be without path name. When nothing is supplied we try to be
  somewhat smart and read the address and port and server type from the server
  that Primus is attached to and compose an URL like: `http://0.0.0.0:8080` from
  it.

These options should be provided in the options object of the Primus server:

```js
primus = new Primus(http, {
  transformer: 'sockjs',
  namespace: 'metroplex',
  redis: require('redis').createClient()
});

primus.plugin('metroplex', require('metroplex'));
```

### Metroplex

The orchestration is all done using the `metroplex` library which is bundled in
this plugin. The Metroplex instance is exposed on the `Primus` instance when you
use this plugin:

```js
primus.metroplex.servers(function (err, servers) {
  console.log('registered servers:', servers);
});
```

The following **public** methods are available.

#### metroplex.servers

```js
metroplex.servers(fn)
```

List all the servers in our current registry.

```js
metroplex.servers(function (err, servers) {
  console.log(servers);
});
```

#### metroplex.spark

```js
metroplex.spark(id, fn)
```

Get the server for the given spark id. It does not check if the spark is hosted
on the current server. That's up to the developer to implement.

```js
metroplex.spark(id, function (err, server) {
  console.log(server);
});
```

#### metroplex.sparks

```js
metroplex.sparks(sparks, fn)
```

Get the servers for each id in the given `sparks` array. It will return an
object and just like `metroplex.spark` it does not check if the spark is hosted
on the current server.

### Omega Supreme integration

If you load the [`omega-supreme`](https://github.com/primus/omega-supreme/)
plugin before `metroplex`, you can use some additional convenience methods.
These methods are added to the `primus.forward` object:

#### forward.broadcast

```js
forward.broadcast(msg, fn)
```

Broadcast a message to all sparks in the cluster.

```js
forward.broadcast('data', function (err, result) {
  // result is an object with details about the result of the operation.
  console.log(result);
});
```

#### forward.sparks

```
forward.sparks(ids, msg, fn)
```

Send a message to a set of sparks in the cluster.

```js
forward.sparks(['ad8a-280z-18', 'y97x-42480-13'], 'data', function (err, result) {
  console.log(result);
});
```

#### forward.spark

```
forward.spark(id, msg, fn)
```

Send a message to a single spark in the cluster.

```js
forward.spark('ad8a-280z-18', 'data', function (err, result) {
  console.log(result);
});
```

## License

[MIT](LICENSE)

![Metroplex](https://raw.githubusercontent.com/primus/metroplex/master/logo.jpg)
