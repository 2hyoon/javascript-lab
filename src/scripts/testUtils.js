import { vi } from 'vitest';

// Components export nothing: they subscribe to DOMContentLoaded at import time
// and read the DOM from inside that callback. To exercise one, the module has
// to be re-imported against a fresh fixture.
//
// Dispatching DOMContentLoaded is not enough. vi.resetModules() clears the
// module cache but leaves the listeners already registered on document, so
// every copy imported by an earlier test would run again on the current DOM —
// a component that toggles state would then toggle it once per past test.
// Capture the callback during the import and call it directly instead.
export async function mount(importComponent, html, { component } = {}) {
  if (component) document.body.dataset.component = component;
  document.body.innerHTML = html;

  let ready;
  const subscribe = vi
    .spyOn(document, 'addEventListener')
    .mockImplementation((type, handler) => {
      if (type === 'DOMContentLoaded') ready = handler;
    });

  vi.resetModules();
  await importComponent();
  subscribe.mockRestore();

  ready();
}

export function resetDocument() {
  document.body.innerHTML = '';
  delete document.body.dataset.component;
}
