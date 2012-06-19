'use strict';

var eal = {};
(function () {

var _debugBasicEvents = false; // for the underlying events
var _debugEvents = true; // for the events dispatched by the controller

function extend(base) {
  var current, i, prop;
  for (var i = 1; i < arguments.length; i += 1) {
    current = arguments[i];
    for (prop in current) {
      base[prop] = current[prop];
    }
  }
  return base;
}

function logEvent(evt) {
  switch (evt.type) {
    case 'touchsurface':
    case 'releasesurface':
      console.log('['+evt.detail.id+']: '+evt.type);
    break;

    case 'changearea':
      console.log('['+evt.detail.id+']: '+evt.type+': from '+
                   evt.detail.fromArea+' to '+evt.detail.area);
    break;

    default:
      console.log('['+evt.detail.id+']: '+evt.type+': '+evt.detail.area);
    break;
  }
}

function _defaultIsArea(evt) {
  return evt.target;
}

function _defaultMultitouchIsArea(evt) {
    var touch = evt.changedTouches[0];
    var element = document.elementFromPoint(touch.screenX, touch.screenY);
    return element;
}

var _defaults = {
  longPressDelay: 700,
  doubleTapTimeout: 700,
  keepPressingInterval: 100,
  multitouch: false,

  isArea: null,
};

eal.Surface = function(surfaceElement, spec) {

  var _longPressTimer = {}, _doubleTapTimer = {}, _keepPressingInterval = {};
  var _touchId = {};
  var _isWaitingForSecondTap = {};
  var _hasMoved = {};
  var _accessArea = {}, _currentArea = {}, _formerArea = {};
  var _enterarea = {}; // enterarea and leavearea behave as parenthesis. 
                       // The second can not exist without the previous one.
  var _options;

  function _newEvent(track, base, type, area, from) {
    var newEvent = new CustomEvent(type, {
      bubbles: true,
      cancelable: true,
      detail: {
        track: track,
        target: base.detail.target || base.target,
        area: area || base.detail.area || null,
        moved: _hasMoved[track] || base.detail.moved || false,
        accessArea: _accessArea[track],
        fromArea: from || null
      }
    });

    return newEvent;
  }

  function _reset(track) {
    _touchId[track] = false;
    _hasMoved[track] = false;
  }

  // some events generate other events
  function _addSynteticEvents(track, evts) {
    var newEvt, evt, type, readyToTap = false;
    for (var i = 0; evt = evts[i]; i += 1) {
      newEvt = null;
      switch (evt.type) {
        case 'enterarea':
          // enter area generate press
          newEvt = _newEvent(track, evt, 'pressarea');
        break;

        case 'leavearea':
          // interrumpt long press and keep pressing
          window.clearTimeout(_longPressTimer[track]);
          window.clearInterval(_keepPressingInterval[track]);
          readyToTap = true;
        break;

        case 'releasesurface':
          // release, if in area, generates a tap
          if (_currentArea[track] && readyToTap) {

            // waiting for second tap -> generate the double tap
            if (_isWaitingForSecondTap[track] && 
                _currentArea[track] === _formerArea[track]) {

              newEvt = _newEvent(track, evt, 'doubletap', _currentArea[track]);
              _isWaitingForSecondTap[track] = false;

            // not waiting -> generates a tap and now waiting no more than
            // doubleTapTimeout
            } else {
              newEvt = _newEvent(track, evt, 'tap', _currentArea[track]);

              _isWaitingForSecondTap[track] = true;
              window.clearTimeout(_doubleTapTimer[track]);
              _doubleTapTimer[track] = window.setTimeout(
                function () { _isWaitingForSecondTap[track] = false; },
                _options.doubleTapTimeout
              );
            }
          }

          // interrumpt long press and keep pressing
          window.clearTimeout(_longPressTimer[track]);
          window.clearInterval(_keepPressingInterval[track]);
        break;

        case 'pressarea':
          // set timeout up for long press
          if (_options.longPressDelay) {
            var longPress = _newEvent(track, evt, 'longpress');
            window.clearTimeout(_longPressTimer[track]);
            _longPressTimer[track] = window.setTimeout(
              function () {
                _handleAbstractEvents(track, [longPress]);
              },
              _options.longPressDelay
            );
          }
        break;

        case 'longpress':
          // set interval for keep pressing
          if (_options.keepPressingInterval) {
            var keepPressing = _newEvent(track, evt, 'keeppressing');
            _keepPressingInterval[track] = window.setInterval(
              function () {
                _handleAbstractEvents(track, [keepPressing]);
              },
              _options.keepPressingInterval
            );
          }
        break;

      }

      if (newEvt)
        evts.splice(i+1, 0, newEvt);
    }
  }

  function _handleAbstractEvents(track, evts) {
    var fn;
    _addSynteticEvents(track, evts);   // improve performance by adding this
                                       // to the loop
    for (var i = 0, evt; evt = evts[i]; i += 1) {
      // event callback
      evt.detail.target.dispatchEvent(evt);
      _debugEvents && logEvent(evt);
    }
  }

  function _getTouchId(evt) {
    return _options.multitouch ?
            evt.changedTouches[0].identifier :
            0;
  }

  function _onMouseDown(evt) {
    _debugBasicEvents && console.log('--> mousedown');

    evt.preventDefault();
    var track = _getTouchId(evt);

    var abstractEvts = [_newEvent(track, evt, 'touchsurface')];
    var newArea = _options.isArea(evt, track);
    if (newArea) {
      _formerArea[track] = _currentArea[track];
      _accessArea[track] = _currentArea[track] = newArea;
      abstractEvts.push(
        _newEvent(track, evt, 'enterarea', _currentArea[track])
      );
      _enterarea[track] = _currentArea[track];
    }

    _handleAbstractEvents(track, abstractEvts, evt);
  }

  function _onMouseLeave(evt) {
    _debugBasicEvents && console.log('--> mouseleave');

    evt.preventDefault();
    var track = _getTouchId(evt);

    var abstractEvts = [];
    if (_currentArea[track] && _enterarea[track]) {
      abstractEvts.push(
        _newEvent(track, evt, 'leavearea', _currentArea[track])
      );
      _enterarea[track] = null;
    }

    abstractEvts.push(
      _newEvent(track, evt, 'releasesurface')
    );

    _handleAbstractEvents(track, abstractEvts, evt);
    _reset(track);
  }

  function _onMouseMove(evt) {
    _debugBasicEvents && console.log('--> mousemove');

    evt.preventDefault();
    var track = _getTouchId(evt);

    // ignore moving when not transitioning to another area
    // (leaving to a dead zone or remain in the same area)
    var newArea = _options.isArea(evt, track);
    if (!newArea || _currentArea[track] === newArea)
      return;

    _hasMoved[track] = true;
    var abstractEvts = [];
    if (_enterarea[track]) {
      abstractEvts.push(_newEvent(
        track, evt, 'leavearea',
        _currentArea[track])
      );
      _enterarea[track] = null; // next assign override this
    }
    if (_currentArea[track]) {
      abstractEvts.push(_newEvent(
        track, evt, 'changearea',
        newArea, _currentArea[track])
      );
    }
    abstractEvts.push(_newEvent(track, evt, 'enterarea', newArea));
    _enterarea[track] = newArea;

    _formerArea[track] = _currentArea[track];
    _currentArea[track] = newArea;
    _handleAbstractEvents(track, abstractEvts);
  }

  spec = spec || {};
  _options = extend({}, _defaults, spec);
  if (!_options.isArea)
    _options.isArea = _options.multitouch ?
                      _defaultMultitouchIsArea :
                      _defaultIsArea;

  if (_options.multitouch) {
    surfaceElement.addEventListener('touchstart', _onMouseDown);
    surfaceElement.addEventListener('touchmove', _onMouseMove);
    surfaceElement.addEventListener('touchend', _onMouseLeave);
  } else {
    surfaceElement.addEventListener('mousedown', _onMouseDown);
    surfaceElement.addEventListener('mouseup', _onMouseLeave);
    surfaceElement.addEventListener('mousemove', _onMouseMove);
    surfaceElement.addEventListener('mouseleave', _onMouseLeave);
  }

  // set options
  this.set = function(newSpec) {
    extend(_options, newSpec);
  }
}

})();
