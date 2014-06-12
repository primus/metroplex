describe('metroplex', function () {
  'use strict';

  var Metroplex = require('../metroplex')
    , assume = require('assume')
    , port = 1024;

  it('is exposed as an function', function () {
    assume(Metroplex).is.a('function');
  });

  it('constructs a new instance', function () {
    var metroplex = new Metroplex();

    assume(metroplex).to.be.instanceOf(Metroplex);
  });

  it('returns a new instance if constructed without the new keyword', function () {
    assume(Metroplex()).to.be.instanceOf(Metroplex);
  });

  describe('.parse', function () {
    it('assumes a supplied string is the address', function () {
      var metroplex = new Metroplex()
        , address = 'localhost:3131';

      assume(metroplex.parse(address)).to.equal(address);
    });

    it('extracts the port number from a HTTP server', function (next) {
      var http = require('http').createServer()
        , metroplex = new Metroplex();

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
          })
        , metroplex = new Metroplex();

      https.listen(++port, function () {
        assume(metroplex.parse(https)).to.contain(port);
        assume(metroplex.parse(https)).to.contain('https://');
        https.close(next);
      });
    });
  });
});
