describe('plugin', function () {
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
      assume(address).to.contain(http.port);
      next();
    });
  });

  it('has added server to redis after the register event', function (next) {
    server.use('metroplex', metroplex);
    server.once('register', function (address) {
      redis.keys('metroplex:server:*', function (err, servers) {
        if (err) return next(err);

        assume(servers).to.be.a('array');
        assume(!!~servers.indexOf('metroplex:server:' + address)).to.be.true();
        next();
      });
    });
  });

  it('removes the added server when primus closes', function (next) {
    server.use('metroplex', metroplex);

    var addr;

    server.once('unregister', function (address) {
      assume(address).to.equal(addr);

      redis.get('metroplex:server:' + addr, function (err, servers) {
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

  it('stores and removes the spark', function (next) {
    server.use('metroplex', metroplex);

    var client = server.Socket('http://localhost:'+ http.port);

    client.id(function (id) {
      redis.get('metroplex:spark:' + id, function(err, address) {
        if (err) return next(err);
        assume(address).to.contain(http.port);
        client.end();
      });
    });

    server.once('disconnection', function (spark) {
      redis.get('metroplex:spark:' + spark.id, function(err, address) {
        if (err) return next(err);
        assume(!address).to.be.true();
        next();
      });
    });
  });

  it('generates address only once the server is started', function (next) {
    var http = require('http').createServer()
      , primus = new Primus(http, { redis: redis })
      , portnumber = port++;

    primus.use('metroplex', metroplex);
    assume(primus.metroplex.address).to.be.falsey();

    http.once('listening', function () {
      assume(primus.metroplex.address).to.contain(portnumber);
      next();
    });

    http.listen(portnumber);
  });

  it('updates the spark TTL when on connection heartbeats', function(next) {
    server.use('metroplex', metroplex);
    var client = server.Socket('http://localhost:'+ http.port);

    client.id(function(id) {
      // set the spark TTL to 500 ms
      redis.pexpire('metroplex:spark:' + id, 500, function(err) {
        if(err) return next(err);

        // ping the server
        client.write('primus::ping::' + (+new Date()));

        // wait for the ping to be received
        server.spark(id).once('incoming::ping', function() {

          // fetch the TTL again
          redis.pttl('metroplex:spark:' + id, function(err, ttlAfter) {
            if(err) return next(err);

            // ensure that the TTL has been reset
            assume(ttlAfter).is.greaterThan(500);
            client.end();
            next();
          });
        });
      });
    });
  });

  it('finds the server for a spark', function(next) {
    server.use('metroplex', metroplex);
    var client = server.Socket('http://localhost:'+ http.port);

    client.id(function(id) {
      server.metroplex.spark(id, function(err, address) {
        if(err) return next(err);
        assume(address).equals(server.metroplex.address);
        next();
      });
    });
  });

  it('finds servers for a list of sparks', function(next) {
    server.use('metroplex', metroplex);
    var clients = [],
        numClients = 5;

    for(var i = 0; i < numClients; i++) {
      server.Socket('http://localhost:'+ http.port).id(function(id) {
        clients.push(id);
        if(clients.length == numClients) {
          server.metroplex.sparks(clients, function(err, addresses) {
            if(err) return next(err);
            assume(Object.keys(addresses).length).equals(clients.length);
            for(var id in addresses) {
              assume(addresses[id]).equals(server.metroplex.address);
            }

            next();
          });
        }
      });
    }
  });

  it('resets server TTL periodically', function(next) {
    server.use('metroplex', metroplex);
    server.once('register', function() {
      redis.pexpire('metroplex:server:' + server.metroplex.address, 500, function(err) {
        if(err) return next(error);

        // force the timer to fire every 1ms
        server.metroplex.latency = server.metroplex.interval - 1;
        server.metroplex.setInterval();
        setTimeout(function() {
          redis.pttl('metroplex:server:' + server.metroplex.address, function(err, ttl) {
            if(err) return next(err);
            assume(ttl).is.greaterThan(500);
            next();
          });
        }, 5);
      });
    });
  });

  it('finds a list of active servers', function(next) {
    server.use('metroplex', metroplex);
    server.once('register', function(address) {
      server2.use('metroplex', metroplex);

      server2.once('register', function(address2) {
        server.metroplex.servers(function(err, list) {
          if(err) return next(err);
          // ensure server1 reports only server2
          assume(list.length).equals(1);
          assume(list[0]).equals(address2);

          server2.metroplex.servers(function(err, list2) {
            if(err) return next(err);
            // ensure server2 reports only server1
            assume(list2.length).equals(1);
            assume(list2[0]).equals(address);
            next();
          });
        });
      });
    });
  });
});
