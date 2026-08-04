// How much history the timeline shows, left edge to right edge.
const WINDOW_MS = 4000;

// One second between gridlines, so the throttle interval can be counted
// against them rather than taken on trust.
const GRID_MS = 1000;

// Room above the first lane and below the last one. Each lane label sits
// above its own baseline, so without this the top one is drawn off the
// canvas and clipped.
const LANE_INSET = 14;

// Draw order, top to bottom. `key` matches the data-lane attribute on the
// count list, which is how the counters are found, and is also the key each
// lane's marks and running total are stored under.
const LANES = [
  { key: 'raw', label: 'raw', color: '#8a8a8a', width: 1 },
  { key: 'debounced', label: 'debounce', color: 'rgb(25, 64, 239)', width: 2 },
  {
    key: 'throttledTrailing',
    label: 'throttle · trailing',
    color: '#e5601f',
    width: 2,
  },
  {
    key: 'throttledLeading',
    label: 'throttle · leading',
    color: '#1f8a4c',
    width: 2,
  },
  {
    key: 'throttledFrame',
    label: 'requestAnimationFrame',
    color: '#7b3fa0',
    width: 2,
  },
];

/* ------------------------------------------------------------------------ *
 * Four wrappers, one event stream
 *
 * The first three take a function and a delay and hand back a version that
 * calls it less often. What separates them is one decision, made when an
 * event arrives while the clock is already running:
 *
 *   debounce   cancels the pending call and starts the delay over, so nothing
 *              runs until the events stop. One call per burst, at the end.
 *
 *   throttle   lets the running window finish either way, so calls keep
 *              coming at a fixed rate for as long as events do. Which end of
 *              the window it fires on is a second, separate choice — hence
 *              two lanes:
 *
 *     trailing  opens a window on the first event and fires when it closes.
 *               The first reaction is a whole `wait` late, so a single
 *               isolated event is indistinguishable from debounce. Measured
 *               at wait=300: throttle fired at 306ms, debounce at 307ms.
 *
 *     leading   fires immediately, then ignores everything until the window
 *               is up. Reacts at once, but the last event of a burst is
 *               dropped — stop moving mid-window and the final position
 *               never lands.
 *
 * lodash does both edges at once, which is why its throttle needs neither
 * choice made for it. Its throttle is also literally debounce with maxWait
 * set: "run when things go quiet, but never wait longer than X" is the same
 * contract as "at most once per X". The two are ends of one axis, not
 * separate ideas.
 *
 * The fourth takes no delay at all, which is the point of having it here:
 *
 *   requestAnimationFrame  same shape as leading throttle — "already
 *              scheduled? do nothing" — with a frame standing in for the
 *              window. The browser owns the clock, so the rate is the
 *              display's refresh rate and the wait slider has no say in it.
 *              Move the slider and every lane but this one changes.
 *
 * Two consequences follow from the browser owning the clock, and they are why
 * this is the right tool for painting and the wrong one for anything else:
 *
 *   - It cannot be wrong about the refresh rate. Hardcoding `wait: 16`
 *     assumes 60Hz; a 120Hz display makes that a wasted half of every frame.
 *   - It does not run at all while the tab is hidden. Measured in this repo:
 *     with the tab backgrounded, an rAF loop stopped dead while a 300ms
 *     setTimeout stretched to 1101ms but still fired. Skipping work nobody
 *     can see is the feature — which also means never scheduling a save, a
 *     request, or anything else that must happen this way.
 *
 * Counting rAF marks between two gridlines reads the refresh rate straight
 * off the timeline: 60 per second on most displays, 120 on ProMotion.
 *
 * Still worth building from here:
 *
 *   1. Give throttle both edges, and see the trailing and leading lanes
 *      merge into one.
 *   2. Add a leading option to debounce: fire immediately, then ignore the
 *      rest of the burst. That is the double-submit guard on a button.
 *   3. Add maxWait to debounce and watch it turn into the throttle lane.
 *   4. Give each a cancel(), and call it from the cleanup this file returns.
 *      A pending timer outlives the DOM it was going to touch.
 *   5. Write RateLimit.test.js with vi.useFakeTimers(). Asserting "three
 *      calls inside 300ms produce one" and "a 250ms burst at wait=100 fires
 *      at 0, 100 and 200" is the clearest definition any of these have.
 * ------------------------------------------------------------------------ */

// The four wrappers are exported so the tests can assert their timing
// directly. Going through the page instead would leave the args contract
// untestable — the demo passes each wrapper a `fn` that takes none, so
// "which call's arguments survive" could never be observed from the DOM.
export function debounce(fn, wait) {
  let timerID = null;
  return (...args) => {
    // No guard needed: clearTimeout(null) is a no-op.
    clearTimeout(timerID);
    timerID = setTimeout(() => {
      // Clearing the id on the way out keeps it honest as a "call pending?"
      // flag, which is what cancel() will read.
      timerID = null;
      fn(...args);
    }, wait);
  };
}

// Trailing edge: the first event opens a window, and the call lands when the
// window closes.
export function throttleTrailing(fn, wait) {
  let timerID = null;
  let lastArgs;

  return (...args) => {
    // Overwritten by every event in the window, so the call that eventually
    // runs carries the most recent one. Holding the args from the event that
    // opened the window instead would report a position `wait` ms stale,
    // which defeats the point of firing at the end.
    lastArgs = args;
    if (timerID !== null) return;

    timerID = setTimeout(() => {
      timerID = null;
      fn(...lastArgs);
    }, wait);
  };
}

// Leading edge: fire now, then ignore everything until the window is up.
// Nothing is scheduled, so there is no timer to clean up — and no trailing
// call either, which is the trade.
export function throttleLeading(fn, wait) {
  // -Infinity, not 0. Zero only passes the check below once performance.now()
  // has already exceeded `wait`, so with the slider at 1000ms the first event
  // in the second after page load would be swallowed. The tests caught this:
  // fake timers start the clock at 0, which is the same situation.
  let last = -Infinity;

  return (...args) => {
    // performance.now() rather than Date.now(): it counts monotonically from
    // page load, so a system clock adjustment cannot make the window jump.
    const now = performance.now();
    if (now - last < wait) return;
    last = now;
    fn(...args);
  };
}

// No `wait` parameter, because there is no delay to choose: the callback runs
// just before the next paint, whenever the browser decides that is. Structurally
// this is throttleLeading with a frame in place of the window, and trailing
// args in place of first-event args — the last position inside a frame is the
// one worth drawing.
export function throttleFrame(fn) {
  let frameID = null;
  let lastArgs;

  return (...args) => {
    lastArgs = args;
    if (frameID !== null) return;

    frameID = requestAnimationFrame(() => {
      frameID = null;
      fn(...lastArgs);
    });
  };
}

// Enhances every .rate-limit inside `root`. Returns a function that stops the
// draw loop and removes the listeners, because an animation frame that keeps
// requesting itself outlives the DOM it was drawing for.
export function initRateLimit(root = document) {
  const controller = new AbortController();
  const { signal } = controller;
  const frames = [];

  root.querySelectorAll('.rate-limit').forEach((demo) => {
    const demoEl = demo;
    if (demoEl.dataset.enhanced === 'true') return;

    const pad = demoEl.querySelector('.rate-limit-pad');
    const canvas = demoEl.querySelector('.rate-limit-timeline');
    const waitInput = demoEl.querySelector('.rate-limit-wait');
    const waitOutput = demoEl.querySelector('.rate-limit-wait-value');
    const resetButton = demoEl.querySelector('.rate-limit-reset');
    if (!pad || !canvas || !waitInput || !waitOutput || !resetButton) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    // `marks` holds the timestamps the timeline draws: entries older than the
    // window are dropped as they scroll off the left edge, so it stays bounded
    // however long the page is left running. `counts` is separate because it
    // is cumulative — the point of the raw number is to see how many calls the
    // wrapping saved. All three are keyed off LANES so that adding a lane is a
    // change in one place.
    const countEls = {};
    const marks = {};
    const counts = {};
    LANES.forEach((lane) => {
      countEls[lane.key] = demoEl.querySelector(
        `[data-lane="${lane.key}"] .rate-limit-count`
      );
      marks[lane.key] = [];
      counts[lane.key] = 0;
    });
    if (LANES.some((lane) => !countEls[lane.key])) return;

    demoEl.dataset.enhanced = 'true';

    let debounced;
    let throttledTrailing;
    let throttledLeading;

    // Built once instead of inside rebuild(), because there is no `wait` to
    // rebuild it for. That asymmetry is the lane's whole argument: the slider
    // moves every other lane and leaves this one alone.
    const throttledFrame = throttleFrame(() => mark('throttledFrame'));

    function mark(key) {
      marks[key].push(performance.now());
      counts[key] += 1;
      countEls[key].textContent = counts[key];
    }

    // Moving the slider builds a fresh set. The old wrappers are dropped, but
    // anything they had already scheduled is not — the closure holds its own
    // timer and still fires into `mark`, so a slider move mid-burst produces
    // one last mark on the old delay. Same missing cancel() as the cleanup
    // below; fixing one fixes both.
    function rebuild() {
      const wait = Number(waitInput.value);
      waitOutput.textContent = `${wait} ms`;
      debounced = debounce(() => mark('debounced'), wait);
      throttledTrailing = throttleTrailing(
        () => mark('throttledTrailing'),
        wait
      );
      throttledLeading = throttleLeading(() => mark('throttledLeading'), wait);
    }

    // All of them see the identical event stream, which is the only way the
    // lanes are comparable.
    function emit() {
      mark('raw');
      debounced();
      throttledTrailing();
      throttledLeading();
      throttledFrame();
    }

    // The backing store is sized in device pixels and the drawing code works
    // in CSS pixels, so the transform is set once per size change rather than
    // multiplying every coordinate below. Tracked against the ratio too, since
    // dragging the window to a second monitor changes it without changing the
    // element's size.
    let cssWidth = 0;
    let cssHeight = 0;
    let cssRatio = 0;

    function resize() {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === cssWidth && height === cssHeight && ratio === cssRatio) {
        return;
      }
      cssWidth = width;
      cssHeight = height;
      cssRatio = ratio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // A fixed ruler rather than something that slides with the marks: the
    // question it answers is how far apart two marks are, and that is easier
    // to read against lines that hold still.
    function drawGrid() {
      context.strokeStyle = '#e0e0e0';
      context.lineWidth = 1;
      for (let age = 0; age <= WINDOW_MS; age += GRID_MS) {
        const x = Math.round(cssWidth * (1 - age / WINDOW_MS)) + 0.5;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, cssHeight);
        context.stroke();
      }
    }

    let frame;

    function draw() {
      resize();
      const now = performance.now();

      context.clearRect(0, 0, cssWidth, cssHeight);
      drawGrid();

      const laneHeight = (cssHeight - LANE_INSET * 2) / LANES.length;

      LANES.forEach((lane, index) => {
        const list = marks[lane.key];
        // shift() from the front is safe here because the array is already in
        // ascending order — pushes only ever happen at `now`.
        while (list.length > 0 && now - list[0] > WINDOW_MS) list.shift();

        const middle = LANE_INSET + index * laneHeight + laneHeight / 2;
        const tick = laneHeight * 0.34;

        context.strokeStyle = '#c8c8c8';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0, Math.round(middle) + 0.5);
        context.lineTo(cssWidth, Math.round(middle) + 0.5);
        context.stroke();

        context.strokeStyle = lane.color;
        context.lineWidth = lane.width;
        list.forEach((time) => {
          const x = cssWidth * (1 - (now - time) / WINDOW_MS);
          context.beginPath();
          context.moveTo(x, middle - tick);
          context.lineTo(x, middle + tick);
          context.stroke();
        });

        context.fillStyle = lane.color;
        context.font = '11px Roboto, sans-serif';
        context.textBaseline = 'bottom';
        context.fillText(lane.label, 4, middle - tick - 2);
      });

      frame = requestAnimationFrame(draw);
    }

    pad.addEventListener('pointermove', emit, { signal });
    pad.addEventListener(
      'keydown',
      (event) => {
        // Tab is how the pad is left, so counting it would add a mark on the
        // way out. Every other key repeats while held, which is the point.
        if (event.key === 'Tab') return;
        emit();
      },
      { signal }
    );

    waitInput.addEventListener('input', rebuild, { signal });

    resetButton.addEventListener(
      'click',
      () => {
        LANES.forEach((lane) => {
          marks[lane.key].length = 0;
          counts[lane.key] = 0;
          countEls[lane.key].textContent = '0';
        });
      },
      { signal }
    );

    rebuild();
    frame = requestAnimationFrame(draw);
    frames.push(() => cancelAnimationFrame(frame));
  });

  // Aborting the controller removes the listeners, so nothing new is
  // scheduled after this. What it does not reach is work already queued when
  // it runs: a debounce timer mid-wait, or a frame throttleFrame has booked.
  // Both fire once into a component that is gone. That is exactly the gap the
  // cancel() in step 4 of the notes above closes.
  return () => {
    controller.abort();
    frames.forEach((stop) => stop());
  };
}
