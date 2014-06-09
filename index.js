'use strict';

var Leverage = require('leverage');

//
// Expose the Metroplex plugin.
//
var metroplex = module.exports;

/**
 * Add defaults to the supplied options. The following options are available:
 *
 * - redis: The Redis instance we should use to store data
 * - namespace: The namespace prefix to prevent collision's.
 * - interval: Expire interval to keep the server alive in Redis
 * - timeout: Timeout for sparks who are alive.
 * - latency: Time it takes for our Redis commands to execute.
 *
 * @param {Primus} primus The Primus instance that received the plugin.
 * @param {Object} options Configuration.
 * @returns {Object} Options.
 * @api public
 */
metroplex.options = function optional(primus, options) {
  var address = primus.server.address();

  options = options || {};

  options.redis = options.redis || require('redis').createClient();
  options.namespace = options.namespace || 'metroplex';
  options.interval = options.interval || 5 * 60 * 1000;
  options.timeout = options.timeout || 30 * 60;
  options.latency = options.latency || 2000;

  if (address) {
    options.address = options.address || 'http://localhost:'+ address.port;
  }

  options.leverage = new Leverage(options.redis, {
    namespace: options.namespace
  });

  return options;
};

/**
 * Keep the presence or "state" of each connection in Redis.
 *
 * @param {Primus} primus The Primus instance that received the plugin.
 * @param {Object} options The options that were supplied to Primus.
 * @api public
 */
metroplex.server = function server(primus, options)  {
  primus.options = options = metroplex.options(primus, options);

  var namespace = options.namespace +':'
    , address = options.address
    , redis = options.redis;

  primus.on('connection', function connection(spark) {
    redis.multi()
      .hadd(namespace +':sparks', spark.id, address)
      .sadd(namespace +':'+ address, spark.id)
    .exec();
  }).on('disconnection', function disconnection(spark) {
    redis.multi()
      .hdel(namespace +':sparks', spark.id)
      .srem(namespace +':'+ address, spark.id)
    .exec();
  });

  primus.on('close', function close() {
    if (address) redis.srem(namespace +':servers', address, function (err) {
      if (err) return console.error('metroplex:unregister:error', err.stack);

      primus.emit('unregister', address);
    });
  }).server.on('listening', function listening() {
    var local = 'http://localhost:'+ primus.server.address().port
      , stored = !!options.address;

    //
    // We can only get the server's port number when the server starts
    // listening. So if our address is still undefined, it's only now that we
    // can provide a default value.
    //
    address = options.address = options.address || local;

    //
    // Only store the address if we haven't stored it already.
    //
    if (!stored) metroplex.register(primus, options);
  });

  //
  // Extend the list of reserved events with `metroplex` events.
  //
  ['register', 'unregister'].forEach(function reserved(event) {
    primus.reserved.events[event] = 1;
  });

  /**
   * Get all current registered servers except our selfs.
   *
   * @param {Function} fn Callback
   * @api private
   */
  primus.servers = function servers(fn) {
    redis.smembers(namespace +':servers', function (err, members) {
      fn(err, (members || []).filter(function filter(address) {
        return address !== options.address;
      }));
    });
  };

  if (address) metroplex.register(primus, options);

  //
  // We need to make sure that this server is alive, the most easy and dirty way
  // of doing this is setting an interval which bumps the expire of our
  // dedicated server key. If we go off line, the key will expire and we will be
  // K.O. The value indicates the last "ping" that we got from the node server
  // so you can see when the last update was.
  //
  var alive = setInterval(function interval() {
    redis.setex(namespace +':'+ address, options.interval, Date.now());
  }, options.interval - options.latency);

  if ('function' === alive.unref) alive.unref();
};

/**
 * Scan the Redis database for dead servers and reap the dead servers.
 *
 * @param {Primus} primus Our current Primus instance.
 * @param {Object} options The options.
 * @api private
 */
metroplex.scan = function scan(primus, options) {
  var namespace = options.namespace
    , leverage = options.leverage
    , redis = options.redis;

  primus.servers(function find(err, servers) {
    if (err) console.error('metroplex:scan:error', err.stack);
    
    servers.forEach(function expired(address) {
      redis.get(namespace +':'+ address, function get(err, stamp) {
        if (err) return console.error('metroplex:scan:error', err.stack);
        if (Date.now() - +stamp < options.interval) return;

        leverage.annihilate(address);
      });
    });
  });
};

/**
 * Register a new Primus server in the Redis database.
 *
 * @param {Primus} primus Our current Primus instance.
 * @param {Object} options The options.
 * @api private
 */
metroplex.register = function register(primus, options) {
  var namespace = options.namespace
    , leverage = options.leverage
    , redis = options.redis;

  leverage.annihilate(options.address, function (err) {
    if (err) return console.error('metroplex:register:error', err.stack);

    redis.multi()
      .setex(namespace +':'+ options.address, options.interval, Date.now())
      .sadd(namespace +':servers', options.address)
    .exec(function register(err) {
      if (err) return console.error('metroplex:register:error', err.stack);

      primus.emit('register', options.address);
    });
  });
};
