import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { resetDocument } from '../testUtils.js';
import { initModal } from './Modal.js';

// jsdom 29 ships HTMLDialogElement with nothing on it but `open` — no
// showModal, no close, no top layer. Everything the component hands to the
// platform (Esc, the focus trap, the inert background, focus restoration)
// therefore cannot be asserted here at all; that needs a real browser. The stub
// below stands in for just enough of the API to exercise the wiring that *is*
// ours: which trigger opens which dialog, and what counts as a close.
function stubDialogApi() {
  const proto = window.HTMLDialogElement.prototype;

  proto.showModal = function showModal() {
    if (this.open) throw new DOMException('already open', 'InvalidStateError');
    this.setAttribute('open', '');
  };

  proto.close = function close() {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

function markup({ dialogId = 'site-modal', targetId = dialogId } = {}) {
  return `
    <button type="button" id="trigger" data-open-modal="${targetId}">Open</button>
    <dialog class="modal" id="${dialogId}">
      <div class="modal-panel">
        <button type="button" id="close-x" data-close-modal>
          <span id="close-x-label">X</span>
        </button>
        <p id="body-text">Body</p>
        <a id="link" href="https://example.com">A link in the middle</a>
        <button type="button" id="close-button" data-close-modal>Close</button>
      </div>
    </dialog>`;
}

function mountModal(html) {
  document.body.innerHTML = html;
  return initModal();
}

const trigger = () => document.getElementById('trigger');
const dialog = () => document.querySelector('dialog');
const isOpen = () => dialog().hasAttribute('open');

function open() {
  trigger().click();
  expect(isOpen()).toBe(true);
}

describe('Modal', () => {
  beforeAll(stubDialogApi);
  beforeEach(resetDocument);

  it('leaves triggers outside the given root alone', () => {
    document.body.innerHTML = `<div id="scoped"></div>${markup()}`;
    initModal(document.getElementById('scoped'));

    expect(trigger().dataset.enhanced).toBeUndefined();

    trigger().click();
    expect(isOpen()).toBe(false);
  });

  it('marks the trigger and its dialog as enhanced once it takes over', () => {
    mountModal(markup());

    expect(trigger().dataset.enhanced).toBe('true');
    expect(dialog().dataset.enhanced).toBe('true');
  });

  it('opens the dialog its trigger names', () => {
    mountModal(markup());

    open();
  });

  // Both of these have to count calls rather than watch the dialog: a second
  // showModal() on an open dialog throws, but event dispatch swallows what a
  // listener throws, and a second close() on a closed dialog is a no-op. Either
  // way the `open` attribute ends up looking exactly right.
  it('skips a trigger it has already enhanced', () => {
    mountModal(markup());
    const showModal = vi.spyOn(dialog(), 'showModal');

    initModal(); // a second sweep must not bind a second click handler

    trigger().click();

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(true);
  });

  it('skips a dialog it has already bound', () => {
    document.body.innerHTML = `${markup()}
      <button type="button" id="second-trigger" data-open-modal="site-modal">
        Open again
      </button>`;
    initModal();
    const close = vi.spyOn(dialog(), 'close');

    // A dialog reachable from two triggers is still one dialog, so its own
    // close handler must be bound once.
    trigger().click();
    document.getElementById('close-button').click();

    expect(close).toHaveBeenCalledTimes(1);
    expect(isOpen()).toBe(false);
  });

  it('ignores a trigger naming a dialog that is not there', () => {
    mountModal(markup({ dialogId: 'site-modal', targetId: 'nowhere' }));

    expect(trigger().dataset.enhanced).toBeUndefined();

    trigger().click();
    expect(isOpen()).toBe(false);
  });

  // Nothing in Baseline lacks showModal any more, but a browser that did would
  // otherwise throw on every click of a button that can never work. Leaving the
  // trigger unenhanced is the honest end state.
  it('ignores a trigger whose dialog cannot be opened modally', () => {
    document.body.innerHTML = markup();
    dialog().showModal = undefined;

    initModal();

    expect(trigger().dataset.enhanced).toBeUndefined();
    expect(() => trigger().click()).not.toThrow();
    expect(isOpen()).toBe(false);
  });

  it('closes on a click on any element marked data-close-modal', () => {
    mountModal(markup());
    open();

    document.getElementById('close-button').click();

    expect(isOpen()).toBe(false);
  });

  it('closes on a click landing inside a close button', () => {
    mountModal(markup());
    open();

    document.getElementById('close-x-label').click();

    expect(isOpen()).toBe(false);
  });

  // A click on ::backdrop reports the dialog itself as the target. The panel
  // covers the dialog box exactly — the dialog carries no padding of its own —
  // so this can only mean a click outside the panel.
  it('closes on a click reported against the dialog itself', () => {
    mountModal(markup());
    open();

    dialog().click();

    expect(isOpen()).toBe(false);
  });

  it('stays open on a click inside the panel', () => {
    mountModal(markup());
    open();

    document.getElementById('body-text').click();
    document.querySelector('.modal-panel').click();

    expect(isOpen()).toBe(true);
  });

  // The Tab cycle is the one piece of focus handling the component owns, so
  // unlike Esc or the inert background it can be asserted here. jsdom does not
  // move focus on Tab by itself, which is exactly the point: these check that
  // the component intervenes at the two ends and stays out of the way between.
  describe('Tab cycle', () => {
    const press = (key, { shiftKey = false } = {}) => {
      const event = new KeyboardEvent('keydown', {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement.dispatchEvent(event);
      return event;
    };

    const first = () => document.getElementById('close-x');
    const last = () => document.getElementById('close-button');

    it('sends Tab on the last element back to the first', () => {
      mountModal(markup());
      open();
      last().focus();

      const event = press('Tab');

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first());
    });

    it('sends Shift+Tab on the first element to the last', () => {
      mountModal(markup());
      open();
      first().focus();

      const event = press('Tab', { shiftKey: true });

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last());
    });

    it('leaves Tab in the middle of the dialog to the browser', () => {
      mountModal(markup());
      open();
      document.getElementById('link').focus();

      const event = press('Tab');

      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(document.getElementById('link'));
    });

    it('leaves keys other than Tab alone', () => {
      mountModal(markup());
      open();
      last().focus();

      const event = press('ArrowDown');

      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(last());
    });

    // With one button in the dialog, first and last are the same element and
    // both branches focus it again. A dialog this small is a real shape — an
    // alert with nothing but an acknowledgement — and Esc still leaves it, so
    // pinning focus here is not the keyboard trap WCAG 2.1.2 forbids.
    it('keeps focus put when the dialog holds one focusable element', () => {
      document.body.innerHTML = `
        <button type="button" id="trigger" data-open-modal="site-modal">Open</button>
        <dialog class="modal" id="site-modal">
          <div class="modal-panel">
            <button type="button" id="only" data-close-modal>X</button>
            <p>Nothing else to tab to.</p>
          </div>
        </dialog>`;
      initModal();
      open();

      const only = document.getElementById('only');
      only.focus();

      expect(press('Tab').defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(only);

      expect(press('Tab', { shiftKey: true }).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(only);
    });

    // The version this replaced pinned the first and last element by id at
    // init, so anything added to the dialog afterwards fell outside the cycle.
    it('picks up elements added to the dialog after init', () => {
      mountModal(markup());
      open();

      // Cycle once before adding anything, so a list captured at init *or* at
      // the first keypress is already fixed by the time the button arrives.
      last().focus();
      press('Tab');

      const added = document.createElement('button');
      added.id = 'added';
      added.textContent = 'Added later';
      document.querySelector('.modal-panel').append(added);

      added.focus();
      const event = press('Tab');

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first());
    });
  });

  it('stops responding once the returned cleanup runs', () => {
    const cleanup = mountModal(markup());
    open();

    cleanup();
    document.getElementById('close-button').click();

    expect(isOpen()).toBe(true);
  });
});
