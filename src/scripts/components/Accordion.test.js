import { describe, it, expect, beforeEach, vi } from 'vitest';

// Accordion.js has no exports: it subscribes to DOMContentLoaded at import time.
// So each test resets the module registry, re-imports the file against a fresh
// fixture, and fires the event by hand.
//
// jsdom has no layout engine, so panel.scrollHeight is always 0 and the
// max-height the component writes carries no information. The assertions below
// therefore cover the ARIA state, which is what actually drives the UI.

function markup(expandedFlags) {
  const items = expandedFlags
    .map(
      (expanded, index) => `
        <div class="accordion-item">
          <h2>
            <button
              type="button"
              id="accordion-button-${index + 1}"
              aria-expanded="${expanded}"
              aria-controls="accordion-content-${index + 1}"
            >
              <span class="accordion-title">Section ${index + 1}</span>
              <span class="icon" aria-hidden="true"></span>
            </button>
          </h2>
          <div
            class="accordion-content"
            id="accordion-content-${index + 1}"
            role="region"
            aria-labelledby="accordion-button-${index + 1}"
            aria-hidden="${!expanded}"
          >
            <p>Panel ${index + 1}</p>
          </div>
        </div>`
    )
    .join('');

  return `<div class="accordion" aria-labelledby="accordion-title">${items}</div>`;
}

async function mount(html, { marker = true } = {}) {
  if (marker) document.body.dataset.component = 'accordion';
  document.body.innerHTML = html;

  // Capture the DOMContentLoaded callback instead of dispatching the event:
  // vi.resetModules() clears the module cache but not the listeners already
  // registered on document, so dispatching would also re-run every previous
  // test's copy of the component against the current DOM.
  let ready;
  const subscribe = vi
    .spyOn(document, 'addEventListener')
    .mockImplementation((type, handler) => {
      if (type === 'DOMContentLoaded') ready = handler;
    });

  vi.resetModules();
  await import('./Accordion.js');
  subscribe.mockRestore();

  ready();
}

const accordion = () => document.querySelector('.accordion');
const button = (n) => document.getElementById(`accordion-button-${n}`);
const panel = (n) => document.getElementById(`accordion-content-${n}`);
const isExpanded = (n) => button(n).getAttribute('aria-expanded') === 'true';
const isHidden = (n) => panel(n).getAttribute('aria-hidden') === 'true';

// Every open button must have a visible panel, and every closed one a hidden
// panel — the pairing is the whole contract between button and panel.
function stateOf(n) {
  expect(isExpanded(n)).toBe(!isHidden(n));
  return isExpanded(n);
}

describe('Accordion', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete document.body.dataset.component;
  });

  it('does nothing on pages that lack the accordion marker', async () => {
    await mount(markup([true, false, false]), { marker: false });

    expect(accordion().dataset.enhanced).toBeUndefined();

    button(2).click();
    expect(stateOf(2)).toBe(false);
  });

  it('marks the accordion as enhanced once it takes over', async () => {
    await mount(markup([true, false, false]));

    expect(accordion().dataset.enhanced).toBe('true');
  });

  it('keeps only the first pre-expanded section open on init', async () => {
    await mount(markup([true, true, true]));

    expect(stateOf(1)).toBe(true);
    expect(stateOf(2)).toBe(false);
    expect(stateOf(3)).toBe(false);
  });

  it('leaves every section closed when the markup opens none', async () => {
    await mount(markup([false, false, false]));

    expect(stateOf(1)).toBe(false);
    expect(stateOf(2)).toBe(false);
    expect(stateOf(3)).toBe(false);
  });

  it('expands a closed section when its button is clicked', async () => {
    await mount(markup([false, false, false]));

    button(2).click();

    expect(stateOf(2)).toBe(true);
  });

  it('collapses the open section when its own button is clicked again', async () => {
    await mount(markup([true, false, false]));

    button(1).click();

    expect(stateOf(1)).toBe(false);
  });

  it('closes the open section when another one is opened', async () => {
    await mount(markup([true, false, false]));

    button(3).click();

    expect(stateOf(1)).toBe(false);
    expect(stateOf(2)).toBe(false);
    expect(stateOf(3)).toBe(true);
  });

  it('reacts to clicks landing on elements inside the button', async () => {
    await mount(markup([false, false, false]));

    button(2).querySelector('.accordion-title').click();

    expect(stateOf(2)).toBe(true);
  });

  it('ignores clicks that miss a button', async () => {
    await mount(markup([true, false, false]));

    panel(1).querySelector('p').click();

    expect(stateOf(1)).toBe(true);
    expect(stateOf(2)).toBe(false);
  });

  it('drives each panel through the aria-controls link, not document order', async () => {
    await mount(markup([false, false]));

    // Move each panel under the other button's item. The buttons stay put, so
    // only the id wiring can still tell which panel belongs to which button.
    const [first, second] = [panel(1), panel(2)];
    const [firstItem, secondItem] = [first.parentElement, second.parentElement];
    firstItem.append(second);
    secondItem.append(first);

    button(1).click();

    expect(stateOf(1)).toBe(true);
    expect(stateOf(2)).toBe(false);
  });

  it('runs independently for each accordion on the page', async () => {
    await mount(
      `${markup([true, false])}<div class="accordion">
        <div class="accordion-item">
          <h2>
            <button
              type="button"
              id="other-button"
              aria-expanded="false"
              aria-controls="other-content"
            >
              Other
            </button>
          </h2>
          <div class="accordion-content" id="other-content" aria-hidden="true">
            <p>Other panel</p>
          </div>
        </div>
      </div>`
    );

    document.getElementById('other-button').click();

    expect(
      document.getElementById('other-button').getAttribute('aria-expanded')
    ).toBe('true');
    expect(stateOf(1)).toBe(true);
  });
});
