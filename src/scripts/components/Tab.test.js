import { describe, it, expect, beforeEach } from 'vitest';
import { mount, resetDocument } from '../testUtils.js';

// Several cases here guard the fixes in a860838: unhandled keys used to fall
// through to the first tab, the initial selection used to steal focus on page
// load, and a key pressed outside the tablist used to select the first tab.

const LABELS = ['Ipsum', 'consectetur', 'Earum'];

function markup(labels = LABELS) {
  const buttons = labels
    .map(
      (label, index) => `
        <button
          id="tab-${index + 1}"
          role="tab"
          aria-selected="${index === 0}"
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
          class="${index === 0 ? 'current' : ''}"
        >
          <h2>${label}</h2>
        </div>`
    )
    .join('');

  return `
    <button id="outside">outside the tablist</button>
    <div class="tab">
      <nav aria-label="Tabs" role="tablist">${buttons}</nav>
      <div class="tab-panels">${panels}</div>
    </div>`;
}

const mountTab = (html = markup()) =>
  mount(() => import('./Tab.js'), html, { component: 'tab' });

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

  it('does nothing on pages that lack the tab marker', async () => {
    await mount(() => import('./Tab.js'), markup());

    tab(2).click();

    // no roving tabindex at all: the component never took over
    expect(tab(1).getAttribute('tabindex')).toBeNull();
    expect(tab(1).getAttribute('aria-selected')).toBe('true');
    expect(tab(2).getAttribute('aria-selected')).toBe('false');
    expect(panel(1).classList.contains('current')).toBe(true);
  });

  it('selects the first tab on load', async () => {
    await mountTab();

    expect(selected()).toBe(1);
  });

  it('does not pull focus to the tablist on load', async () => {
    await mountTab();

    expect(document.activeElement).toBe(document.body);
  });

  it('selects the clicked tab and moves focus to it', async () => {
    await mountTab();

    tab(3).click();

    expect(selected()).toBe(3);
    expect(document.activeElement).toBe(tab(3));
  });

  it('ignores clicks that miss a tab', async () => {
    await mountTab();

    tabList().click();

    expect(selected()).toBe(1);
  });

  it('moves to the next tab on ArrowRight', async () => {
    await mountTab();
    tab(1).focus();

    press('ArrowRight');

    expect(selected()).toBe(2);
    expect(document.activeElement).toBe(tab(2));
  });

  it('wraps to the first tab when ArrowRight passes the last', async () => {
    await mountTab();
    tab(3).focus();

    press('ArrowRight');

    expect(selected()).toBe(1);
  });

  it('moves to the previous tab on ArrowLeft', async () => {
    await mountTab();
    tab(3).focus();

    press('ArrowLeft');

    expect(selected()).toBe(2);
  });

  it('wraps to the last tab when ArrowLeft passes the first', async () => {
    await mountTab();
    tab(1).focus();

    press('ArrowLeft');

    expect(selected()).toBe(3);
  });

  it('jumps to the first tab on Home and the last on End', async () => {
    await mountTab();
    tab(2).focus();

    press('End');
    expect(selected()).toBe(3);

    press('Home');
    expect(selected()).toBe(1);
  });

  it('cancels the default action for keys it handles', async () => {
    await mountTab();
    tab(1).focus();

    expect(press('ArrowRight').defaultPrevented).toBe(true);
  });

  it('leaves the selection alone for keys it does not handle', async () => {
    await mountTab();
    // select a tab other than the first, so a fall-through to index 0 shows up
    tab(2).click();

    ['Tab', 'Escape', 'Enter', 'a', ' ', 'ArrowDown'].forEach((key) => {
      const event = press(key);

      expect(selected()).toBe(2);
      expect(event.defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(tab(2));
    });
  });

  it('ignores keys pressed while focus sits outside the tabs', async () => {
    await mountTab();
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
});
