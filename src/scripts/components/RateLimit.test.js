import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetDocument } from '../testUtils.js';
import {
  debounce,
  throttleTrailing,
  throttleLeading,
  throttleFrame,
  initRateLimit,
} from './RateLimit.js';

// Fake timers are not a convenience here, they are the only way to state what
// these functions do. The contract of every one of them is a sentence about
// time — "one call per burst, at the end", "at most once per wait" — and the
// gap between two events is exactly where it lives. Waiting for real
// milliseconds would make the suite slow and flaky at the same time; freezing
// the clock makes the assertion *become* the definition.
//
// Vitest 4's useFakeTimers() covers performance.now() and requestAnimationFrame
// on top of setTimeout, which matters because throttleLeading reads the first
// and throttleFrame schedules on the second. Both were verified faked before
// this file was written, so no custom `toFake` list is needed.
//
// jsdom returns null from canvas.getContext('2d') unless the `canvas` npm
// package is installed, and the component bails out entirely when it does.
// That is asserted below as its own contract, and stubbed everywhere else —
// same shape as the showModal stub in Modal.test.js.

const WAIT = 100;

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not run while calls keep arriving', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    // Every call lands inside the previous one's window.
    for (let i = 0; i < 5; i += 1) {
      debounced();
      vi.advanceTimersByTime(WAIT - 1);
    }

    expect(fn).not.toHaveBeenCalled();
  });

  it('runs once, `wait` after the last call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WAIT);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not run one tick early', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    debounced();
    vi.advanceTimersByTime(WAIT - 1);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('can be starved forever by calls closer together than `wait`', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    // Ten times the delay of elapsed time, and still nothing has run. This is
    // the failure mode maxWait exists to cap.
    for (let i = 0; i < 10; i += 1) {
      debounced();
      vi.advanceTimersByTime(WAIT - 10);
    }

    expect(fn).not.toHaveBeenCalled();
  });

  it('runs again for a second burst', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    debounced();
    vi.advanceTimersByTime(WAIT);
    debounced();
    vi.advanceTimersByTime(WAIT);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('runs with the arguments of the last call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    debounced('first');
    debounced('second');
    debounced('third');
    vi.advanceTimersByTime(WAIT);

    expect(fn).toHaveBeenCalledExactlyOnceWith('third');
  });

  it('cancel() drops the call that was waiting', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(WAIT);

    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel() is not one-shot: the next call debounces as usual', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    debounced('dropped');
    debounced.cancel();

    // This advance is what makes the test worth having. Without it the next
    // call would overwrite the pending timer on its own, so the assertion
    // below would hold whether cancel() did anything or not — verified by
    // emptying cancel()'s body and watching this suite stay green.
    vi.advanceTimersByTime(WAIT);
    expect(fn).not.toHaveBeenCalled();

    debounced('kept');
    vi.advanceTimersByTime(WAIT);

    expect(fn).toHaveBeenCalledExactlyOnceWith('kept');
  });

  it('cancel() with nothing pending is a no-op', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, WAIT);

    expect(() => debounced.cancel()).not.toThrow();

    // Also after a call has already landed, which is the other way to be idle.
    debounced();
    vi.advanceTimersByTime(WAIT);
    expect(() => debounced.cancel()).not.toThrow();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('throttleLeading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs immediately on the first call', () => {
    const fn = vi.fn();
    const throttled = throttleLeading(fn, WAIT);

    throttled();

    // No timer advanced. This is the whole difference from the trailing
    // version, and the reason a scroll handler feels responsive.
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores calls inside the open window', () => {
    const fn = vi.fn();
    const throttled = throttleLeading(fn, WAIT);

    throttled();
    vi.advanceTimersByTime(WAIT - 1);
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs at a steady rate through a burst', () => {
    const fn = vi.fn();
    const throttled = throttleLeading(fn, WAIT);
    const firedAt = [];
    fn.mockImplementation(() => firedAt.push(performance.now()));

    // A 250ms burst of events every 10ms at wait=100.
    const start = performance.now();
    for (let elapsed = 0; elapsed <= 250; elapsed += 10) {
      throttled();
      vi.advanceTimersByTime(10);
    }

    expect(firedAt.map((t) => t - start)).toEqual([0, 100, 200]);
  });

  it('drops the last event of a burst', () => {
    const fn = vi.fn();
    const throttled = throttleLeading(fn, WAIT);

    throttled(); // runs
    vi.advanceTimersByTime(10);
    throttled(); // ignored — and nothing is scheduled to pick it up later

    vi.advanceTimersByTime(WAIT * 10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs with the arguments of the call that opened the window', () => {
    const fn = vi.fn();
    const throttled = throttleLeading(fn, WAIT);

    throttled('first');
    throttled('second');

    // Not a bug: it ran at the moment 'first' arrived, so 'first' is the only
    // state that existed. Compare with the trailing test below.
    expect(fn).toHaveBeenCalledExactlyOnceWith('first');
  });
});

describe('throttleTrailing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not run on the first call', () => {
    const fn = vi.fn();
    const throttled = throttleTrailing(fn, WAIT);

    throttled();

    expect(fn).not.toHaveBeenCalled();
  });

  it('runs once the window it opened closes', () => {
    const fn = vi.fn();
    const throttled = throttleTrailing(fn, WAIT);

    throttled();
    vi.advanceTimersByTime(WAIT);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs at most once per window', () => {
    const fn = vi.fn();
    const throttled = throttleTrailing(fn, WAIT);

    for (let elapsed = 0; elapsed < 300; elapsed += 10) {
      throttled();
      vi.advanceTimersByTime(10);
    }

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('★ runs with the last arguments, not the ones that opened the window', () => {
    const fn = vi.fn();
    const throttled = throttleTrailing(fn, WAIT);

    throttled('first');
    vi.advanceTimersByTime(WAIT / 2);
    throttled('second');
    throttled('third');
    vi.advanceTimersByTime(WAIT);

    // Holding `args` from the opening call instead — which is what the first
    // version of this function did — reports a value a whole `wait` stale.
    // For a mousemove handler that is a position from 100ms ago.
    expect(fn).toHaveBeenCalledExactlyOnceWith('third');
  });

  it('lands a final call after the events stop', () => {
    const fn = vi.fn();
    const throttled = throttleTrailing(fn, WAIT);

    throttled();
    vi.advanceTimersByTime(WAIT);
    expect(fn).toHaveBeenCalledTimes(1);

    // One more event, then silence. The trailing edge still delivers it.
    throttled();
    vi.advanceTimersByTime(WAIT);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('leading vs trailing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // The unit-test form of the browser measurement that motivated the second
  // lane: at wait=300 a single event produced a trailing-throttle call at
  // 306ms and a debounce call at 307ms.
  it('a single isolated event cannot tell trailing throttle from debounce', () => {
    const debouncedFn = vi.fn();
    const trailingFn = vi.fn();
    const leadingFn = vi.fn();

    const debounced = debounce(debouncedFn, WAIT);
    const trailing = throttleTrailing(trailingFn, WAIT);
    const leading = throttleLeading(leadingFn, WAIT);

    debounced();
    trailing();
    leading();

    // At t=0 only the leading version has reacted.
    expect(leadingFn).toHaveBeenCalledTimes(1);
    expect(trailingFn).not.toHaveBeenCalled();
    expect(debouncedFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(WAIT);

    // And at t=wait the other two are indistinguishable.
    expect(trailingFn).toHaveBeenCalledTimes(1);
    expect(debouncedFn).toHaveBeenCalledTimes(1);
  });

  it('they disagree at both ends of a burst', () => {
    const trailingFn = vi.fn();
    const leadingFn = vi.fn();
    const trailing = throttleTrailing(trailingFn, WAIT);
    const leading = throttleLeading(leadingFn, WAIT);

    // 250ms, deliberately not a multiple of `wait`: the burst has to stop
    // *mid-window* for there to be a pending trailing call to observe. Ending
    // exactly on a boundary drains the last one before the loop exits and the
    // two look identical.
    for (let elapsed = 0; elapsed < 250; elapsed += 10) {
      trailing();
      leading();
      vi.advanceTimersByTime(10);
    }

    const trailingDuring = trailingFn.mock.calls.length;
    const leadingDuring = leadingFn.mock.calls.length;

    // Now stop, and let every pending timer drain.
    vi.advanceTimersByTime(WAIT * 5);

    // Trailing picks up one more; leading is already done. The front edge is
    // the mirror image: leading fired at t=0, trailing not until t=wait.
    expect(trailingFn.mock.calls.length).toBe(trailingDuring + 1);
    expect(leadingFn.mock.calls.length).toBe(leadingDuring);
  });
});

describe('throttleFrame', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses many calls in one frame into a single call', () => {
    const fn = vi.fn();
    const framed = throttleFrame(fn);

    for (let i = 0; i < 20; i += 1) framed();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(16);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('runs with the last arguments seen in the frame', () => {
    const fn = vi.fn();
    const framed = throttleFrame(fn);

    framed('a');
    framed('b');
    framed('c');
    vi.advanceTimersByTime(16);

    expect(fn).toHaveBeenCalledExactlyOnceWith('c');
  });

  it('schedules again on the next frame', () => {
    const fn = vi.fn();
    const framed = throttleFrame(fn);

    framed();
    vi.advanceTimersByTime(16);
    framed();
    vi.advanceTimersByTime(16);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('takes no delay at all', () => {
    // Not a behavioural assertion so much as the lane's argument, pinned so a
    // later edit cannot quietly give it a wait: the display owns this clock.
    expect(throttleFrame.length).toBe(1);
    expect(throttleLeading.length).toBe(2);
  });
});

// --- the component ---------------------------------------------------------

const LANE_KEYS = [
  'raw',
  'debounced',
  'throttledTrailing',
  'throttledLeading',
  'throttledFrame',
];

function fixture() {
  document.body.innerHTML = `
    <div class="rate-limit">
      <button type="button" class="rate-limit-pad">pad</button>
      <canvas class="rate-limit-timeline" aria-hidden="true"></canvas>
      <ul class="rate-limit-counts">
        ${LANE_KEYS.map(
          (key) =>
            `<li data-lane="${key}"><span class="rate-limit-count">0</span></li>`
        ).join('')}
      </ul>
      <div class="rate-limit-controls">
        <input type="range" class="rate-limit-wait" min="50" max="1000"
               step="50" value="300">
        <output class="rate-limit-wait-value">300 ms</output>
        <button type="button" class="rate-limit-reset">Reset</button>
      </div>
    </div>
  `;
  return document.querySelector('.rate-limit');
}

// Every 2d method the draw loop reaches for. The numbers it would produce are
// all derived from clientWidth/clientHeight, which jsdom reports as 0, so
// there is nothing here worth asserting on — the stub exists to let the rest
// of the component run at all.
function stubCanvas() {
  const context = {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => context);
  return context;
}

function count(key) {
  return Number(
    document.querySelector(`[data-lane="${key}"] .rate-limit-count`).textContent
  );
}

function move(times = 1) {
  const pad = document.querySelector('.rate-limit-pad');
  for (let i = 0; i < times; i += 1) {
    pad.dispatchEvent(new Event('pointermove'));
  }
}

describe('initRateLimit', () => {
  let cleanup;
  let originalGetContext;

  beforeEach(() => {
    originalGetContext = HTMLCanvasElement.prototype.getContext;
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (cleanup) cleanup();
    cleanup = undefined;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    vi.useRealTimers();
    resetDocument();
  });

  it('bails out when the canvas has no 2d context', () => {
    // jsdom's real behaviour, kept as a contract: a browser that cannot give
    // the component a drawing surface gets left alone rather than half wired.
    const demo = fixture();
    HTMLCanvasElement.prototype.getContext = () => null;

    cleanup = initRateLimit();

    expect(demo.dataset.enhanced).toBeUndefined();
    move(3);
    expect(count('raw')).toBe(0);
  });

  it('marks the demo enhanced and does not bind twice', () => {
    const demo = fixture();
    stubCanvas();

    cleanup = initRateLimit();
    expect(demo.dataset.enhanced).toBe('true');

    const second = initRateLimit();
    move(1);

    // Asserting on the counter text would prove nothing, and a mutation run
    // showed it: a second init builds its own `counts` object starting at
    // zero, so both listeners write "1" to the same element and the DOM looks
    // identical either way. What a second init cannot hide is asking the
    // canvas for a context — the data-enhanced guard sits above that call, so
    // one context means one enhancement.
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1);
    expect(count('raw')).toBe(1);
    second();
  });

  it('feeds every lane from the same event stream', () => {
    fixture();
    stubCanvas();
    cleanup = initRateLimit();

    move(1);
    expect(count('raw')).toBe(1);
    expect(count('throttledLeading')).toBe(1); // leading edge, already ran
    expect(count('debounced')).toBe(0);
    expect(count('throttledTrailing')).toBe(0);
    expect(count('throttledFrame')).toBe(0);

    vi.advanceTimersByTime(300); // the slider's default wait
    expect(count('debounced')).toBe(1);
    expect(count('throttledTrailing')).toBe(1);
    expect(count('throttledFrame')).toBe(1); // landed on the next frame
  });

  it('counts a keydown, but not the Tab that leaves the pad', () => {
    fixture();
    stubCanvas();
    cleanup = initRateLimit();
    const pad = document.querySelector('.rate-limit-pad');

    pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(count('raw')).toBe(1);

    pad.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(count('raw')).toBe(1);
  });

  it('rebuilds the wrappers when the wait changes', () => {
    fixture();
    stubCanvas();
    cleanup = initRateLimit();
    const waitInput = document.querySelector('.rate-limit-wait');
    const waitOutput = document.querySelector('.rate-limit-wait-value');

    move(1);
    waitInput.value = '50';
    waitInput.dispatchEvent(new Event('input'));
    expect(waitOutput.textContent).toBe('50 ms');

    // rebuild() cancels the wrapper it is replacing, so the call that was
    // waiting on the old 300ms delay never lands. Without that cancel the
    // closure would keep its own timer and mark once more, on a delay the
    // slider has already moved off.
    vi.advanceTimersByTime(300);
    expect(count('debounced')).toBe(0);

    // The new wrapper does use the new delay.
    move(1);
    vi.advanceTimersByTime(50);
    expect(count('debounced')).toBe(1);
  });

  it('resets every counter', () => {
    fixture();
    stubCanvas();
    cleanup = initRateLimit();

    move(3);
    vi.advanceTimersByTime(300);
    expect(count('raw')).toBe(3);

    document
      .querySelector('.rate-limit-reset')
      .dispatchEvent(new Event('click', { bubbles: true }));

    LANE_KEYS.forEach((key) => expect(count(key)).toBe(0));
  });

  it('stops listening after cleanup', () => {
    fixture();
    stubCanvas();
    const stop = initRateLimit();

    move(1);
    expect(count('raw')).toBe(1);

    stop();
    move(5);
    expect(count('raw')).toBe(1);
  });

  it('cleanup cancels the debounce that was waiting', () => {
    fixture();
    stubCanvas();
    const stop = initRateLimit();

    move(1); // opens a debounce window
    stop();
    vi.advanceTimersByTime(300);

    // abort() only removes listeners; this timer was queued before it ran.
    // Cancelling is what reaches back for it.
    expect(count('debounced')).toBe(0);
  });

  it('cleanup cancels the wrapper the slider left behind, not the first one', () => {
    fixture();
    stubCanvas();
    const stop = initRateLimit();

    // Moving the slider replaces `debounced`, so there are now two wrappers in
    // the test's history and only one of them is live.
    const waitInput = document.querySelector('.rate-limit-wait');
    waitInput.value = '50';
    waitInput.dispatchEvent(new Event('input'));

    move(1); // opens a window on the *new* wrapper
    stop();
    vi.advanceTimersByTime(300);

    // Which is why the canceller reads `debounced` at teardown instead of
    // capturing it when the demo was enhanced: a captured one would cancel the
    // wrapper nobody is using and let this call through. Verified by making
    // that exact substitution — the test above stays green, this one does not.
    expect(count('debounced')).toBe(0);
  });

  it('cleanup still does not reach a frame already booked', () => {
    fixture();
    stubCanvas();
    const stop = initRateLimit();

    move(1); // books a frame through throttleFrame
    stop();
    vi.advanceTimersByTime(300);

    // The remaining half of the same gap, pinned rather than papered over.
    // cancel() went to debounce only, because that is the wrapper Autocomplete
    // needs; throttleFrame still fires once into a component that is gone.
    // This becomes 0 when step 4 of the file's follow-up list finishes.
    expect(count('throttledFrame')).toBe(1);
  });
});
