import { describe, it, expect, beforeEach } from 'vitest';
import { resetDocument } from '../testUtils.js';
import { initTab } from './Tab.js';

// Several cases here guard the fixes in a860838: unhandled keys used to fall
// through to the first tab, the initial selection used to steal focus on page
// load, and a key pressed outside the tablist used to select the first tab.

const LABELS = ['Ipsum', 'consectetur', 'Earum'];

function markup(labels = LABELS, selectedIndex = 0) {
  const buttons = labels
    .map(
      (label, index) => `
        <button
          id="tab-${index + 1}"
          role="tab"
          aria-selected="${index === selectedIndex}"
          aria-controls="panel-${index + 1}"
        >${label}</button>`
    )
    .join('');

  const panels = labels
    .map(
      (label, index) => `
        <div
          id="panel-${index + 1}"
          role="tabpanel"
          tabindex="0"
          aria-labelledby="tab-${index + 1}"
          class="${index === selectedIndex ? 'current' : ''}"
        >
          <h2>${label}</h2>
        </div>`
    )
    .join('');

  return `
    <button id="outside">outside the tablist</button>
    <div class="tab">
      <div aria-label="Tabs" role="tablist">${buttons}</div>
      <div class="tab-panels">${panels}</div>
    </div>`;
}

// The component exports an init, so a test is a render plus a call — no module
// cache to reset and no DOMContentLoaded to fake.
function mountTab(html = markup()) {
  document.body.innerHTML = html;
  return initTab();
}

const widget = () => document.querySelector('.tab');
const tabList = () => document.querySelector('[role="tablist"]');
const tab = (n) => document.getElementById(`tab-${n}`);
const panel = (n) => document.getElementById(`panel-${n}`);

// aria-selected, the roving tabindex and the visible panel all describe the
// same selection, so read them as one value and fail if they disagree.
function selected() {
  const flags = [1, 2, 3].map((n) => {
    const isSelected = tab(n).getAttribute('aria-selected') === 'true';
    expect(tab(n).getAttribute('tabindex')).toBe(isSelected ? '0' : '-1');
    expect(panel(n).classList.contains('current')).toBe(isSelected);
    return isSelected;
  });

  expect(flags.filter(Boolean)).toHaveLength(1);
  return flags.indexOf(true) + 1;
}

function press(key, from = document.activeElement) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  });
  from.dispatchEvent(event);
  return event;
}

describe('Tab', () => {
  beforeEach(resetDocument);

  it('leaves tab widgets outside the given root alone', () => {
    document.body.innerHTML = `<div id="scoped"></div>${markup()}`;
    initTab(document.getElementById('scoped'));

    // Untouched markup has to stand on its own: without the marker the panels
    // stay visible, so nothing is hidden with no script to bring it back.
    expect(widget().dataset.enhanced).toBeUndefined();
    expect(tab(1).getAttribute('tabindex')).toBeNull();

    tab(2).click();
    expect(tab(2).getAttribute('aria-selected')).toBe('false');
  });

  it('marks the widget as enhanced once it takes over', () => {
    mountTab();

    expect(widget().dataset.enhanced).toBe('true');
  });

  it('skips a widget it has already enhanced', () => {
    mountTab();
    initTab(); // a second sweep must not bind a second set of handlers

    tab(2).click();

    expect(selected()).toBe(2);
  });

  it('stops responding once the returned cleanup runs', () => {
    const cleanup = mountTab();

    cleanup();
    tab(2).click();

    expect(selected()).toBe(1);
  });

  it('selects the tab the markup marks as selected', () => {
    mountTab(markup(LABELS, 1));

    expect(selected()).toBe(2);
  });

  it('falls back to the first tab when the markup selects none', () => {
    mountTab(markup(LABELS, -1));

    expect(selected()).toBe(1);
  });

  it('does not pull focus to the tablist on load', () => {
    mountTab();

    expect(document.activeElement).toBe(document.body);
  });

  it('selects the clicked tab and moves focus to it', () => {
    mountTab();

    tab(3).click();

    expect(selected()).toBe(3);
    expect(document.activeElement).toBe(tab(3));
  });

  it('ignores clicks that miss a tab', () => {
    mountTab();

    tabList().click();

    expect(selected()).toBe(1);
  });

  it('ignores a button inside the tablist that is not a tab', () => {
    mountTab();
    // a stray control must not blank the whole widget by matching no tab
    tabList().insertAdjacentHTML('beforeend', '<button id="stray">x</button>');

    document.getElementById('stray').click();

    expect(selected()).toBe(1);
  });

  it('moves to the next tab on ArrowRight', () => {
    mountTab();
    tab(1).focus();

    press('ArrowRight');

    expect(selected()).toBe(2);
    expect(document.activeElement).toBe(tab(2));
  });

  it('wraps to the first tab when ArrowRight passes the last', () => {
    mountTab();
    tab(3).focus();

    press('ArrowRight');

    expect(selected()).toBe(1);
  });

  it('moves to the previous tab on ArrowLeft', () => {
    mountTab();
    tab(3).focus();

    press('ArrowLeft');

    expect(selected()).toBe(2);
  });

  it('wraps to the last tab when ArrowLeft passes the first', () => {
    mountTab();
    tab(1).focus();

    press('ArrowLeft');

    expect(selected()).toBe(3);
  });

  it('jumps to the first tab on Home and the last on End', () => {
    mountTab();
    tab(2).focus();

    press('End');
    expect(selected()).toBe(3);

    press('Home');
    expect(selected()).toBe(1);
  });

  it('cancels the default action for keys it handles', () => {
    mountTab();
    tab(1).focus();

    expect(press('ArrowRight').defaultPrevented).toBe(true);
  });

  it('leaves the selection alone for keys it does not handle', () => {
    mountTab();
    // select a tab other than the first, so a fall-through to index 0 shows up
    tab(2).click();

    ['Tab', 'Escape', 'Enter', 'a', ' ', 'ArrowDown'].forEach((key) => {
      const event = press(key);

      expect(selected()).toBe(2);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(tab(2));
    });
  });

  it('ignores keys pressed while focus sits outside the tabs', () => {
    mountTab();
    // move off the first tab first, otherwise a fall-through to index 0 would
    // land on the tab that is already selected and look like correct behaviour
    tab(2).click();
    const outside = document.getElementById('outside');
    outside.focus();

    press('ArrowRight', tabList());
    press('Home', tabList());

    expect(selected()).toBe(2);
    expect(document.activeElement).toBe(outside);
  });

  it('drives each panel through aria-controls, not document order', () => {
    mountTab();

    // Swap two panels in the DOM. The tabs stay put, so only the id wiring can
    // still tell which panel belongs to which tab.
    const [second, third] = [panel(2), panel(3)];
    third.after(second);

    tab(2).click();

    expect(selected()).toBe(2);
  });

  it('runs each widget on the page independently', () => {
    document.body.innerHTML = `${markup()}
      <div class="tab">
        <div aria-label="More" role="tablist">
          <button id="other-tab" role="tab" aria-selected="false"
            aria-controls="other-panel">Other</button>
        </div>
        <div class="tab-panels">
          <div id="other-panel" role="tabpanel" aria-labelledby="other-tab">
            <h2>Other</h2>
          </div>
        </div>
      </div>`;
    initTab();

    document.getElementById('other-tab').click();

    // the second widget selecting its own tab must not deselect the first
    expect(
      document.getElementById('other-tab').getAttribute('aria-selected')
    ).toBe('true');
    expect(selected()).toBe(1);
  });
});
