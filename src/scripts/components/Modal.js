// A native <dialog> opened with showModal() already does the parts that are
// easy to get wrong by hand: Esc closes it, the rest of the page goes inert,
// focus returns to whatever opened it, and it paints in the top layer so no
// z-index can cover it. What is left here is the wiring the platform does not
// provide — which trigger opens which dialog, the click-outside-to-close that
// `closedby="any"` will eventually cover, and the Tab cycle below.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// showModal() stops one step short of what the APG dialog pattern asks for. It
// makes the rest of the page inert, so focus can never reach the content
// behind — but the browser's own toolbar still sits between the last element
// in the dialog and the first, and Tab walks through it. Audits test for the
// cycle staying inside the dialog, and every focus-trap library implements it,
// so it is scripted here. Only the Tab route is affected: F6 and Ctrl/Cmd+L
// still reach the browser chrome.
//
// The list is read on each keypress rather than at init, so anything added to
// the dialog later takes part in the cycle on its own.
function trapTab(dialogEl, event) {
  if (event.key !== 'Tab') return;

  const focusable = [...dialogEl.querySelectorAll(FOCUSABLE)];
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  // Anywhere but the two ends, the browser already moves focus correctly.
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// Everything visible lives in the panel inside; the dialog itself carries no
// padding, border or background, so a click reported against the dialog can
// only have landed on ::backdrop.
function bindDialog(dialog, signal) {
  const dialogEl = dialog;
  if (dialogEl.dataset.enhanced === 'true') return;
  dialogEl.dataset.enhanced = 'true';

  dialogEl.addEventListener(
    'click',
    (event) => {
      if (
        event.target === dialogEl ||
        event.target.closest('[data-close-modal]')
      ) {
        dialogEl.close();
      }
    },
    { signal }
  );

  dialogEl.addEventListener('keydown', (event) => trapTab(dialogEl, event), {
    signal,
  });
}

// Enhances every trigger inside `root`, which is what makes markup added after
// load workable — call it again with the new subtree. Triggers already carrying
// data-enhanced are skipped, so a second call cannot double-bind and open an
// already-open dialog. Returns a function that removes every listener this call
// registered.
export function initModal(root = document) {
  const controller = new AbortController();
  const { signal } = controller;

  root.querySelectorAll('[data-open-modal]').forEach((trigger) => {
    const triggerEl = trigger;
    if (triggerEl.dataset.enhanced === 'true') return;

    // The dialog sits outside the trigger, so it is reached by id the way the
    // accordion reaches its panel — not by document order.
    const dialog = document.getElementById(triggerEl.dataset.openModal);
    if (!dialog) return;

    // Without showModal() there is no modality to enhance to, and calling the
    // trigger would only throw. The dialog stays closed and inert instead.
    if (typeof dialog.showModal !== 'function') return;

    triggerEl.dataset.enhanced = 'true';

    triggerEl.addEventListener('click', () => dialog.showModal(), { signal });
    bindDialog(dialog, signal);
  });

  return () => controller.abort();
}
