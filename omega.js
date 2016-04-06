'use strict';

var async = require('async');

/**
 * A nope function allows for an optional callback pattern.
 *
 * @type {Function}
 * @private
 */
function nope() { }

/**
 * Omega supreme integration.
 *
 * @param {Primus} primus Primus instance
 * @api private
 */
module.exports = function forwards(primus) {
  if (!primus.forward) return;

  var metroplex = primus.metroplex
    , forward = primus.forward;

  /**
   * Broadcast a message to every connected server in the cluster.
   *
   * @param {Mixed} msg Message to broadcast.
   * @param {Function} fn Completion callback.
   * @returns {Forward}
   * @api public
   */
  forward.broadcast = function broadcast(msg, fn) {
    fn = fn || nope;

    metroplex.servers(function servers(err, list) {
      if (err) return fn(err);
      forward(list, msg, fn);
    });

    return forward;
  };

  /**
   * Broadcast a message to a range of users in the cluster.
   *
   * @param {Array} ids The ids that need to be resolved.
   * @param {Mixed} msg Message to broadcast.
   * @param {Function} fn Completion callback.
   * @returns {Forward}
   * @api public
   */
  forward.sparks = function sparks(ids, msg, fn) {
    fn = fn || nope;

    metroplex.servers(ids, function sparks(err, servers) {
      if (err) return fn(err);

      servers = servers.reduce(function fn(memo, address, i) {
        //
        // Filter out the dead sparks.
        //
        if (!address) return memo;

        memo[address] = memo[address] || [];
        memo[address].push(ids[i]);

        return memo;
      }, {});

      async.map(Object.keys(servers), function map(server, next) {
        forward(server, msg, servers[server], next);
      }, function calculate(err, reached) {
        if (err) return fn(err, reached);

        fn(err, reached.reduce(function reduce(memo, reach) {
          memo.send += reach.send || 0;
          return memo;
        }, { ok: true, send: 0 }));
      });
    });

    return forward;
  };

  /**
   * Forward the message to a specific spark.
   *
   * @param {String} id Spark id.
   * @param {Mixed} msg Message to broadcast.
   * @param {Function} fn Completion callback.
   * @returns {Forward}
   * @api public
   */
  forward.spark = function spark(id, msg, fn) {
    fn = fn || nope;

    metroplex.servers(id, function spark(err, server) {
      if (err) return fn(err);

      forward(server, msg, id, fn);
    });

    return forward;
  };
};
