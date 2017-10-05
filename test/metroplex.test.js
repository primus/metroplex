describe('metroplex', function () {
  'use strict';

  var Metroplex = require('../metroplex')
    , assume = require('assume')
    , Redis = require('ioredis')
    , port = 1024
    , redis;

  before(function (next) {
    redis = new Redis();
    redis.on('connect', next);
  });

  after(function () {
    return redis.quit();
  });

  afterEach(function () {
    return redis.flushdb();
  });

  it('is exposed as an function', function () {
    assume(Metroplex).is.a('function');
  });

  it('constructs a new instance', function () {
    var metroplex = new Metroplex(undefined, { redis });

    assume(metroplex).to.be.instanceOf(Metroplex);
  });

  it('returns a new instance if constructed without the new keyword', function () {
    assume(Metroplex(undefined, { redis })).to.be.instanceOf(Metroplex);
  });

  describe('.parse', function () {
    it('assumes a supplied string is the address', function () {
      var metroplex = new Metroplex(undefined, { redis })
        , address = 'localhost:3131';

      assume(metroplex.parse(address)).to.equal(address);
    });

    it('extracts the port number from a HTTP server', function (next) {
      var metroplex = new Metroplex(undefined, { redis })
        , http = require('http').createServer();

      http.listen(++port, function () {
        assume(metroplex.parse(http)).to.contain(port);
        assume(metroplex.parse(http)).to.contain('http://');
        http.close(next);
      });
    });

    it('knows the different between a HTTP and HTTPS server', function (next) {
      var https = require('https').createServer({
        cert: require('fs').readFileSync(__dirname +'/ssl.cert'),
        key: require('fs').readFileSync(__dirname +'/ssl.key')
      });
      var metroplex = new Metroplex(undefined, { redis });

      https.listen(++port, function () {
        assume(metroplex.parse(https)).to.contain(port);
        assume(metroplex.parse(https)).to.contain('https://');
        https.close(next);
      });
    });
  });
});
