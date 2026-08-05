import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetDocument } from '../testUtils.js';
import { initAutocomplete } from './Autocomplete.js';

// This is the first suite in the repo that needs fake timers *and* promises at
// once — RateLimit.test.js needed only the first, Scroll.test.js only the
// second — and the two do not compose the obvious way. Scroll's
// `settle = () => new Promise((r) => setTimeout(r, 0))` never resolves under
// vi.useFakeTimers(), because the timer it is waiting on is the one nothing is
// advancing. vi.advanceTimersByTimeAsync() is the tool that does both: it
// moves the clock *and* drains the microtasks queued behind every await.
//
// jsdom has no scrollIntoView at all — not a stub, undefined — so setActive()
// would throw on the first arrow key. It is put on the prototype here for the
// same reason Modal.test.js does it for showModal: the component should keep
// calling what a browser actually provides, rather than grow a guard whose
// only purpose is to survive the test environment.

const WAIT = 250;

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

function installFetch() {
  const calls = [];
  const fn = vi.fn((url, init) => {
    const control = deferred();
    calls.push({ url, signal: init && init.signal, ...control });
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => {
        // Rejecting a promise that already settled is a no-op, which is
        // exactly the behaviour under test: aborting after the body arrived
        // does nothing, and only the request-id check catches that case.
        control.reject(
          new DOMException('The user aborted a request.', 'AbortError')
        );
      });
    }
    return control.promise;
  });
  fn.calls = calls;
  globalThis.fetch = fn;
  return fn;
}

const asSuggestions = (words) => words.map((word) => ({ word }));

function respondWith(call, words) {
  call.resolve({
    ok: true,
    status: 200,
    json: async () => asSuggestions(words),
  });
}

// Resolves the response but holds the body, so a request can be parked exactly
// where abort() can no longer reach it. Returns the release.
function respondHolding(call) {
  const body = deferred();
  call.resolve({ ok: true, status: 200, json: () => body.promise });
  return (words) => body.resolve(asSuggestions(words));
}

// Drains the microtask queue without moving the clock.
const settle = () => vi.advanceTimersByTimeAsync(0);

const q = (selector) => document.querySelector(selector);
const options = () => [...document.querySelectorAll('[role="option"]')];
const input = () => q('.autocomplete-input');
const listbox = () => q('.autocomplete-listbox');
const status = () => q('.autocomplete-status');

function widgetMarkup(id = 'autocomplete-input', { controls = true } = {}) {
  return `
    <div class="autocomplete">
      <label for="${id}">Search</label>
      <div class="autocomplete-field">
        <input type="text" id="${id}" class="autocomplete-input" role="combobox"
               aria-expanded="false" aria-controls="${id}-listbox"
               aria-autocomplete="list" autocomplete="off" />
        <ul id="${id}-listbox" class="autocomplete-listbox" role="listbox" hidden></ul>
      </div>
      <p class="autocomplete-status" role="status" aria-live="polite"></p>
      ${
        controls
          ? `<fieldset class="autocomplete-controls">
               <label><input type="checkbox" class="autocomplete-slow" /> slow</label>
               <label><input type="checkbox" class="autocomplete-discard" checked /> discard</label>
             </fieldset>
             <ul class="autocomplete-log"></ul>`
          : ''
      }
    </div>
  `;
}

function mount(html = widgetMarkup()) {
  document.body.innerHTML = html;
  return initAutocomplete();
}

// Typing, as the browser reports it: the value is already updated by the time
// the event fires.
function type(value, { isComposing = false } = {}) {
  const el = input();
  el.value = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing }));
}

function press(key, { altKey = false } = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    altKey,
    bubbles: true,
    cancelable: true,
  });
  input().dispatchEvent(event);
  return event;
}

// One keystroke all the way to a rendered list, which most tests only need as
// a starting position.
async function search(query, words, fetchMock) {
  type(query);
  await vi.advanceTimersByTimeAsync(WAIT);
  respondWith(fetchMock.calls.at(-1), words);
  await settle();
}

let fetchMock;
let cleanup;

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  fetchMock = installFetch();
  cleanup = null;
});

afterEach(() => {
  if (cleanup) cleanup();
  resetDocument();
  vi.useRealTimers();
  delete Element.prototype.scrollIntoView;
  delete globalThis.fetch;
});

describe('initAutocomplete — wiring', () => {
  it('marks the widget enhanced', () => {
    cleanup = mount();
    expect(q('.autocomplete').dataset.enhanced).toBe('true');
  });

  it('leaves widgets outside the given root alone', () => {
    document.body.innerHTML = `<div id="outside">${widgetMarkup()}</div>`;
    const root = document.createElement('div');
    document.body.append(root);

    cleanup = initAutocomplete(root);

    expect(q('.autocomplete').dataset.enhanced).toBeUndefined();
  });

  it('does not bind a widget it has already enhanced', async () => {
    cleanup = mount();
    const second = initAutocomplete();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);

    // A second binding would put two listeners on the same input, and the
    // debounce is per-init, so both would fire.
    expect(fetchMock).toHaveBeenCalledOnce();
    second();
  });

  it('leaves a widget with no listbox alone, and does not mark it enhanced', () => {
    document.body.innerHTML = `
      <div class="autocomplete">
        <input class="autocomplete-input" id="x" />
        <p class="autocomplete-status"></p>
      </div>`;

    cleanup = initAutocomplete();

    // Marking it would mean a later, complete render of the same widget could
    // never be enhanced.
    expect(q('.autocomplete').dataset.enhanced).toBeUndefined();
  });
});

describe('initAutocomplete — debouncing', () => {
  it('sends nothing until the wait has passed', async () => {
    cleanup = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT - 1);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('collapses a burst of keystrokes into one request', async () => {
    cleanup = mount();

    type('a');
    await vi.advanceTimersByTimeAsync(50);
    type('au');
    await vi.advanceTimersByTimeAsync(50);
    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.calls[0].url).toContain('s=aut');
  });

  it('sends nothing for an emptied field, and drops what was pending', async () => {
    cleanup = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT - 50);
    type('');
    await vi.advanceTimersByTimeAsync(WAIT);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('initAutocomplete — results', () => {
  it('renders one option per suggestion and opens the popup', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);

    expect(options().map((o) => o.textContent)).toEqual([
      'autonomy',
      'authority',
    ]);
    expect(listbox().hidden).toBe(false);
    expect(input().getAttribute('aria-expanded')).toBe('true');
  });

  it('marks the matched prefix without going through innerHTML', async () => {
    cleanup = mount();
    await search('aut', ['autonomy'], fetchMock);

    const mark = options()[0].querySelector('mark');
    expect(mark.textContent).toBe('aut');
    // A word carrying markup arrives as text, not as elements.
    await search('x', ['<img src=x onerror=alert(1)>'], fetchMock);
    expect(options()[0].querySelector('img')).toBeNull();
  });

  it('gives every option an id derived from the input, and points at it', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);

    expect(options().map((o) => o.id)).toEqual([
      'autocomplete-input-option-0',
      'autocomplete-input-option-1',
    ]);

    press('ArrowDown');
    expect(input().getAttribute('aria-activedescendant')).toBe(options()[0].id);
  });

  it('announces the count', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);
    expect(status().textContent).toBe('2 results.');

    await search('auto', ['autonomy'], fetchMock);
    expect(status().textContent).toBe('1 result.');
  });

  it('stays closed and says so when nothing matched', async () => {
    cleanup = mount();
    await search('zzz', [], fetchMock);

    expect(listbox().hidden).toBe(true);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(status().textContent).toContain('No matches');
  });
});

describe('initAutocomplete — stale responses', () => {
  it('aborts the request a new keystroke has replaced', async () => {
    cleanup = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);
    const first = fetchMock.calls[0];
    expect(first.signal.aborted).toBe(false);

    type('auto');
    await vi.advanceTimersByTimeAsync(WAIT);

    expect(first.signal.aborted).toBe(true);
  });

  it('★ drops a response that arrives after a newer request was sent', async () => {
    cleanup = mount();

    // The first request gets as far as a response object and then parks on the
    // body. From here abort() can do nothing to it — the fetch promise has
    // already settled — so this is the case the request id exists for.
    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);
    const releaseFirst = respondHolding(fetchMock.calls[0]);
    await settle();

    type('autono');
    await vi.advanceTimersByTimeAsync(WAIT);
    respondWith(fetchMock.calls[1], ['autonomy']);
    await settle();

    // Now the overtaken one finally arrives.
    releaseFirst(['author', 'authority']);
    await settle();

    expect(options().map((o) => o.textContent)).toEqual(['autonomy']);
    expect(status().textContent).toBe('1 result.');
  });

  it('renders the newest response even when it arrives first', async () => {
    cleanup = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);
    const releaseFirst = respondHolding(fetchMock.calls[0]);
    await settle();

    type('autono');
    await vi.advanceTimersByTimeAsync(WAIT);
    respondWith(fetchMock.calls[1], ['autonomy']);
    await settle();

    releaseFirst(['author']);
    await settle();

    expect(listbox().hidden).toBe(false);
    expect(options()).toHaveLength(1);
  });
});

describe('initAutocomplete — failure', () => {
  it('reports a failed request and leaves the popup closed', async () => {
    cleanup = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);
    fetchMock.calls[0].resolve({ ok: false, status: 500 });
    await settle();

    expect(status().textContent).toBe('Could not load suggestions.');
    expect(listbox().hidden).toBe(true);
  });

  it('does not report an abort as a failure', async () => {
    cleanup = mount();
    await search('aut', ['autonomy'], fetchMock);

    type('auto');
    await vi.advanceTimersByTimeAsync(WAIT);
    await settle();

    // The first request was aborted here, and its rejection must not overwrite
    // the searching state with an error the user did not cause.
    expect(status().textContent).not.toBe('Could not load suggestions.');
  });
});

describe('initAutocomplete — keyboard', () => {
  beforeEach(() => {
    fetchMock = installFetch();
  });

  const activeText = () =>
    listbox().querySelector('[aria-selected="true"]')?.textContent;

  it('walks the options and keeps exactly one selected', async () => {
    cleanup = mount();
    await search('aut', ['one', 'two', 'three'], fetchMock);

    press('ArrowDown');
    expect(activeText()).toBe('one');
    press('ArrowDown');
    expect(activeText()).toBe('two');
    expect(listbox().querySelectorAll('[aria-selected="true"]')).toHaveLength(
      1
    );
  });

  it('wraps at both ends', async () => {
    cleanup = mount();
    await search('aut', ['one', 'two', 'three'], fetchMock);

    press('ArrowUp');
    expect(activeText()).toBe('three');
    press('ArrowDown');
    expect(activeText()).toBe('one');
    press('ArrowUp');
    expect(activeText()).toBe('three');
  });

  it('takes the highlighted option on Enter and closes', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);

    press('ArrowDown');
    press('Enter');

    expect(input().value).toBe('autonomy');
    expect(listbox().hidden).toBe(true);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('leaves Enter alone when nothing is highlighted', async () => {
    cleanup = mount();
    await search('aut', ['autonomy'], fetchMock);

    const event = press('Enter');

    // The typed text is the answer, so the key belongs to whatever would
    // normally handle it — a surrounding form, for instance.
    expect(event.defaultPrevented).toBe(false);
    expect(input().value).toBe('aut');
  });

  it('cancels a pending search when an option is taken', async () => {
    cleanup = mount();
    await search('aut', ['autonomy'], fetchMock);

    // A keystroke books a search, and the arrow keys arrive before it fires.
    type('auto');
    press('ArrowDown');
    press('Enter');
    await vi.advanceTimersByTimeAsync(WAIT * 2);

    // Without cancel() the debounce would land after the choice and reopen a
    // list over the answer.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(listbox().hidden).toBe(true);
  });

  it('closes on the first Escape and clears on the second', async () => {
    cleanup = mount();
    await search('aut', ['autonomy'], fetchMock);

    press('Escape');
    expect(listbox().hidden).toBe(true);
    expect(input().value).toBe('aut');

    press('Escape');
    expect(input().value).toBe('');
    expect(status().textContent).toBe('');
  });

  it('opens without highlighting anything on Alt+ArrowDown', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);
    press('Escape');

    press('ArrowDown', { altKey: true });

    expect(listbox().hidden).toBe(false);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('leaves Home and End to the caret', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);
    press('ArrowDown');

    expect(press('Home').defaultPrevented).toBe(false);
    expect(press('End').defaultPrevented).toBe(false);
    // Tab.js sends these to the first and last tab; in a text field the caret
    // has the stronger claim, so the highlight must not have moved.
    expect(activeText()).toBe('autonomy');
  });
});

describe('initAutocomplete — pointer', () => {
  it('stops mousedown on an option from moving focus', async () => {
    cleanup = mount();
    await search('aut', ['autonomy'], fetchMock);

    const event = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    options()[0].dispatchEvent(event);

    // Letting it through would blur the input, fire focusout, close the popup
    // and delete the option before the click could land on it.
    expect(event.defaultPrevented).toBe(true);
  });

  it('takes the option that was clicked', async () => {
    cleanup = mount();
    await search('aut', ['autonomy', 'authority'], fetchMock);

    options()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(input().value).toBe('authority');
    expect(listbox().hidden).toBe(true);
  });
});

describe('initAutocomplete — composition', () => {
  it('sends nothing while a character is still being composed', async () => {
    cleanup = mount();

    type('ㅎ', { isComposing: true });
    await vi.advanceTimersByTimeAsync(WAIT * 2);

    // Otherwise every jamo of a Hangul syllable spends a request on a
    // half-formed character nobody meant to search for.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches once the composition ends', async () => {
    cleanup = mount();

    type('한', { isComposing: true });
    input().dispatchEvent(
      new CompositionEvent('compositionend', { bubbles: true })
    );
    await vi.advanceTimersByTimeAsync(WAIT);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.calls[0].url).toContain(encodeURIComponent('한'));
  });
});

describe('initAutocomplete — cleanup', () => {
  it('stops responding once the returned cleanup runs', async () => {
    cleanup = mount();
    cleanup();
    cleanup = null;

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT * 2);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('aborts the request that was in flight', async () => {
    const stop = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT);
    expect(fetchMock.calls[0].signal.aborted).toBe(false);

    stop();

    expect(fetchMock.calls[0].signal.aborted).toBe(true);
  });

  it('cancels a search that was still waiting', async () => {
    const stop = mount();

    type('aut');
    await vi.advanceTimersByTimeAsync(WAIT - 50);
    stop();
    await vi.advanceTimersByTimeAsync(WAIT);

    // abort() removes the listeners but cannot reach a timer already booked.
    // This is the gap RateLimit.js left open until debounce grew a cancel(),
    // and the reason Autocomplete was the session that added it.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
