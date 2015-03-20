import .Size;

module.exports = Class(function () {

  this.init = function (opts) {
    this._opts = opts;
  }

  this.getId = function () { return this._opts.id; }

  this.getName = function () { return this._opts.name; }

  this.getTarget = function () { return this._opts.target; }

  this.isNativeTarget = function () { return /^native/.test(this._opts.target); }

  this.centerSimulatorX = function () {
    return 'centerX' in this._opts ? this._opts.centerX : true;
  }

  this.centerSimulatorY = function () {
    return 'centerY' in this._opts ? this._opts.centerY : true;
  }

  this.getScreenSize = function (isRotated) {
    var opts = this._opts;
    var size = opts && opts
             ? new Size(opts.width, opts.height)
             : new Size();

    return isRotated ? size.rotate() : size;
  }

  this.getChromeSize = function (isRotated) {
    var opts = this._opts;
    var size = opts && opts.background
             ? new Size(opts.background.width, opts.background.height)
             : new Size();

    return isRotated ? size.rotate() : size;
  }

  // some devices have browser chrome, so the renderable viewport is smaller
  // than the reported screen size
  this.getViewportSize = function (rotation) {
    var opts = this._opts;
    if (opts.viewportSize) {
      return Array.isArray(opts.viewportSize)
               ? new Size(opts.viewportSize[rotation % opts.viewportSize.length])
               : new Size(opts.viewportSize);
    } else {
      return this.getScreenSize(rotation % 2);
    }
  }

  this.getCustomStyle = function () {
    return this._opts.style;
  }

  this.getBackground = function (rotation) {
    var background = this._opts.background;
    if (Array.isArray(background)) {
      return background[rotation % background.length];
    }

    return background;
  }

  this.getDevicePixelRatio = function () {
    return this._opts.devicePixelRatio || 1;
  }

  this.canRotate = function () {
    return 'canRotate' in this._opts ? !!this._opts.canRotate : true;
  }

  this.canDrag = function () {
    return 'canDrag' in this._opts ? !!this._opts.canDrag : true;
  }
});

module.exports.get = function(id, opts) {
  var info = exports.allInfo[id];
  if (info) { return new module.exports(info); }

  if (!opts) { opts = {}; }

  var match;
  function matchResolution (id) {
    var info = exports.defaults[id];
    if (opts.screen.width == info.width && opts.screen.height == info.height) {
      match = copy(info);
    } else if (opts.screen.width == info.height && opts.screen.height == info.width) {
      match = copy(info);
      match.rotation = 1;
    }
  }

  var fallback = 'mobile';
  if (opts.screen) {
    if (/-ios$/.test(id)) {
      ['iphone', 'iphone4', 'iphone5', 'ipad', 'ipad3'].forEach(bind(this, matchResolution));
    } else if (/-android$/.test(id)) {
      ['nexus', 'galaxy-nexus'].forEach(bind(this, matchResolution));
    }
  }

  if (!match) {
    match = copy(exports.defaults[fallback]);
    if (opts.width) { match.width = opts.width; }
    if (opts.height) { match.height = opts.height; }
    if (/^browser-/.test(id)) {
      opts.target = 'browser-mobile';
    }
  }

  return new module.exports(match);
};

module.exports.setInfo = function (allInfo) {
  for (var id in allInfo) {
    allInfo.id = id;
  }
  exports.allInfo = allInfo;
}