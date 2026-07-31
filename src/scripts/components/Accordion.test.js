import { describe, it, expect, beforeEach } from 'vitest';
import { resetDocument } from '../testUtils.js';
import { initAccordion } from './Accordion.js';

// jsdom has no layout engine, so nothing here can check that a panel is
// actually the right height — the collapse itself is CSS (grid-template-rows).
// The assertions cover what the component does write: the ARIA state and the
// `inert` attribute that keeps a closed panel out of the tab order.

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
              <span class="accordion-label">Section ${index + 1}</span>
              <span class="icon" aria-hidden="true"></span>
            </button>
          </h2>
          <div
            class="accordion-content"
            id="accordion-content-${index + 1}"
            role="region"
            aria-labelledby="accordion-button-${index + 1}"
          >
            <div class="accordion-panel">
              <p>Panel ${index + 1}</p>
            </div>
          </div>
        </div>`
    )
    .join('');

  return `<div class="accordion">${items}</div>`;
}

// The component exports an init, so a test is a render plus a call — no module
// cache to reset and no DOMContentLoaded to fake.
function mountAccordion(html) {
  document.body.innerHTML = html;
  return initAccordion();
}

const accordion = () => document.querySelector('.accordion');
const button = (n) => document.getElementById(`accordion-button-${n}`);
const panel = (n) => document.getElementById(`accordion-content-${n}`);
const isExpanded = (n) => button(n).getAttribute('aria-expanded') === 'true';
const isInert = (n) => panel(n).hasAttribute('inert');

// Every open button must have a reachable panel, and every closed one an inert
// panel — the pairing is the whole contract between button and panel. A closed
// panel that is merely styled shut still hands its links to the Tab key.
function stateOf(n) {
  expect(isExpanded(n)).toBe(!isInert(n));
  expect(panel(n).dataset.expanded).toBe(String(isExpanded(n)));
  return isExpanded(n);
}

describe('Accordion', () => {
  beforeEach(resetDocument);

  it('leaves accordions outside the given root alone', () => {
    document.body.innerHTML = `<div id="scoped"></div>${markup([true, false])}`;
    initAccordion(document.getElementById('scoped'));

    // Untouched markup has to stand on its own: nothing may be made inert, or
    // the panels would be unreachable with no script to open them.
    expect(accordion().dataset.enhanced).toBeUndefined();
    expect([1, 2].some(isInert)).toBe(false);

    button(2).click();
    expect(isExpanded(2)).toBe(false);
  });

  it('skips an accordion it has already enhanced', () => {
    mountAccordion(markup([true, false, false]));
    initAccordion(); // a second sweep must not bind a second click handler

    button(2).click();

    expect(stateOf(2)).toBe(true);
  });

  it('stops responding once the returned cleanup runs', () => {
    const cleanup = mountAccordion(markup([true, false, false]));

    cleanup();
    button(2).click();

    expect(stateOf(1)).toBe(true);
    expect(stateOf(2)).toBe(false);
  });

  it('marks the accordion as enhanced once it takes over', () => {
    mountAccordion(markup([true, false, false]));

    expect(accordion().dataset.enhanced).toBe('true');
  });

  it('keeps only the first pre-expanded section open on init', () => {
    mountAccordion(markup([true, true, true]));

    expect(stateOf(1)).toBe(true);
    expect(stateOf(2)).toBe(false);
    expect(stateOf(3)).toBe(false);
  });

  it('leaves every section closed when the markup opens none', () => {
    mountAccordion(markup([false, false, false]));

    expect(stateOf(1)).toBe(false);
    expect(stateOf(2)).toBe(false);
    expect(stateOf(3)).toBe(false);
  });

  it('expands a closed section when its button is clicked', () => {
    mountAccordion(markup([false, false, false]));

    button(2).click();

    expect(stateOf(2)).toBe(true);
  });

  it('collapses the open section when its own button is clicked again', () => {
    mountAccordion(markup([true, false, false]));

    button(1).click();

    expect(stateOf(1)).toBe(false);
  });

  it('closes the open section when another one is opened', () => {
    mountAccordion(markup([true, false, false]));

    button(3).click();

    expect(stateOf(1)).toBe(false);
    expect(stateOf(2)).toBe(false);
    expect(stateOf(3)).toBe(true);
  });

  it('reacts to clicks landing on elements inside the button', () => {
    mountAccordion(markup([false, false, false]));

    button(2).querySelector('.accordion-label').click();

    expect(stateOf(2)).toBe(true);
  });

  it('ignores clicks that miss a button', () => {
    mountAccordion(markup([true, false, false]));

    panel(1).querySelector('p').click();

    expect(stateOf(1)).toBe(true);
    expect(stateOf(2)).toBe(false);
  });

  it('drives each panel through the aria-controls link, not document order', () => {
    mountAccordion(markup([false, false]));

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

  it('runs independently for each accordion on the page', () => {
    mountAccordion(
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
          <div class="accordion-content" id="other-content">
            <div class="accordion-panel"><p>Other panel</p></div>
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
