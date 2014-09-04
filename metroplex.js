'use strict';

var Leverage = require('leverage')
  , https = require('https')
  , fuse = require('fusing')
  , ip = require('ip');

//
// Ensure that the directory for our custom lua scripts is set correctly.
//
Leverage.scripts = Leverage.scripts.concat(
  Leverage.introduce(require('path').join(__dirname, 'redis'), Leverage.prototype)
);

/**
 * Add defaults to the supplied options. The following options are available:
 *
 * - redis: The Redis instance we should use to store data
 * - namespace: The namespace prefix to prevent collisions (default: 'metroplex').
 * - interval: Expire interval to keep the server alive in Redis (default: 5 minutes)
 * - latency: Time it takes for our Redis commands to execute. (default: 500 ms)
 * - sparkTimeout: Timeout for sparks who are alive.  This should be greater than the client ping interval. (default: 1 minute)
 *
 * @param {Primus} primus The Primus instance that received the plugin.
 * @param {Object} options Configuration.
 * @returns {Object} Options.
 * @api public
 */
function Metroplex(primus, options) {
  if (!(this instanceof Metroplex)) return new Metroplex(primus, options);

  options = options || {};
  primus = primus || {};

  var parsed = this.parse(primus.server);

  this.fuse();

  this.redis = options.redis || require('redis').createClient();
  this.namespace = (options.namespace || 'metroplex') +':';
  this.interval = options.interval || 5 * 60 * 1000;
  this.sparkTimeout = options.sparkTimeout || 60 * 1000;
  this.latency = options.latency || 500;
  this.leverage = new Leverage(this.redis, {
    namespace: this.namespace
  });

  if (parsed || options.address) {
    this.register(options.address || parsed);
  }
}

fuse(Metroplex, require('eventemitter3'));

/**
 * Parse our the connection URL from a given HTTP server instance or string.
 *
 * @param {Server} server HTTP or HTTPS server instance we should read address from
 * @returns {String} The address
 * @api public
 */
Metroplex.readable('parse', function parse(server) {
  if ('string' === typeof server || !server) return server || '';

  var secure = server instanceof https.Server || 'function' === typeof server.addContext
    , address = server.address ? server.address() : undefined;

  //
  // If the HTTP server isn't listening yet to a port number the result of
  // .address will be undefined. We can only get the location
  //
  if (!address) return '';

  //
  // Seriously, 0.0.0.0 is basically localhost. Get the correct address for it.
  //
  if (address.address === '0.0.0.0') {
    address.address = ip.address();
  }

  return 'http'+ (secure ? 's' : '') +'://'+ address.address +':'+ address.port;
});

/**
 * Register a new server/address in the Metroplex registry.
 *
 * @param {String|Server} address The server to add.
 * @param {Function} fn Optional callback;
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('register', function register(address, fn) {
  var metroplex = this;

  metroplex.address = metroplex.parse(address || metroplex.address);
  if (!metroplex.address) {
    if (fn) fn();
    return this;
  }

  metroplex.redis.psetex(metroplex.namespace + 'server:' + metroplex.address, metroplex.interval, Date.now(), function(err, result) {
    metroplex.emit('register', metroplex.address);
    metroplex.setInterval();
    if (fn) fn(err, metroplex.address);
  });
});

/**
 * Remove a server/address from the Metroplex registry.
 *
 * @param {String|Server} address The server to remove.
 * @param {Function} fn Optional callback.
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('unregister', function unregister(address, fn) {
  var metroplex = this;

  address = metroplex.parse(address || metroplex.address);
  if (!metroplex.address) {
    if (fn) fn();
    return this;
  }

  metroplex.redis.del(metroplex.namespace + 'server:' + metroplex.address);
  metroplex.emit('unregister', address);

  if (metroplex.timer) clearInterval(metroplex.timer);
  if (fn) fn(null, address);

  return this;
});

/**
 * Add a new connection for our registered address.
 *
 * @param {Spark} spark The connection/spark from Primus.
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('connect', function connect(spark) {
  this.redis.psetex(this.namespace + 'spark:' + spark.id, this.sparkTimeout, this.address);
  return this;
});

/**
 * Remove a connection for our registered address.
 *
 * @param {Spark} spark The connection/spark from Primus.
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('disconnect', function disconnect(spark) {
  this.redis.del(this.namespace + 'spark:' + spark.id);
  return this;
});

/**
 * Get all current registered servers except our selfs.
 *
 * @param {Function} fn Callback
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('servers', function servers(fn) {
  var metroplex = this;

  metroplex.redis.keys(metroplex.namespace + 'server:*', function keyList(err, list) {
    fn(err, (list || []).map(function(key) {
      return key.replace(metroplex.namespace + 'server:', '');
    }).filter(function filter(address) {
      return address !== metroplex.address;
    }));
  });

  return this;
});

/**
 * Reset the time to live for a registered spark.
 *
 * @param {Spark} spark The connection/spark from Primus.
 * @returns {Metroplex}
 * @api private
**/
Metroplex.readable('heartbeat', function heartbeat(spark) {
  this.redis.psetex(this.namespace + 'spark:' + spark.id, this.sparkTimeout, this.address);
  return this;
});

/**
 * Get the server address for a given spark id.
 *
 * @param {String} id The spark id who's server address we want to retrieve.
 * @param {Function} fn Callback
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('spark', function spark(id, fn) {
  this.redis.get(this.namespace + 'spark:' + id, fn);
  return this;
});

/**
 * Get all server addresses for the given spark ids.
 *
 * @param {Array} ids The spark id's we need to look up
 * @param {Function} fn Callback.
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('sparks', function sparks(ids, fn) {
  var metroplex = this;
  metroplex.leverage.multiget('spark:', ids, function(err, result) {
    fn(err, JSON.parse(result));
  });
  return this;
});

/**
 * We need to make sure that this server is alive, the most easy and dirty way
 * of doing this is setting an interval which bumps the expire of our
 * dedicated server key. If we go off line, the key will expire and we will be
 * K.O. The value indicates the last "ping" that we got from the node server
 * so you can see when the last update was.
 *
 * @api private
 */
Metroplex.readable('setInterval', function setIntervals() {
  if (this.timer) clearInterval(this.timer);

  var redis = this.redis
    , metroplex = this;

  metroplex.timer = setInterval(function interval() {
    redis.psetex(metroplex.namespace + 'server:' + metroplex.address, metroplex.interval, Date.now());
  }, metroplex.interval - metroplex.latency);
});

//
// Expose the Metroplex library/registry/api
//
module.exports = Metroplex;
