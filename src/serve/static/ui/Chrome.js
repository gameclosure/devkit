/** @license
 * This file is part of the Game Closure SDK.
 *
 * The Game Closure SDK is free software: you can redistribute it and/or modify
 * it under the terms of the Mozilla Public License v. 2.0 as published by Mozilla.

 * The Game Closure SDK is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * Mozilla Public License v. 2.0 for more details.

 * You should have received a copy of the Mozilla Public License v. 2.0
 * along with the Game Closure SDK.  If not, see <http://mozilla.org/MPL/2.0/>.
 */

/* globals Class, merge, bind, logger */

from util.browser import $;

import squill.Widget;
import std.uri;

import squill.Menu;
import squill.Drag;
import squill.Delegate;

import ..util.Size as Size;
import ..util.DeviceInfo as DeviceInfo;

import ..components.FrameBackground as FrameBackground;
import ..components.CenterLayout as CenterLayout;
import ..components.Toolbar as Toolbar;
import ..components.DeviceDialog as DeviceDialog;

import ..components.renderers.facebook as facebookRenderer;

exports = Class(CenterLayout, function (supr) {

  this._def = {
    className: 'simulator no-transitions',
    children: [
      {type: Toolbar},
      {id: 'contents', children: [
        {id: 'background', type: FrameBackground},
        {id: 'splashImage'},
        {id: 'resizeHandle'},
        {id: 'build-spinner', children: [{id: 'spinner'}]}
      ]}
    ]
  };

  this.getContainer = function () { return this.frameWrapper || supr(this, 'getContainer'); };

  this.init = function (simulator) {
    this._simulator = simulator;
    this._channel = simulator.api.getChannel('devkit-simulator');
    this._channel.connect();
    this._channel.on('hideSplash', bind(this, 'hideSplash'));
    this._channel.on('connect', bind(this, '_onConnect'));

    var opts = simulator.getOpts();
    supr(this, 'init', [opts]);
  };

  this.buildWidget = function () {
    supr(this, 'buildWidget', arguments);

    var opts = this._opts;

    this._isRetina = true;
    this._validOrientations = {};
    this._renderers = {
      'Facebook': facebookRenderer
    };

    var manifest = this._simulator.getManifest();
    if (manifest.supportedOrientations) {
      manifest.supportedOrientations.forEach(function (orientation) {
        this._validOrientations[orientation] = true;
      }, this);
    } else {
      this._validOrientations.portrait = true;
      this._validOrientations.landscape = true;
    }

    this.toolbar.setSimulator(this);
    this.toolbar.setValidOrientations(this._validOrientations);

    if (opts.simpleUI) {
      this.toolbar.hide();
    } else {
      this.toolbar.show();
    }

    this._rotation = opts.rotation || 0;
    this._backgroundProps = {};

    this._isDragEnabled = true;
    this._offsetX = opts.offsetX || 0;
    this._offsetY = opts.offsetY || 0;

    this._simulatorIndex = opts.index;
    this._name = opts.name || 'Simulator';

    this._mover = new squill.Drag({threshold: 0})
      .subscribe('DragStart', this, 'onDragStart')
      .subscribe('Drag', this, 'onDrag')
      .subscribe('DragStop', this, 'onDragStop');

    this._resizer = new squill.Drag({threshold: 0})
      .subscribe('DragStart', this, 'onResizeStart')
      .subscribe('Drag', this, 'onResize')
      .subscribe('DragStop', this, 'onResizeStop');

    this.background.on('Down', bind(this, '_startDrag'));

    $.onEvent(this._el, 'mousedown', this, function (evt) {
      if (evt.target == this._el) {
        // var rootView = this._device.rootView;
        // rootView.selectSimulator(evt);
      }
    });

    $.onEvent(this.resizeHandle, 'mousedown', this, function () {
        this._resizer.startDrag();
      });

    window.addEventListener('resize', bind(this, 'update'));

    window.addEventListener('keydown', bind(this, this._rebuildKeyListener), true);
    window.addEventListener('message', bind(this, function (e) {
      if (e.data == 'devkit:reload') {
        this._simulator.rebuild();
      }

      if (e.data == 'devkit:toolbar:hide') {
        this.toolbar.hide();
      }

      if (e.data == 'devkit:toolbar:show') {
        this.toolbar.show();
      }
    }));

    // initialize muted state from localStorage
    this._isMuted = false;
    if (localStorage.getItem('settingMuted') === '1') {
      this._isMuted = true;
    }

    this.fromJSON(this._opts);
  };

  this._startDrag = function () {
    if (this._isDragEnabled) {
      this._mover.startDrag();
    }
  };

  this.showBanner = function (opts) {
    if (!this.banner) {
      this.banner = this.addWidget({
        id: 'banner',
        parent: this.contents,
        type: 'label'
      });

      this.bannerAction = this.banner.addWidget({id: 'action', type: 'button'});
      this.bannerClose = this.banner.addWidget({id: 'closeBtn', type: 'button', className: 'glyphicon glyphicon-remove'});
    }

    this.banner.setText(opts.text);
    if (opts.action) {
      this.bannerAction.setLabel(opts.action);
      this.bannerAction.show();
    } else {
      this.bannerAction.hide();
    }
    this.bannerClose[opts.dismissable === false ? 'hide' : 'show']();
    return new Promise(function (resolve, reject) {
      this.bannerClose.onClick = function () {
        this.banner.hide();
        reject();
      }.bind(this);

      this.bannerAction.onClick = function () {
        this.banner.hide();
        resolve();
      }.bind(this);
    }.bind(this));
  };

  this.setBuilding = function (isBuilding) {
    var spinner = this['build-spinner'];

    if (!isBuilding) {
      setTimeout(bind(this, function () {
        $.hide(this['build-spinner']);
        this.removeClass('building');
      }), 1000);
      spinner.style.opacity = 0;
    } else {
      this.showSplash();
      spinner.style.display = 'flex';

      setTimeout(bind(this, function () {
        spinner.style.opacity = 0.5;
        this.addClass('building');
      }), 100);
    }
  };

  this._onMenuOpen = function (menu) {
    $.addClass(this.toolbar, 'menu-open');
    if (menu == this.overflowMenu) {
      // ?
    }
  };

  this._onConnect = function () {
    // restore mute state when client connects (if necessary)
    if (this._isMuted) {
      this.setMuted(true);
    }

    this.emit(this._isPaused ? 'pause' : 'resume');
  };

  this._remoteScreenshot = function () {
    this._channel.request('screenshot').then(function (res) {
      this._frame.src = res.canvasImg;
      this._frame.style.width = res.width + 'px';
      this._frame.style.height = res.height + 'px';
    }).catch(function (e) {
      logger.log("Error taking screenshot", e);
    });
  };

  this.canRotate = function () { return this._canRotate; };

  this.showSplash = function () {
    if (this._deviceInfo.isNativeTarget()) {
      this.splashImage.style.display = 'block';
      this.splashImage.style.opacity = 1;
      this.splashImage.style.backgroundImage = 'url(' + this.getLoadingImageURL() + ')';
    }
  };

  this.hideSplash = function () {
    this.splashImage.style.opacity = 0;
    setTimeout(bind(this, function () {
      this.splashImage.style.display = 'none';
    }), 500);
  };

  this.setRetina = function (isRetina) {
    this._isRetina = isRetina;
    this.update();
    this.refresh();
  };

  this.getFrame = function () { return this._frame; };

  this.editDevice = function () {
    var dialog = new DeviceDialog({
        simulator: this,
        loadingImage: this.getLoadingImageURL()
      })
      .on('select', bind(this, function (deviceInfo) {
        this.setDeviceInfo(deviceInfo);
        dialog.hide();
      }))
      .show();
  };

  this.toggleDragEnabled = function () {
    this.setDragEnabled(!this._isDragEnabled);
  };

  this.setDragEnabled = function (isDragEnabled) {
    this._isDragEnabled = !!isDragEnabled;
    this.emit('change:drag');
  };

  this.isDragEnabled = function () {
    return this._isDragEnabled;
  };

  this.isMuted = function () { return this._isMuted; };
  this.toggleMuted = function () { this.setMuted(!this._isMuted); };
  this.setMuted = function (isMuted) {
    this._isMuted = isMuted;
    if (isMuted) {
      localStorage.setItem('settingMuted', '1');
    } else {
      localStorage.setItem('settingMuted', '0');
    }

    this._channel.emit('mute', {shouldMute: isMuted});
    this.emit('change:mute', isMuted);
    this.emit('change');
  };

  this.getLoadingImageURL = function () {
    var splash;
    if (this._rotation % 2 === 0) {
      //even amounts of rotations mean portrait
      splash = "portrait1136";
    } else {
      //oods mean landscape
      splash = "landscape1536";
    }
    return new std.uri(this._deviceInfo.getTarget() + "/splash/" + splash).toString();
  };

  this._rebuildKeyListener = function (e) {
    //this used to be cmd-shift-r, which is reload without cache.
    // now ctrl-r
    // if (e.ctrlKey && e.which == 82) {
    //   this.rebuild();
    //   e.preventDefault();
    //   return false;
  };

  this.setTransitionsEnabled = function (isEnabled) {
    if (isEnabled) {
      $.removeClass(this._el, 'no-transitions');
    } else {
      $.addClass(this._el, 'no-transitions');
    }
  };

  this.setDeviceInfo = function (deviceInfo) {
    this.setTransitionsEnabled(false);

    this._deviceInfo = deviceInfo;

    // reset any custom resize
    this._customSize = null;

    function logInfo(key, value) {
      console.log(new Array(20 - key.length + 1).join(' ')
          + '%c' + key + ':%c ' + value,
          'color: green',
          'font-weight: bold; color: blue');
    }

    logInfo('type', deviceInfo.getName() || deviceInfo.getId());
    logInfo('build-target', deviceInfo.getTarget());
    logInfo('device-id', this._simulator.id);
    logInfo('size', deviceInfo.getScreenSize());
    logInfo('pixel-ratio', deviceInfo.getDevicePixelRatio());

    this.update();

    setTimeout(bind(this, 'setTransitionsEnabled', true), 1000);

    if (this._frame) {
      this.refresh();
    }

    this.emit('change:type');
  };

  this.rotate = function () {

    var isLandscape = (this._rotation + 1) % 2 == 1;
    if (!this._deviceInfo.canRotate()
          || isLandscape && !('landscape' in this._validOrientations)
          || !isLandscape && !('portrait' in this._validOrientations))
    {
      return;
    }

    ++this._rotation;

    this.setTransitionsEnabled(true);
    this.toolbar.hide();

    this.contents.style.WebkitTransform = 'rotate(' + (this._rotation % 2 ? 90 : -90) + 'deg)';

    var onRotate = bind(this, function () {
      this.contents.removeEventListener("webkitTransitionEnd", onRotate);
      this.setTransitionsEnabled(false);

      this.contents.style.WebkitTransform = '';
      this.toolbar.show();
      this.update();

      setTimeout(bind(this, 'setTransitionsEnabled', true), 100);
    });

    this.contents.addEventListener("webkitTransitionEnd", onRotate);

    this.emit('change');
  };

  this.getFrameName = function () {
    var manifest = this._simulator.getManifest();

    var studio = manifest.studio && manifest.studio.domain;
    if (!studio) {
      studio = "my-studio.com";
    }

    var names = studio.split(/\./g).reverse();
    names.push(manifest.shortName);
    var defaultName = names.join('.');
    var target = this._deviceInfo && this._deviceInfo.getTarget() || '';
    if (/ios/i.test(target)) {
      return manifest.ios && manifest.ios.bundleID || defaultName;
    } else if (/android/i.test(target)) {
      return manifest.android && manifest.android.packageName || defaultName;
    } else {
      return defaultName;
    }
  };

  this._zoom = 0;

  this.getZoom = function () { return this._zoom; };
  this.setZoom = function (zoom) {
    this._zoom = zoom || 1;
    this.update();
    this.emit('change:zoom', this._zoom);
    this.emit('change');
  };

  this.loadURL = function (url) {
    this.showSplash();

    if (this._frame) {
      $.remove(this._frame);
    }

    this._frame = $({
      before: this.splashImage,
      tag: 'iframe',
      id: 'frame',
      attrs: {
        name: this.getFrameName()
      },
      src: url,
      className: 'frame'
    });

    var def = this._newIframeLoadDefer();

    // Listen for bootstrapping
    // TODO: use the proper channel stuff for this
    window.addEventListener('message', function(event) {
      if (event.data === 'bootstrapping') {
        if (this._iframeLoadDefer) {
          this._iframeLoadDefer.resolve();
          this._iframeLoadDefer = undefined;
        }
      }
    }.bind(this));

    this.update();

    return def.promise;
  };

  this.getDevicePixelRatio = function () {
    return this._deviceInfo.getDevicePixelRatio();
  };

  function sizeToCSS(size, scale) {
    scale = scale || 1;
    return {
      width: size && size.width ? size.width * scale + 'px' : '100%',
      height: size && size.height ? size.height * scale + 'px' : '100%'
    };
  }

  this._setViewport = function (size, viewport, scale) {
    $.style(this.contents, sizeToCSS(size, scale));
    // $.style(this.frameWrapper, sizeToCSS(viewport, scale));
    if (this._frame) {
      var style;

      if (this._isRetina) {
        style = merge(sizeToCSS(viewport), {
          WebkitTransform: 'scale(' + scale + ')',
          WebkitTransformOrigin: '0px 0px'
        });
      } else {
        style = merge(sizeToCSS(viewport, scale), {
          WebkitTransform: ''
        });
      }

      $.style(this._frame, style);
    }
  };

  this._computeRotation = function () {
    var isPortaitValid = ('portrait' in this._validOrientations);
    var isLandscapeValid = ('landscape' in this._validOrientations);
    var rotation = this._rotation;
    if (!this._deviceInfo.canRotate()) {
      rotation = 0;
    } else if (isPortaitValid && !isLandscapeValid) {
      rotation = 0;
    } else if (isLandscapeValid && !isPortaitValid) {
      rotation = 1;
    }
    return rotation;
  };

  this.reload = function () {
    this._simulator.rebuild(null, true);
    // this._frame.contentWindow.reload();
  };

  this.update = function () {
    var info = this._deviceInfo;
    if (!info) { return; }

    var start = Date.now();

    this._rotation = this._computeRotation();
    var size = this._customSize || info.getScreenSize();
    if (this._rotation % 2 == 1) {
      size.rotate();
    }

    var dpr = this.getDevicePixelRatio();
    var zoom = this._zoom;
    if (!zoom) {
      // check for auto-zoom out to fit window
      var padding = 10;
      var winSize = new Size(window.innerWidth - padding * 2, window.innerHeight - padding * 2);
      var targetSize = info.getChromeSize(this._rotation % 2 == 1);
      if (winSize.getRatio() < targetSize.getRatio()) {
        zoom = winSize.width / targetSize.width;
      } else {
        zoom = winSize.height / targetSize.height;
      }
      zoom = Math.min(1, zoom * dpr);
    }

    var scale = this._scale = 1 / dpr * zoom;
    this._width = size.width * scale || 0;
    this._height = size.height * scale || 0;

    // override the default full-screen with a custom screen size
    // Note: custom size with viewport != screen size is not supported
    var viewportSize = this._customSize ? size : info.getViewportSize(this._rotation);

    this.contents.style.cssText = '';
    $.style(this.contents, info.getCustomStyle());

    this._setViewport(size, viewportSize, scale);

    var renderer = this._renderers[info.getName()];
    if (this._customRenderer && (!renderer || renderer != this._customRenderer)) {
      this._customRenderer.destroy(this);
      this._customRenderer = null;
    }

    if (renderer && renderer != this._customRenderer) {
      this._customRenderer = renderer;
      renderer.create(this);
    }

    this.setCenterX(info.centerSimulatorX());
    this.setCenterY(info.centerSimulatorY());

    this.background.update(merge({
      scale: scale,
      rotation: this._rotation,
      screenSize: size,
    }, info.getBackground(this._rotation)));

    this.setContentSize(size.width * scale, size.height * scale);

    this.toolbar.setOffset(this.getContentArea(), this.background.getOffset());

    console.log("UPDATE", Date.now() - start);
    this.emit('change');
  };

  this.onResizeStart = function () {
    this.setTransitionsEnabled(false);
    this.toggleClass('resize', true);
  };

  this.onResizeStop = function () {
    this.computeOffset();
    this.toggleClass('resize', false);
    this.setTransitionsEnabled(true);
  };

  this.onDragStop = function () {
    this.computeOffset();
    this.setTransitionsEnabled(true);
  };

  this.onDragStart = function () {
    this.setTransitionsEnabled(false);
  };

  this.onDrag = function (dragEvt, moveEvt, delta) {
    this.addOffset(delta.x, delta.y);
  };

  this.onResize = function (dragEvt, moveEvt, delta) {
    if (!this._customSize) {
      this._customSize = this._deviceInfo.getScreenSize();
    }

    this._customSize.add(delta.x * 2, delta.y * 2);

    this.update();
  };

  /** Reject any old deferred, make a new one. */
  this._newIframeLoadDefer = function() {
    if (this._iframeLoadDefer) {
      this._iframeLoadDefer.reject('another load has been called');
    }
    var def = Promise.defer();
    this._iframeLoadDefer = def;
    return def;
  };

  // restart without rebuilding
  this.restart =
  this.refresh = function () {
    if (this._frame) {
      var def = this._newIframeLoadDefer();
      this._frame.src = this._frame.src;
      return def.promise;
    }
    return Promise.resolve();
  };

  this.softReload = function() {
    return this._channel.request('reload', { partialLoad: true });
  };

  /** Send a partialLoadContinue signal to the inner window, return the promise */
  this.continueLoad = function() {
    if (this._frame) {
      this._frame.contentWindow.postMessage('partialLoadContinue', '*');
      return Promise.resolve();
    }
    return Promise.reject('no iframe set');
    // return this._channel.request('partialLoadContinue');
  }

  this.takeScreenshot = function () {
    var win = window.open('', '', 'width=' + (this._screenWidth + 2) + ',height=' + (this._screenHeight + 2));
    this._channel.request('screenshot').then(function (res) {
      var canvas = res.base64Image;
      var doc = win.document;
      var now = new Date();
      var min = ('00' + now.getMinutes()).substr(-2);
      var time = now.getHours() + ':' + min;
      var date = (1 + now.getMonth()) + '/' + now.getDate();

      doc.open();
      doc.write('<html><title>Screenshot ' + date + ' ' + time + '</title></head>'
        + '<body style="margin:0px;padding:0px;background-color:#000;">'
        + '<img src="' + canvas + '">'
        + '</body></html>');
      doc.close();
    }).catch(function () {
      win.close();
    });
  };

  this.nativeBackButton = function () {
    this._channel.emit('button:back');
  };

  this.nativeHomeButton = function () {
    this._channel.emit('button:home');

    this._isHomeScreen = !this._isHomeScreen;
    this.emit('change:home', this._isHomeScreen);
  };

  this.isHomeScreen = function () {
    return this._isHomeScreen;
  };

  this.isDebugMode = function () { return this._isDebugMode; };
  this.toggleDebugMode = function () { this.setDebugMode(!this._isDebugMode); };
  this.setDebugMode = function (isDebugMode) {
    this._isDebugMode = isDebugMode;
    this.rebuild();
  };

  // this.delegate = new squill.Delegate(function(on) {
  //   on.btnOverflow = function () {
  //     this.overflowMenu.toggle();
  //   }
  // });

  this.step = function () {
    this.setPaused(true);
    this._channel.emit('step');
  };

  this.togglePaused = function () { this.setPaused(!this._isPaused); };
  this.isPaused = function () { return this._isPaused; };
  this.setPaused = function (isPaused) {
    isPaused = !!isPaused;
    if (this._isPaused == isPaused) { return; }
    this._isPaused = isPaused;

    this._channel.emit(isPaused ? 'pause' : 'resume');
    this.emit('change:pause', isPaused);
  };

  this.toJSON = function () {
    var data = {
      type: this._deviceInfo.getId()
    };

    if (this._isMuted) {
      data.muted = true;
    }

    if (this._rotation % 2) {
      data.rotated = true;
    }

    if (!this._isDragEnabled) {
      data.draggable = false;
    }

    if (this._zoom !== 0 && this._zoom !== 1) {
      data.zoom = this._zoom;
    }

    return data;
  };

  this.fromJSON = function (data) {
    if (data.type) {
      this.setDeviceInfo(DeviceInfo.get(data.type));
    }

    if (data.muted) {
      this.setMuted(true);
    }

    if (data.draggable === false) {
      this.setDragEnabled(false);
    }

    if (data.rotated) {
      this._rotation = 1;
      this.update();
    }

    if (data.zoom) {
      this.setZoom(data.zoom);
    }
  };
});
