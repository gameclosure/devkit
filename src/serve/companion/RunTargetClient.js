var timers = require('timers');
var util = require('util');
var CompanionSocketClient = require('./CompanionSocketClient');


var StatusInfos = {
  'unavailable': {
    blocking: true
  },
  'available': {
    canRun: true
  },
  'occupied': {
    canStop: true,
    canRun: true
  },
  'downloading': {
    blocking: true
  }
};


/**
 * @param  {String}  [opts.UUID]
 * @param  {String}  [opts.status='unavailable'] available, unavailable, occupied
 */
var RunTargetClient = function(opts) {
  CompanionSocketClient.call(this, opts);

  this.UUID = opts.UUID || null;
  this.status = opts.status || 'unavailable';

  this.name = opts.name || 'noname';

  this._pingInterval = null;
};
util.inherits(RunTargetClient, CompanionSocketClient);
var supr = CompanionSocketClient.prototype;


RunTargetClient.prototype.setSocket = function(socket) {
  supr.setSocket.call(this, socket);

  if (this.socket) {
    // Add the socket listeners
    this.on('clientInfo', this.onClientInfo.bind(this));
    this.on('updateStatus', this.updateStatus.bind(this));
    this.status = 'occupied';
  } else {
    this.status = 'unavailable';
  }

  // Let the server know that this run target has been updated
  this._server.updateRunTarget(this);
};


/** Cannot send if in blocking state */
RunTargetClient.prototype.send = function() {
  var currentStateInfo = StatusInfos[this.status];
  if (currentStateInfo.blocking) {
    this._logger.warn('Dropping send call to runTarget (in blocking state)', this.status, arguments);
    return;
  }
  supr.send.apply(this, arguments);
};


/** RunTargets are not ready immediately, they must recieve ID info from the client first */
RunTargetClient.prototype.isReady = function() {
  return supr.isReady.call(this) && (this.UUID !== null);
};


RunTargetClient.prototype._validateStatus = function(flagName, requestor) {
  var currentStateInfo = StatusInfos[this.status];
  if (!currentStateInfo[flagName]) {
    var errorMessage = flagName + ' not allowed in state ' + this.status;
    if (requestor) {
      requestor._error('unavailable_in_state', errorMessage);
    } else {
      this._logger.error(errorMessage);
    }
    return false;
  }
  return true;
};


/**
 * @param  {Object} runData
 * @param  {String} runData.route
 * @param  {String} runData.shortName
 * @param  {String} [runData.debuggerHost]
 */
RunTargetClient.prototype.run = function(requestor, runData) {
  this._logger.debug('trying to run', runData);

  if (!this._validateStatus('canRun', requestor)) {
    return;
  }

  this.send('run', runData);
};


RunTargetClient.prototype.stop = function(requestor) {
  this._logger.debug('trying to stop');

  if (!this._validateStatus('canStop', requestor)) {
    return;
  }

  this.send('stop');
};


/**
 * @param  {Object}  message
 * @param  {String}  message.UUID
 * @param  {String}  [message.name]
 */
RunTargetClient.prototype.onClientInfo = function(message) {
  this._logger.debug('onClientInfo', message);

  if (!message.UUID) {
    this._criticalError('missing_UUID', 'onClientInfo: requires message.UUID');
    return;
  }

  //ensure that the client is only in the list once
  this._server.removeRunTargetClient(this);

  // Check for an existing client with this UUID
  var existingClient = this._server.getRunTarget(message.UUID);
  if (existingClient) {

    // Not quite sure why we are treating a newly created client as an existing one
    // We should have a list of existing ones rather then doing this which will dc the new client every time
    // this issue is by this stage the newly added client is available resulting in the following to always be true

    // If it is an active client, throw an error
    //if (existingClient.status === 'available') {
    //  this._criticalError('UUID_collision', 'onClientInfo: message.UUID not unique: ' + message.UUID);
    //  return;
    //}
    // Otherwise merge data with the existing client, and then remove the temporary entry from server memory
    this.name = existingClient.name;
    this._server.removeRunTargetClient(existingClient, {
      onlyInMemory: true
    });
  }

  this.UUID = message.UUID;
  if (message.name) {
    this.name = message.name;
  }

  if(message.deviceInfo.platform) {
    this.platform = message.deviceInfo.platform;
  } else {
    this.platform = 'unknown';
  }

  if (message.deviceInfo.width && message.deviceInfo.height) {
    this.width = message.deviceInfo.width;
    this.height = message.deviceInfo.height;
  } else {
    this.width = 0;
    this.height = 0;
  }


  if (!this._pingInterval) {
    // Send pings server side because its hard to do it on device reliably
    this._pingInterval = timers.setInterval(this._sendPing.bind(this), 45 * 1000);
  }

  this._server.addRunTargetClient(this);
  this._server.saveRunTarget(this);
  this._server.updateRunTarget(this, !existingClient);
};


/**
 * @param  {Object<String, ?>}  newInfo - merged in to this run target
 */
RunTargetClient.prototype.updateClientInfo = function(newInfo) {
  this._logger.debug('updateClientInfo', newInfo);

  for (var key in newInfo) {
    var val = newInfo[key];
    this._logger.debug('updateClientInfo: setting ' + key + ' to ' + val);
    this[key] = val;
  }

  this._server.saveRunTarget(this);
  this._server.updateRunTarget(this, false);
};


RunTargetClient.prototype._sendPing = function() {
  this._logger.debug('Sending ping');
  this.socket.send('ping');
};


/**
 * @param  {Object}  message
 * @param  {String}  message.status
 */
RunTargetClient.prototype.updateStatus = function(message) {
  this._logger.debug('updateStatus', message);

  if (!message.status) {
    this._criticalError('missing_status', 'updateStatus: requires message.status');
    return;
  }

  if (!StatusInfos[message.status]) {
    this._criticalError('unknown_status', 'updateStatus: Status provided is unknown: ' + message.status);
    return;
  }

  this.status = message.status;

  this._server.updateRunTarget(this, false);
};


RunTargetClient.prototype.onDisconnect = function() {
  this._logger.log('disconnected', this.UUID);
  if (this._pingInterval) {
    timers.clearInterval(this._pingInterval);
    this._pingInterval = null;
  }
  this.setSocket(null);

  this._server.updateRunTarget(this, false);
};


/** Get the info object to send to ui */
RunTargetClient.prototype.toInfoObject = function() {
  return {
    UUID: this.UUID,
    name: this.name,
    status: this.status,
    statusInfo: StatusInfos[this.status],
    deviceInfo: {
      width: this.width,
      height: this.height,
      platform: this.platform
    }
  };
};


/** Get the object containing data to be persisted between saves */
RunTargetClient.prototype.toObject = function() {
  return {
    UUID: this.UUID,
    name: this.name
  };
};


RunTargetClient.fromObject = function(server, logger, obj) {
  return new RunTargetClient({
    server: server,
    logger: logger,
    UUID: obj.UUID,
    name: obj.name
  });
};


module.exports = RunTargetClient;
