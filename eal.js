'use strict';

var eal = {};
(function () {

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
  var _isPressing = false;
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
    _isPressing = false;
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

    _isPressing = true;
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
    if (!_isPressing || !newArea || _currentArea === newArea)
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
