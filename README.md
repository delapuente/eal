# EAL: Event Abstraction Layer

EAL is a JS library that push efforts in to provide high level events based on 
other lower level events.

It works by attaching **controllers** to HTML elements. A controller is in
charge of receive basic events and build higher level events. Current version
includes the **surface controller** to control touchable surfaces.

# Surface controller

The `eal.surface` controller provides basic surface events:

 * touch
 * pressarea
 * longpress
 * keeppressing
 * tap
 * doubletap
 * enterarea
 * leavearea
 * release
 * changearea

Surfaces are compound by (abstract) areas. When constructing a surface you can
optionally pass a function that receives the target of the event and must return
the area for that target or `null` if it is not an area. By default, it returns
the target element itself.

## Events:

 * `touch` event is triggered when the surface is pressed for the first time
 * `pressarea` event is triggered just after entering a new area (see `enterarea`
   event)
 * `longpress` (optional) event is triggered when (and only once) the same area
   is touch during more than `longPressDelay`
 * `keeppressing` (optional) event is triggered when keeping pressing the same
   area in intervals of `keepPressingInterval`
 * `tap` event is triggered when an area is touch and the surface is released
   without changing the area
 * `doubletap` event is triggered when an area is touch for a second time before
   `doubleTapTimeout`
 * `enterarea` event is triggered when entering a new area
 * `leavearea` event is triggered when leaving an area
 * `release` event is triggered when surface is release
 * `changearea` event is triggered when changing the area

## Typical flow examples

Take in count some interactions can trigger more than one event. Here are some
examples (imagine a QWERTY keyboard):

 1. The user tap W:
    __touch__, __enterarea__, __pressarea__, __leavearea__, __release__, __tap__

 2. The user tap and hold W, then release:
    __touch__, __enterarea__, __pressarea__, __longpress__, __leavearea__,
    __release__, __tap__
    
 3. The user press I, then corrects and moves to U, then release:
    __touch__, __enterarea__, __pressarea__, __leavearea__, __changearea__, 
    __enterarea__, __press__, __leavearea__, __release__, __tap__

 4. The user press I, then corrects and moves and holds U:
    __touch__, __enterarea__, __pressarea__, __leavearea__, __changearea__, 
    __enterarea__, __press__, __longpress__

 5. The user double tap W:
    __touch__, __enterarea__, __pressarea__, __leavearea__, __release__, __tap__,
    __touch__, __enterarea__, __pressarea__, __leavearea__, __release__,
    __doubletap__

 6. The user press and keep pressing W:
    __touch__, __enterarea__, __pressarea__, __longpress__, __keeppressing__,
    __keeppressing__, __keeppressing__, ...

 7. The user release the surface
    __leavearea__, __release__, optionally produces a __tap__ or __doubletap__

**NOTE**: `press` is always triggered after `enterarea`, it is intended to be
this way. It is sintactic sugar.

## How to use it:

```javascript
var surface = document.getElementById('surfaceElement');
var _surface = new eal.Surface(
  surface,
  {
    getArea: function (evt) { 
      // return an area or `null`
    },
    longPressDelay: 700,        // milliseconds
    doubleTapTimeout: 700,
    keepPressingInterval: 100,
  }
);

surface.addEventListener('doubletap', callback);
```

The contructor accepts the element that will be the surface and some options:

 * `getArea` this function determine which area has been pressed. If no provided
   each area is the last interactive HTML node inside the surface element if any
   or simply the deepest node in the HTML hierarchy.
 * `longPressDelay` the amount of millisecons that have to pass in order to 
   register a long press.
 * `doubleTapTimeout` the amount of limit millisecons to trigger a double tap.
 * `keepPressingInterval` the interval between `keeppressing` events.

### Listeners

Listeners receive a custom event object as first parameter. Its target is the 
node element that actually received the lower level event. You can inspect
`detail` property looking for more interesting info:

 * `area` the area recieving the event as it was returned by the `getArea`
   callback.
 * `fromArea` in case of movement, the previous area.
 * `moved` true if some area switching was detected.
 * `accessArea` the area where the surface was touched at the first time.
