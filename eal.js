'use strict';

const eal = {};
(function () {

/*
 * Surface EAL provides basic surface events:
 *  touch, pressarea, longpress, keeppressing, tap, doubletap, enterarea, leavearea, release, changearea
 *
 * Surfaces are compound by areas. When constructing a surface you can optionally pass 
 * a function that receives the target of the event and must return the area for that 
 * target or null if it is not an area. By default, it returns the target element itself.
 *
 * Events:
 * -------
 *  * __touch__ event is triggered when the surface is pressed for the first time
 *  * __pressarea__ event is triggered just after entering a new area (see __enterarea__ event)
 *  * __longpress__ (optional) event is triggered when (and only once) the same area is touch during more than longPressDelay
 *  * __keeppressing__ (optional) event is triggered when keeping pressing the same area in intervals of keepPressingInterval
 *  * __tap__ event is triggered when an area is touch and the surface is released without changing the area
 *  * __doubletap__ event is triggered when an area is touch for a second time before doubleTapTimeout
 *  * __enterarea__ event is triggered when entering a new area
 *  * __leavearea__ event is triggered when leaving an area
 *  * __release__ event is triggered when surface is release
 *  * __changearea__ event is triggered when changing the area
 *
 * Usual flows:
 * ------------
 * Take in count some interaction canr trigger more than one event. Here are some examples:
 * (Imagine a QWERTY keyboard)
 *  1- The user tap W:
 *  __touch__, __enterarea__, __press__, __leavearea__, __release__, __tap__
 *  2- The user tap and hold W, then release:
 *  __touch__, __enterarea__, __press__, __longPress__, __leavearea__, __release__, __tap__
 *  3- The user press I, then corrects and moves to U, then release:
 *  __touch__, __enterarea__, __press__, __leavearea__, __enterarea__, __press__, __leavearea__, __release__, __tap__
 *  4- The user press I, then corrects and moves and holds U:
 *  __touch__, __enterarea__, __press__, __leavearea__, __enterarea__, __press__, __longPress__
 *  5- The user release the surface
 *  __leavearea__, __release__, [__tap__ | __doubleTap__]
 *
 *  NOTE __press__ is always triggered after __enterarea__, it is intended to be this way. It is sintactic sugar
 *
 * How to use this:
 * ----------------
 * First convert yout HTML element into a surface. Now take in count every
 * compounding element capturing pointer events is an area.
 *
 * Then attach general callbacks to each event or specific events by area.
 */

var _debugBasicEvents = false;

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
      console.log(evt.type);
    break;

    case 'changearea':
      console.log(evt.type+': from '+evt.detail.fromArea+' to '+evt.detail.area);
    break;

    default:
      console.log(evt.type+': '+evt.detail.area);
    break;
  }
}

function _defaultIsArea(htmlElement) {
  return htmlElement;
}

var _defaults = {
  longPressDelay: 700,
  doubleTapTimeout: 700,
  keepPressingInterval: 100,

  getArea: _defaultIsArea,
};

eal.Surface = function(surfaceElement, spec) {

  var _longPressTimer, _doubleTapTimer, _keepPressingInterval;
  var _isWaitingForSecondTap = false;
  var _hasMoved;
  var _accessArea, _currentArea, _formerArea;
  var _enterarea; // enterarea and leavearea behave as parenthesis. The second can not exist without the previous one.
  var _options;

  function _newEvent(base, type, area, from) {
    var newEvent = new CustomEvent(type, {
      bubbles: true,
      cancelable: true,
      detail: {
        target: base.detail.target || base.target,
        area: area || base.detail.area || null,
        moved: _hasMoved || base.detail.moved || false,
        accessArea: _accessArea,
        fromArea: from || null
      }
    });

    return newEvent;
  }

  function _reset() {
    _hasMoved = false;
  }

  // some events generate other events
  function _addSynteticEvents(evts) {
    var newEvt, evt, type, readyToTap = false;
    for (var i = 0; evt = evts[i]; i += 1) {
      newEvt = null;
      switch (evt.type) {
        case 'enterarea':
          // enter area generate press
          newEvt = _newEvent(evt, 'pressarea');
        break;

        case 'leavearea':
          // interrumpt long press and keep pressing
          window.clearTimeout(_longPressTimer);
          window.clearInterval(_keepPressingInterval);
          readyToTap = true;
        break;

        case 'releasesurface':
          // release, if in area, generates a tap
          if (_currentArea && readyToTap) {

            // waiting for second tap -> generate the double tap
            if (_isWaitingForSecondTap && _currentArea === _formerArea) {
              newEvt = _newEvent(evt, 'doubletap', _currentArea);

              _isWaitingForSecondTap = false;

            // not waiting -> generates a tap and now waiting no more than doubleTapTimeout
            } else {
              newEvt = _newEvent(evt, 'tap', _currentArea);

              _isWaitingForSecondTap = true;
              window.clearTimeout(_doubleTapTimer);
              _doubleTapTimer = window.setTimeout(
                function () { _isWaitingForSecondTap = false; },
                _options.doubleTapTimeout
              );
            }
          }

          // interrumpt long press and keep pressing
          window.clearTimeout(_longPressTimer);
          window.clearInterval(_keepPressingInterval);
        break;

        case 'pressarea':
          // set timeout up for long press
          if (_options.longPressDelay) {
            var longPress = _newEvent(evt, 'longpress');
            window.clearTimeout(_longPressTimer);
            _longPressTimer = window.setTimeout(
              function () {
                _handleAbstractEvents([longPress]);
              },
              _options.longPressDelay
            );
          }
        break;

        case 'longpress':
          // set interval for keep pressing
          if (_options.keepPressingInterval) {
            var keepPressing = _newEvent(evt, 'keeppressing');
            _keepPressingInterval = window.setInterval(
              function () {
                _handleAbstractEvents([keepPressing]);
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

  function _handleAbstractEvents(evts) {
    var fn;
    _addSynteticEvents(evts);   // improve performance by adding this to the loop
    for (var i = 0, evt; evt = evts[i]; i += 1) {
      // event callback
      evt.detail.target.dispatchEvent(evt);
      logEvent(evt);
    }
  }

  function _onMouseDown(evt) {
    _debugBasicEvents && console.log('--> mousedown');

    var abstractEvts = [_newEvent(evt, 'touchsurface')];
    var newArea = _options.isArea(evt);
    if (newArea) {
      _formerArea = _currentArea;
      _accessArea = _currentArea = newArea;
      abstractEvts.push(
        _newEvent(evt, 'enterarea', _currentArea)
      );
      _enterarea = _currentArea;
    }

    _handleAbstractEvents(abstractEvts, evt);
  }

  function _onMouseLeave(evt) {
    _debugBasicEvents && console.log('--> mouseleave');

    var abstractEvts = [];
    if (_currentArea && _enterarea) {
      abstractEvts.push(
        _newEvent(evt, 'leavearea', _currentArea)
      );
      _enterarea = null;
    }

    abstractEvts.push(
      _newEvent(evt, 'releasesurface')
    );

    _handleAbstractEvents(abstractEvts, evt);
    _reset();
  }

  function _onMouseMove(evt) {
    _debugBasicEvents && console.log('--> mousemove');

    // ignore moving when not transitioning to another area
    // (leaving to a dead zone or remain in the same area)
    var newArea = _options.isArea(evt);
    if (!newArea || _currentArea === newArea)
      return;

    _hasMoved = true;
    var abstractEvts = [];
    if (_enterarea) {
      abstractEvts.push(_newEvent(evt, 'leavearea', _currentArea));
      _enterarea = null; // next assign override this
    }
    if (_currentArea) {
      abstractEvts.push(_newEvent(evt, 'changearea', newArea, _currentArea));
    }
    abstractEvts.push(_newEvent(evt, 'enterarea', newArea));
    _enterarea = newArea;

    _formerArea = _currentArea;
    _currentArea = newArea;
    _handleAbstractEvents(abstractEvts);
  }

  spec = spec || {};
  _options = extend({}, _defaults, spec);
  surfaceElement.addEventListener('mousedown', _onMouseDown);
  surfaceElement.addEventListener('mouseup', _onMouseLeave);
  surfaceElement.addEventListener('mousemove', _onMouseMove);
  surfaceElement.addEventListener('mouseleave', _onMouseLeave);

  // set options
  this.set = function(newSpec) {
    extend(_options, newSpec);
  }

  _hasMoved = false;
  _currentArea = _accessArea = _formerArea = null;
}

})();
