describe('metroplex', function () {
  'use strict';
  var redis = require('redis').createClient()
    , assume = require('assume')
    , Primus = require('primus')
    , metroplex = require('../');

  var port = 1024
    , server2
    , server
    , http2
    , http;

  beforeEach(function each(next) {
    http = require('http').createServer();
    http2 = require('http').createServer();

    server = new Primus(http, {
      transformer: 'websockets',
      redis: redis
    });

    server2 = new Primus(http2, {
      transformer: 'websockets'
    });

    http.port = port++;
    http2.port = port++;

    http.url = 'http://localhost:'+ http.port;
    http2.url = 'http://localhost:'+ http2.port;

    http.listen(http.port, function () {
      http2.listen(http2.port, function () {
        redis.flushall(next);
      });
    });
  });

  afterEach(function each(next) {
    server.destroy(function () {
      server2.destroy(next);
    });
  });

  it('emits a register event', function (next) {
    server.use('metroplex', metroplex);
    server.once('register', function (address) {
      assume(address).to.equal('http://localhost:'+ http.port);
      next();
    });
  });

  it('has added server to redis after the register event', function (next) {
    server.use('metroplex', metroplex);
    server.once('register', function (address) {
      redis.smembers('metroplex:servers', function (err, servers) {
        if (err) return next(err);

        assume(servers).to.contain(address);
        next();
      });
    });
  });

  it('removes the added server when primus closes', function (next) {
    server.use('metroplex', metroplex);

    var addr;

    server.once('unregister', function (address) {
      assume(address).to.equal(addr);

      redis.smembers('metroplex:servers', function (err, servers) {
        if (err) return next(err);

        assume(!!~servers).to.be.true();
        next();
      });
    });

    server.once('register', function (address) {
      addr = address;

      assume(address).to.be.a('string');
      assume(address).to.contain(http.port);

      server.destroy();
    });
  });
});
