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
function Metroplex(primus, options) {
  if (!(this instanceof Metroplex)) return new Metroplex(primus, options);

  options = options || {};
  primus = primus || {};

  var parsed = this.parse(primus.server);

  this.fuse();

  this.redis = options.redis || require('redis').createClient();
  this.namespace = (options.namespace || 'metroplex') +':';
  this.interval = options.interval || 5 * 60 * 1000;
  this.timeout = options.timeout || 30 * 60;
  this.latency = options.latency || 2000;
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
  if (address.address === '0.0.0.0' || address.address === '::') {
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

  metroplex.address = this.parse(address || metroplex.address);
  if (!metroplex.address) {
    if (fn) fn();
    return this;
  }

  metroplex.leverage.annihilate(metroplex.address, function annihilate(err) {
    if (err) {
      if (fn) return fn(err);
      return metroplex.emit('error', err);
    }

    metroplex.redis.multi()
      .setex(metroplex.namespace + metroplex.address, metroplex.interval, Date.now())
      .sadd(metroplex.namespace +'servers', metroplex.address)
    .exec(function register(err) {
      if (err) {
        if (fn) return fn(err);
        return metroplex.emit('error', err);
      }

      metroplex.emit('register', metroplex.address);
      metroplex.setInterval();

      if (fn) fn(err, metroplex.address);
    });
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

  address = this.parse(address || metroplex.address);
  if (!metroplex.address) {
    if (fn) fn();
    return this;
  }

  metroplex.leverage.annihilate(address, function annihilate(err) {
    if (err) {
      if (fn) return fn(err);
      return metroplex.emit('error', err);
    }

    metroplex.emit('unregister', address);

    if (metroplex.timer) clearInterval(metroplex.timer);
    if (fn) fn(err, address);
  });

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
  this.redis.multi()
    .hset(this.namespace +'sparks', spark.id, this.address)
    .sadd(this.namespace + this.address +':sparks', spark.id)
  .exec();

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
  this.redis.multi()
    .hdel(this.namespace +'sparks', spark.id)
    .srem(this.namespace + this.address +':sparks', spark.id)
  .exec();

  return this;
});

/**
 * Get all current registered servers except our selfs.
 *
 * @param {Function} fn Callback
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('servers', function servers(self, fn) {
  var metroplex = this;

  if ('boolean' !== typeof self) {
    fn = self;
    self = 0;
  }

  this.redis.smembers(this.namespace +'servers', function smembers(err, members) {
    if (self) return fn(err, members);

    fn(err, (members || []).filter(function filter(address) {
      return address !== metroplex.address;
    }));
  });

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
  this.redis.hget(this.namespace +'sparks', id, fn);
  return this;
});

/**
 * Get all server addresses for the given spark ids.
 *
 * @param {Array} args The spark id's we need to look up
 * @param {Function} fn Callback.
 * @returns {Metroplex}
 * @api public
 */
Metroplex.readable('sparks', function sparks(args, fn) {
  args.push(fn);
  args.shift(this.namespace +'sparks');
  this.redis.hmget.apply(this.redis, args);

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

  var alive = this.namespace + this.address
    , redis = this.redis
    , metroplex = this;

  this.timer = setInterval(function interval() {
    //
    // Redis expects the expire value in seconds instead of milliseconds so we
    // need to correct our interval.
    //
    redis.setex(alive, metroplex.interval / 1000, Date.now());

    metroplex.servers(function servers(err, list) {
      if (err) return metroplex.emit('error', err);

      list.forEach(function expired(address) {
        redis.get(metroplex.namespace + address, function get(err, stamp) {
          if (err || Date.now() - +stamp < metroplex.interval) return;

          metroplex.leverage.annihilate(address, function murdered(err) {
            if (err) return metroplex.emit('error', err);
          });
        });
      });
    });
  }, this.interval - this.latency);
});

//
// Expose the Metroplex library/registry/api
//
module.exports = Metroplex;
