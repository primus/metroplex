'use strict';

//
// Expose the Metroplex plugin.
//
var Metroplex = module.exports = require('./metroplex');

/**
 * Keep the presence or "state" of each connection in Redis.
 *
 * @param {Primus} primus The Primus instance that received the plugin.
 * @param {Object} options The options that were supplied to Primus.
 * @api public
 */
Metroplex.server = function server(primus, options)  {
  var metroplex = new Metroplex(primus, options);

  primus.on('connection', function connection(spark) {
    metroplex.connect(spark);
  }).on('disconnection', function disconnection(spark) {
    metroplex.disconnect(spark);
  }).on('close', function close() {
    metroplex.unregister();
  }).server.on('listening', function listening() {
    if (metroplex.address) return;
    metroplex.register(primus.server);
  });

  //
  // Register the Metroplex event as `reserved` event so other plugins know
  // that they shouldn't be bluntly emitting this and proxy these events to the
  // Primus instance you can listen on the Primus server instead of the plugin.
  //
  ['register', 'unregister'].forEach(function each(event) {
    primus.reserved.events[event] = 1;
    metroplex.on(event, primus.emits(event));
  });

  //
  // Expose the Metroplex instance so we can interact with it.
  //
  primus.metroplex = metroplex;
};
