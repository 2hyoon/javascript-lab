import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetDocument } from '../testUtils.js';
import { initScroll } from './Scroll.js';

// jsdom implements neither IntersectionObserver nor fetch in a form this
// component can use, so both are replaced here. That is not a limitation to
// work around — it is what makes the interesting cases reachable at all: a
// real observer cannot be told "fire twice while the request is still open",
// and a real fetch cannot be held open across an assertion.
//
// Every request below is a deferred promise the test resolves by hand, so the
// window between "request sent" and "response arrived" is as wide as it needs
// to be. That window is where the bug this file pins down used to live.

const observers = [];

class FakeIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.targets = [];
    this.observeCount = 0;
    this.disconnected = false;
    // The spec delivers an initial record for the current state whenever a
    // target is observed. Tests that care about the re-observe loop turn this
    // on; the rest drive the callback by hand.
    this.redeliverOnObserve = false;
    this.lastIsIntersecting = false;
    observers.push(this);
  }

  observe(target) {
    this.observeCount += 1;
    if (!this.targets.includes(target)) this.targets.push(target);
    if (this.redeliverOnObserve) {
      queueMicrotask(() => this.trigger(this.lastIsIntersecting));
    }
  }

  unobserve(target) {
    this.targets = this.targets.filter((t) => t !== target);
  }

  disconnect() {
    this.disconnected = true;
    this.targets = [];
  }

  trigger(isIntersecting = true) {
    this.lastIsIntersecting = isIntersecting;
    this.callback([{ target: this.targets[0], isIntersecting }], this);
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installFetch() {
  const calls = [];
  const fn = vi.fn((url, init) => {
    const control = deferred();
    calls.push({ url, signal: init && init.signal, ...control });
    if (init && init.signal) {
      init.signal.addEventListener('abort', () => {
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

const respondWith = (call, posts) =>
  call.resolve({ ok: true, status: 200, json: async () => posts });

const makePosts = (count, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    title: `Title ${offset + i + 1}`,
    body: `Body ${offset + i + 1}`,
  }));

// A macrotask turn drains every microtask queued behind the awaits inside
// loadPosts, so the DOM is settled by the time an assertion runs.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const markup = () => `
  <div class="scroll-feed">
    <ul class="post-list" aria-busy="false"></ul>
    <p class="scroll-status" role="status" aria-live="polite"></p>
    <button type="button" class="scroll-more">Load more posts</button>
  </div>`;

const feed = () => document.querySelector('.scroll-feed');
const list = () => document.querySelector('.post-list');
const status = () => document.querySelector('.scroll-status');
const moreButton = () => document.querySelector('.scroll-more');
const items = () => [...document.querySelectorAll('.post-list li')];
const observer = () => observers[0];

let fetchMock;
let cleanup;

function mountScroll(html = markup()) {
  document.body.innerHTML = html;
  cleanup = initScroll();
  return cleanup;
}

beforeEach(() => {
  observers.length = 0;
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  fetchMock = installFetch();
  cleanup = null;
});

afterEach(() => {
  if (cleanup) cleanup();
  resetDocument();
  delete globalThis.IntersectionObserver;
  delete globalThis.fetch;
});

describe('initScroll — wiring', () => {
  it('does nothing when the page holds no feed', () => {
    document.body.innerHTML =
      '<div class="container"><h1>Other page</h1></div>';
    cleanup = initScroll();

    expect(observers).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks the feed enhanced and observes the button', () => {
    mountScroll();

    expect(feed().dataset.enhanced).toBe('true');
    expect(observers).toHaveLength(1);
    expect(observer().targets).toEqual([moreButton()]);
  });

  it('leaves a feed missing any of its parts alone', () => {
    document.body.innerHTML = '<div class="scroll-feed"></div>';
    cleanup = initScroll();

    expect(feed().dataset.enhanced).toBeUndefined();
    expect(observers).toHaveLength(0);
  });

  it('does not double-bind when init runs twice', () => {
    const first = mountScroll();
    const second = initScroll();

    expect(observers).toHaveLength(1);

    cleanup = () => {
      first();
      second();
    };
  });

  it('only enhances feeds inside the given root', () => {
    document.body.innerHTML = `
      <div id="inside">${markup()}</div>
      <div id="outside">${markup()}</div>`;
    cleanup = initScroll(document.getElementById('inside'));

    const feeds = [...document.querySelectorAll('.scroll-feed')];
    expect(feeds[0].dataset.enhanced).toBe('true');
    expect(feeds[1].dataset.enhanced).toBeUndefined();
    expect(observers).toHaveLength(1);
  });
});

describe('initScroll — loading', () => {
  it('stays idle while the button is out of view', () => {
    mountScroll();
    observer().trigger(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the first page when the button comes into view', async () => {
    mountScroll();
    observer().trigger(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.calls[0].url).toContain('_page=1');
    expect(fetchMock.calls[0].url).toContain('_limit=5');

    respondWith(fetchMock.calls[0], makePosts(5));
    await settle();

    expect(items()).toHaveLength(5);
    expect(list().querySelector('h2').textContent).toBe('Title 1');
  });

  // Empty alt because the post text beside it says everything the picture
  // says; lazy because a post further down the feed may never be reached,
  // which is the case the attribute exists for and the opposite of the
  // carousel, where every slide is about to be shown.
  it('gives the decorative image an empty alt and a lazy load', async () => {
    mountScroll();
    observer().trigger(true);
    respondWith(fetchMock.calls[0], makePosts(1));
    await settle();

    const img = list().querySelector('img');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  // Seeding from the post id rather than a random number is what keeps one
  // post pinned to one picture, so both halves are worth holding: distinct
  // per post, and identical for the same post across renders.
  it('seeds each image from the post id', async () => {
    mountScroll();
    observer().trigger(true);
    respondWith(fetchMock.calls[0], makePosts(3));
    await settle();

    const sources = [...list().querySelectorAll('img')].map((img) => img.src);
    expect(sources).toEqual([
      'https://picsum.photos/seed/1/600/400',
      'https://picsum.photos/seed/2/600/400',
      'https://picsum.photos/seed/3/600/400',
    ]);
    expect(new Set(sources).size).toBe(3);
  });

  // The response comes from a third-party API, so it is untrusted input. Note
  // the payloads: a bare <script> would pass even against innerHTML, because
  // the parser marks scripts inserted that way as already-started and never
  // runs them. The handler attributes below are the ones that actually fire,
  // so those are what the assertion has to be built from.
  it('renders post text as text, never as markup', async () => {
    const hostile = [
      {
        id: 1,
        title: '<img src=x onerror="window.__xss = true">',
        body: '<svg onload="window.__xss = true"></svg>',
      },
    ];

    mountScroll();
    observer().trigger(true);
    respondWith(fetchMock.calls[0], hostile);
    await settle();

    const heading = list().querySelector('h2');
    const paragraph = list().querySelector('p');

    // The payload survives intact as text — nothing is stripped or mangled.
    expect(heading.textContent).toBe(hostile[0].title);
    expect(paragraph.textContent).toBe(hostile[0].body);

    // …and none of it became an element.
    expect(heading.children).toHaveLength(0);
    expect(paragraph.children).toHaveLength(0);
    expect(list().querySelectorAll('img')).toHaveLength(1); // the decorative one
    expect(list().querySelector('svg')).toBeNull();
    expect(list().querySelector('[onerror]')).toBeNull();
  });

  it('asks for the next page on the following intersection', async () => {
    mountScroll();

    observer().trigger(true);
    respondWith(fetchMock.calls[0], makePosts(5));
    await settle();

    observer().trigger(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.calls[1].url).toContain('_page=2');

    respondWith(fetchMock.calls[1], makePosts(5, 5));
    await settle();

    expect(items()).toHaveLength(10);
  });

  // The regression this branch exists for. `page` is only incremented once the
  // response is in, so before the guard both calls read page 1 and appended
  // the same five posts twice.
  it('ignores a second intersection while a request is in flight', async () => {
    mountScroll();

    observer().trigger(true);
    observer().trigger(false);
    observer().trigger(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    respondWith(fetchMock.calls[0], makePosts(5));
    await settle();

    expect(items()).toHaveLength(5);
  });

  // The guard above cannot stand alone: dropping that second intersection
  // removes the only event that was still coming, so without the re-observe
  // the feed stalls with its trigger sitting on screen.
  it('re-observes after a load so a still-visible button keeps going', async () => {
    mountScroll();
    const io = observer();
    const observeCountAfterInit = io.observeCount;

    io.redeliverOnObserve = true;
    io.trigger(true);
    respondWith(fetchMock.calls[0], makePosts(5));
    await settle();

    expect(io.observeCount).toBeGreaterThan(observeCountAfterInit);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.calls[1].url).toContain('_page=2');

    respondWith(fetchMock.calls[1], []);
    await settle();

    expect(items()).toHaveLength(5);
    expect(io.disconnected).toBe(true);
  });

  it('stops for good once a page comes back empty', async () => {
    mountScroll();

    observer().trigger(true);
    respondWith(fetchMock.calls[0], []);
    await settle();

    expect(status().textContent).toBe('No more posts.');
    expect(observer().disconnected).toBe(true);
    expect(moreButton().hidden).toBe(true);

    observer().trigger(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// Scrolling is not the only way to reach the next page, and it is not
// available to everyone. The button the observer watches is a real control:
// pressing it loads, and after a failure it is the way back.
describe('initScroll — the button', () => {
  it('loads a page when pressed, with no intersection at all', async () => {
    mountScroll();

    moreButton().click();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.calls[0].url).toContain('_page=1');

    respondWith(fetchMock.calls[0], makePosts(5));
    await settle();

    expect(items()).toHaveLength(5);
  });

  it('marks the list busy and blocks the button while loading', async () => {
    mountScroll();

    moreButton().click();
    expect(list().getAttribute('aria-busy')).toBe('true');
    expect(moreButton().disabled).toBe(true);
    expect(status().textContent).toBe('Loading more posts…');

    respondWith(fetchMock.calls[0], makePosts(5));
    await settle();

    expect(list().getAttribute('aria-busy')).toBe('false');
    expect(moreButton().disabled).toBe(false);
    // The posts speak for themselves, so the region falls silent rather than
    // announcing a count on every scroll.
    expect(status().textContent).toBe('');
  });

  it('comes back after a failed load so the reader can retry', async () => {
    mountScroll();

    moreButton().click();
    fetchMock.calls[0].reject(new TypeError('Failed to fetch'));
    await settle();

    expect(status().textContent).toBe('Could not load more posts.');
    expect(moreButton().disabled).toBe(false);
    expect(moreButton().hidden).toBe(false);

    moreButton().click();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.calls[1].url).toContain('_page=1');

    respondWith(fetchMock.calls[1], makePosts(5));
    await settle();

    expect(items()).toHaveLength(5);
    expect(status().textContent).toBe('');
  });
});

describe('initScroll — failure', () => {
  // The body is deliberately a valid, renderable payload: an error page that
  // happens to parse is exactly what slips past a missing `res.ok` check, and
  // a body that threw on parse would let the catch below cover for it.
  it('reports a non-ok response instead of parsing it', async () => {
    mountScroll();
    const json = vi.fn(async () => makePosts(5));

    observer().trigger(true);
    fetchMock.calls[0].resolve({ ok: false, status: 500, json });
    await settle();

    expect(json).not.toHaveBeenCalled();
    expect(items()).toHaveLength(0);
    expect(status().textContent).toBe('Could not load more posts.');
  });

  it('reports a rejected request rather than throwing past the component', async () => {
    mountScroll();

    observer().trigger(true);
    fetchMock.calls[0].reject(new TypeError('Failed to fetch'));
    await settle();

    expect(status().textContent).toBe('Could not load more posts.');
  });

  it('does not re-observe after a failure, so it cannot spin', async () => {
    mountScroll();
    const io = observer();
    io.redeliverOnObserve = true;
    const observeCountAfterInit = io.observeCount;

    io.trigger(true);
    fetchMock.calls[0].reject(new TypeError('Failed to fetch'));
    await settle();

    expect(io.observeCount).toBe(observeCountAfterInit);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries the same page when the button intersects again', async () => {
    mountScroll();

    observer().trigger(true);
    fetchMock.calls[0].reject(new TypeError('Failed to fetch'));
    await settle();

    observer().trigger(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.calls[1].url).toContain('_page=1');

    respondWith(fetchMock.calls[1], makePosts(5));
    await settle();

    expect(items()).toHaveLength(5);
  });
});

describe('initScroll — cleanup', () => {
  it('aborts the request still in flight and disconnects the observer', async () => {
    mountScroll();
    const io = observer();

    io.trigger(true);
    expect(fetchMock.calls[0].signal.aborted).toBe(false);

    cleanup();
    cleanup = null;
    await settle();

    expect(fetchMock.calls[0].signal.aborted).toBe(true);
    expect(io.disconnected).toBe(true);
  });

  it('treats the aborted request as teardown, not as a failure', async () => {
    mountScroll();

    observer().trigger(true);
    cleanup();
    cleanup = null;
    await settle();

    expect(status().textContent).toBe('Loading more posts…');
    expect(items()).toHaveLength(0);
  });
});
