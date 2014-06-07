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
  options = metroplex.options(primus, options);

  var namespace = options.namespace +':'
    , leverage = options.leverage
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
    redis.srem(namespace +':servers', address);
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
    if (!stored) {
      leverage.annihilate(address);
      redis.multi()
        .setex(namespace +':'+ address, options.interval, Date.now())
        .sadd(namespace +':servers', address)
      .exec();
    }
  });

  if (address) {
    leverage.annihilate(address);
    redis.multi()
      .setex(namespace +':'+ address, options.interval, Date.now())
      .sadd(namespace +':servers', address)
    .exec();
  }

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
 * @api private
 */
metroplex.scan = function scan(options) {
  var namespace = options.namespace
    , leverage = options.leverage
    , redis = options.redis;

  /**
   * Check if the given server is expired. If it's expired we need to nuke all
   * the references from the redis database and assume that everything is FUBAR.
   *
   * @param {String} address The server address
   * @api private
   */
  function expired(address) {
    redis.get(namespace +':'+ address, function get(err, stamp) {
      if (err || Date.now() - +stamp < options.interval) return;

      leverage.annihilate(address);
    });
  }

  redis.smembers(namespace +':servers', function has(err, members) {
    members.filter(function filter(address) {
      return address !== options.address;
    }).forEach(expired);
  });
};
