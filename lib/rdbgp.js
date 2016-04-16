var http = require('http');
var stream = require('stream');
var ws = require('ws');

var Client = (function(Super) {
  function Client() {
    Super.call(this, {
      readableObjectMode: true,
      writableObjectMode: true,
    });

    this.socket = null;

    this.requestId = 0;
    this.requestCallbacks = {};

    this.on('data', function(response) {
      var callback = this.requestCallbacks[response.id];

      if (callback) {
        var error = response.error;
        if (error) {
          var error = new Error();

          for (key in response.error) {
            error[key] = response.error[key];
          }

          // XXX data is preserved but error details will not be shown
          // by default error inspection (contained in data)

          callback(error);
        } else {
          var result = response.result;
          if (result.result) {
            result = result.result;
          }

          callback(null, result, response.result);
        }
      }
    });
  }

  Client.prototype = Object.create(Super.prototype, {
    constructor: {
      value: Client,
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });

  Client.prototype._read = function _read() {
    // TODO can we apply any back-pressure here?
  };

  Client.prototype._write = function _write(chunk, encoding, callback) {
    this.socket.send(JSON.stringify(chunk), callback);
  };

  Client.prototype.connect = function connect(options, callback) {
    if (callback) {
      this.on('ready', callback);
    }

    var request = http.request({
      host: options.host,
      port: options.port,
      path: '/json/list',
    });

    var client = this;
    request.on('response', function(response) {
      var data = '';

      response.on('data', function(chunk) {
        data += chunk;
      });

      response.on('end', function() {
        var targets = JSON.parse(data);

        if (targets.length < 1) {
          return client.emit('error', new Error('No target available'));
        }

        if (typeof targets[0].webSocketDebuggerUrl !== 'string') {
          return client.emit('error', new Error('Target is busy'));
        }

        var socket = ws.connect(targets[0].webSocketDebuggerUrl);

        socket.on('open', function() {
          client.socket = socket;
          client.emit('ready');
        });

        socket.on('error', function(error) {
          client.emit('error', error);
        });

        socket.on('message', function(chunk) {
          client.push(JSON.parse(chunk));
        });

        socket.on('close', function() {
          client.socket = null;
        });
      });
    });

    request.on('error', function(error) {
      client.emit('error', error);
    });

    request.end();
  };

  Client.prototype.destroy = function destroy() {
    // this.socket.close();
  };

  Client.prototype.request = function request(method, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = undefined;
    }

    if (typeof params === 'undefined') {
      params = {};
    }

    if (typeof method === 'object') {
      var request = method;
    } else {
      if (typeof method !== 'string') {
        throw new TypeError('Method must be a string');
      }

      if (typeof params !== 'object') {
        throw new Error('Params must be an object');
      }

      var request = {
        method: method,
        params: params,
      };
    }

    if (typeof request.id === 'undefined') {
      request.id = this.requestId++;
    }

    this.write(request);

    if (callback) {
      this.requestCallbacks[request.id] = callback;
    }
  };

  return Client;
}(stream.Duplex));

module.exports.Client = Client;

function createClient() {
  var client = new Client();

  return client;
}

module.exports.createClient = createClient;

function connect(options, callback) {
  var client = createClient();

  client.connect(options, callback);
  return client;
}

module.exports.connect = connect;

function console() {
  var console = new stream.Transform();
}
