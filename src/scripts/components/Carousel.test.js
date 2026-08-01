import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resetDocument } from '../testUtils.js';
import { initCarousel } from './Carousel.js';

// jsdom has no layout, so the translateX the component writes is only ever an
// inline style here — nothing checks that a slide actually moved. What is
// assertable is the state the component owns: which slide is inert, which dot
// is current, what the status region says, and whether the timer is running.
//
// Two jsdom gaps are papered over below. `window.matchMedia` does not exist at
// all, so every test installs one; `inert` is not implemented either, but the
// component only ever sets and removes the attribute, which works regardless.

const AUTOPLAY_INTERVAL = 5000;

function stubMatchMedia(reduceMotion = false) {
  window.matchMedia = (query) => ({
    media: query,
    matches: reduceMotion && query === '(prefers-reduced-motion: reduce)',
  });
}

function setTabHidden(hidden) {
  Object.defineProperty(document, 'hidden', {
    value: hidden,
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

function markup(count = 3) {
  const slides = Array.from(
    { length: count },
    (_, index) => `
      <div
        class="crs-slide"
        role="group"
        aria-roledescription="slide"
        aria-label="${index + 1} of ${count}"
      >
        <img src="slide-${index + 1}.jpg" alt="" width="1200" height="800" />
        <div class="crs-caption">
          <h2>Slide ${index + 1}</h2>
          <p>Body ${index + 1}</p>
        </div>
      </div>`
  ).join('');

  return `
    <div class="crs">
      <p class="crs-status" role="status" aria-live="polite"></p>
      <div class="crs-slides">${slides}</div>
      <button class="crs-prev-btn" type="button" aria-label="Previous slide"></button>
      <button class="crs-next-btn" type="button" aria-label="Next slide"></button>
      <button class="crs-autoplay-btn" type="button">Pause</button>
      <div class="crs-dots" role="group" aria-label="Slide navigation"></div>
    </div>`;
}

function mountCarousel(html = markup()) {
  document.body.innerHTML = html;
  return initCarousel();
}

const carousel = () => document.querySelector('.crs');
const track = () => document.querySelector('.crs-slides');
const slides = () => [...document.querySelectorAll('.crs-slide')];
const dots = () => [...document.querySelectorAll('.crs-dot')];
const statusEl = () => document.querySelector('.crs-status');
const autoPlayButton = () => document.querySelector('.crs-autoplay-btn');
const prevButton = () => document.querySelector('.crs-prev-btn');
const nextButton = () => document.querySelector('.crs-next-btn');

const indicesWhere = (elements, predicate) =>
  elements.reduce(
    (found, el, index) => (predicate(el) ? [...found, index] : found),
    []
  );

// Exactly one slide is reachable, its dot is the current one, and the track and
// the status text agree with both. Those four writes are one selection, so a
// test that checks any of them alone would miss the ones that drifted.
function currentIndex() {
  const reachable = indicesWhere(slides(), (s) => !s.hasAttribute('inert'));
  const current = indicesWhere(
    dots(),
    (d) => d.getAttribute('aria-current') === 'true'
  );

  expect(reachable).toHaveLength(1);
  expect(current).toEqual(reachable);
  expect(track().style.transform).toBe(`translateX(-${reachable[0] * 100}%)`);
  expect(statusEl().textContent).toBe(
    `Slide ${reachable[0] + 1} of ${slides().length}`
  );

  return reachable[0];
}

describe('Carousel', () => {
  beforeEach(() => {
    resetDocument();
    stubMatchMedia(false);
    setTabHidden(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.matchMedia;
  });

  describe('enhancement', () => {
    it('leaves carousels outside the given root alone', () => {
      document.body.innerHTML = `<div id="scoped"></div>${markup()}`;
      initCarousel(document.getElementById('scoped'));

      // Untouched markup has to stand on its own: nothing may be made inert,
      // or the slides would be unreachable with no script to move them.
      expect(carousel().dataset.enhanced).toBeUndefined();
      expect(slides().some((s) => s.hasAttribute('inert'))).toBe(false);
      expect(dots()).toHaveLength(0);
    });

    it('marks the carousel as enhanced once it takes over', () => {
      mountCarousel();

      expect(carousel().dataset.enhanced).toBe('true');
    });

    it('injects one dot per slide found in the markup', () => {
      mountCarousel(markup(5));

      expect(dots()).toHaveLength(5);
      expect(dots()[2].getAttribute('aria-label')).toBe('Go to slide 3');
    });

    it('starts on the first slide', () => {
      mountCarousel();

      expect(currentIndex()).toBe(0);
    });

    it('skips a carousel it has already enhanced', () => {
      mountCarousel();
      initCarousel(); // a second sweep must not bind a second click handler

      nextButton().click();

      expect(dots()).toHaveLength(3);
      expect(currentIndex()).toBe(1);
    });

    it('does nothing for a carousel with no slides', () => {
      document.body.innerHTML = `<div class="crs"><div class="crs-slides"></div></div>`;
      initCarousel();

      expect(carousel().dataset.enhanced).toBeUndefined();
    });
  });

  describe('navigation', () => {
    it('advances one slide on next', () => {
      mountCarousel();

      nextButton().click();

      expect(currentIndex()).toBe(1);
    });

    it('wraps from the last slide back to the first', () => {
      mountCarousel();

      nextButton().click();
      nextButton().click();
      nextButton().click();

      expect(currentIndex()).toBe(0);
    });

    it('wraps backwards from the first slide to the last', () => {
      mountCarousel();

      prevButton().click();

      expect(currentIndex()).toBe(2);
    });

    it('jumps to the slide its dot names', () => {
      mountCarousel(markup(5));

      dots()[3].click();

      expect(currentIndex()).toBe(3);
    });

    it('ignores clicks that miss a control', () => {
      mountCarousel();

      slides()[0].querySelector('h2').click();

      expect(currentIndex()).toBe(0);
    });
  });

  describe('autoplay', () => {
    it('rotates on its own once the interval elapses', () => {
      mountCarousel();

      vi.advanceTimersByTime(AUTOPLAY_INTERVAL);

      expect(currentIndex()).toBe(1);
    });

    it('stops rotating and relabels itself when paused', () => {
      mountCarousel();

      autoPlayButton().click();
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 3);

      expect(autoPlayButton().textContent).toBe('Play');
      expect(currentIndex()).toBe(0);
    });

    it('resumes rotating when play is pressed again', () => {
      mountCarousel();

      autoPlayButton().click();
      autoPlayButton().click();
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL);

      expect(autoPlayButton().textContent).toBe('Pause');
      expect(currentIndex()).toBe(1);
    });

    it('starts paused when the user asked for reduced motion', () => {
      stubMatchMedia(true);
      mountCarousel();

      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 2);

      expect(autoPlayButton().textContent).toBe('Play');
      expect(currentIndex()).toBe(0);
    });

    it('restarts the countdown when the user navigates by hand', () => {
      mountCarousel();

      vi.advanceTimersByTime(AUTOPLAY_INTERVAL - 500);
      nextButton().click();
      // The 500ms left on the old countdown must not carry over, or the slide
      // just chosen would be swept away half a second after the click.
      vi.advanceTimersByTime(500);

      expect(currentIndex()).toBe(1);
    });
  });

  describe('suspending rotation without changing the intent', () => {
    it('holds while the pointer is over the carousel and resumes after', () => {
      mountCarousel();

      carousel().dispatchEvent(new Event('mouseenter'));
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 2);

      expect(currentIndex()).toBe(0);
      // The button still reads Pause: hovering suspends the rotation, it does
      // not revoke the request to rotate.
      expect(autoPlayButton().textContent).toBe('Pause');

      carousel().dispatchEvent(new Event('mouseleave'));
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL);

      expect(currentIndex()).toBe(1);
    });

    it('holds while focus is inside the carousel and resumes after', () => {
      mountCarousel();

      carousel().dispatchEvent(new Event('focusin'));
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 2);

      expect(currentIndex()).toBe(0);

      carousel().dispatchEvent(new Event('focusout'));
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL);

      expect(currentIndex()).toBe(1);
    });

    it('holds while the tab is in the background', () => {
      mountCarousel();

      setTabHidden(true);
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 3);

      expect(currentIndex()).toBe(0);

      setTabHidden(false);
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL);

      expect(currentIndex()).toBe(1);
    });

    it('keeps an explicit pause across a hover that would otherwise resume', () => {
      mountCarousel();

      autoPlayButton().click();
      carousel().dispatchEvent(new Event('mouseenter'));
      carousel().dispatchEvent(new Event('mouseleave'));
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 2);

      expect(autoPlayButton().textContent).toBe('Play');
      expect(currentIndex()).toBe(0);
    });
  });

  describe('announcements', () => {
    it('stays silent while the carousel rotates on its own', () => {
      mountCarousel();

      // The status text is still written, so a screen reader that lands on the
      // region reads the right slide — it is just not announced unprompted.
      expect(statusEl().getAttribute('aria-live')).toBe('off');
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL);
      expect(statusEl().textContent).toBe('Slide 2 of 3');
    });

    it('announces once rotation has stopped', () => {
      mountCarousel();

      autoPlayButton().click();
      nextButton().click();

      expect(statusEl().getAttribute('aria-live')).toBe('polite');
      expect(statusEl().textContent).toBe('Slide 2 of 3');
    });

    it('announces while rotation is merely suspended by hover', () => {
      mountCarousel();

      carousel().dispatchEvent(new Event('mouseenter'));
      nextButton().click();

      expect(statusEl().getAttribute('aria-live')).toBe('polite');
    });
  });

  describe('cleanup', () => {
    it('stops responding to clicks once the returned cleanup runs', () => {
      const cleanup = mountCarousel();

      cleanup();
      nextButton().click();

      expect(currentIndex()).toBe(0);
    });

    it('stops the autoplay timer once the returned cleanup runs', () => {
      const cleanup = mountCarousel();

      cleanup();
      vi.advanceTimersByTime(AUTOPLAY_INTERVAL * 5);

      // This is the reason the component has a cleanup handle at all: an
      // aborted listener leaks nothing, but a live setInterval keeps mutating
      // a detached carousel forever.
      expect(vi.getTimerCount()).toBe(0);
      expect(currentIndex()).toBe(0);
    });
  });

  it('runs independently for each carousel on the page', () => {
    mountCarousel(`${markup(3)}${markup(4)}`);

    const [first, second] = [...document.querySelectorAll('.crs')];
    second.querySelector('.crs-next-btn').click();

    expect(first.querySelectorAll('.crs-dot')).toHaveLength(3);
    expect(second.querySelectorAll('.crs-dot')).toHaveLength(4);
    expect(first.querySelector('.crs-slide').hasAttribute('inert')).toBe(false);
    expect(second.querySelector('.crs-slide').hasAttribute('inert')).toBe(true);
  });
});
