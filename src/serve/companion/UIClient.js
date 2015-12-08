var util = require('util');
var CompanionSocketClient = require('./CompanionSocketClient');
var routeIdGenerator = require('../routeIdGenerator');


var UIClient = function(opts) {
  CompanionSocketClient.call(this, opts);
};
util.inherits(UIClient, CompanionSocketClient);
var supr = CompanionSocketClient.prototype;


UIClient.prototype.setSocket = function(socket) {
  supr.setSocket.call(this, socket);

  // Add the socket listeners
  this.on('initBrowserRequest',   this.onInitBrowser.bind(this));
  this.on('inspectRunTarget',     this.onInspectRunTarget.bind(this));
  this.on('run',                  this.onRun.bind(this));
  this.on('stop',                 this.onStop.bind(this));
  this.on('requestRunTargetList', this.onRequestRunTargetList.bind(this));

  this.send('browserData', this._server.browserData);
};

/**
 * @param  {Object}  message
 */
UIClient.prototype.onInitBrowser = function(data, respond) {
  this._logger.debug('onInitBrowser');

  respond({
    secret: this._server.secret
  });
};

/**
 * @param  {Object}  message
 * @param  {Object}  message.runTargetUUID
 */
UIClient.prototype.onInspectRunTarget = function(data, respond) {
  this._logger.debug('onInspectRunTarget', data);
  var runTarget = this._server.getRunTarget(data.runTargetUUID);
  if (!runTarget) {
    this._error('invalid_runTargetUUID', 'No run target for: ' + data.runTargetUUID);
    respond({
      success: false,
      message: 'Run target not found'
    });
    return;
  }
  respond({
    success: true,
    runTargetInfo: runTarget.toInfoObject()
  });
};

/**
 * @param  {Object}  message
 * @param  {String}  message.runTargetUUID
 * @param  {String}  message.appPath
 */
UIClient.prototype.onRun = function(message, respond) {
  this._logger.debug('onRun', message);

  var runTarget = this._server.getRunTarget(message.runTargetUUID);

  if (!runTarget) {
    this._error('invalid_runTargetUUID', 'No run target for: ' + message.runTargetUUID);
    return;
  }

  if (!message.appPath) {
    this._error('missing_appPath', 'no appPath on message');
    return;
  }

  if (runTarget.status === 'occupied') {
    runTarget.stop(this);
  }

  this._server.buildApp(message.appPath, runTarget).then(function(res) {
    if (!res.success) {
      this._error('buildFailed', res.error);
      respond({
        success: false,
        err: res.error
      });
      return;
    }

    respond({
      success: true
    });
    runTarget.run(this, res);
  }.bind(this));
};

/**
 * @param  {Object}  message
 * @param  {String}  message.runTargetUUID
 */
UIClient.prototype.onStop = function(message) {
  this._logger.debug('onStop', message);

  var runTarget = this._server.getRunTarget(message.runTargetUUID);

  if (!runTarget) {
    this._error('invalid_runTargetUUID', 'No run target for: ' + message.runTargetUUID);
    return;
  }

  runTarget.stop(this);
};

/**
 * @param  {Object}  message
 */
UIClient.prototype.onRequestRunTargetList = function(message) {
  this._logger.debug('onRequestRunTargetList', message);

  var runTargets = this._server.getRunTargets();
  var infos = [];
  runTargets.forEach(function(client) {
    infos.push(client.toInfoObject());
  });

  this.send('runTargetList', {
    runTargets: infos
  });
};

UIClient.prototype.onDisconnect = function() {
  this._logger.log('disconnected');
  this._server.removeUIClient(this);
};

module.exports = UIClient;
