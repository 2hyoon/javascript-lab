function getPanel(button) {
  const contentId = button.getAttribute('aria-controls');
  return contentId ? document.getElementById(contentId) : null;
}

// The panel collapses through grid-template-rows, so nothing here measures
// layout: a height read at init goes stale the moment the window is resized.
// `inert` takes the collapsed panel out of the accessibility tree *and* out
// of the tab order — aria-hidden alone would leave its links focusable.
function setExpandedState(button, panel, expanded) {
  const buttonEl = button;
  const panelEl = panel;

  buttonEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  panelEl.dataset.expanded = expanded ? 'true' : 'false';
  if (expanded) panelEl.removeAttribute('inert');
  else panelEl.setAttribute('inert', '');
}

// Enhances every accordion inside `root`, which is what makes markup added
// after load workable — call it again with the new subtree. Accordions already
// carrying data-enhanced are skipped, so a second call cannot double-bind.
// Returns a function that removes every listener this call registered.
export function initAccordion(root = document) {
  const controller = new AbortController();
  const { signal } = controller;

  root.querySelectorAll('.accordion').forEach((accordion) => {
    const accordionEl = accordion;
    if (accordionEl.dataset.enhanced === 'true') return;

    const buttons = [
      ...accordionEl.querySelectorAll(
        '.accordion-item h2 > button[aria-controls]'
      ),
    ];
    if (!buttons.length) return;

    accordionEl.dataset.enhanced = 'true';

    const expandedButtons = buttons.filter(
      (button) => button.getAttribute('aria-expanded') === 'true'
    );
    const defaultOpenButton =
      expandedButtons.length > 0 ? expandedButtons[0] : null;

    buttons.forEach((button) => {
      const panel = getPanel(button);
      if (!panel) return;

      const shouldBeExpanded = button === defaultOpenButton;
      setExpandedState(button, panel, shouldBeExpanded);
    });

    accordionEl.addEventListener(
      'click',
      (event) => {
        const button = event.target.closest(
          '.accordion-item h2 > button[aria-controls]'
        );
        if (!button || !accordionEl.contains(button)) return;

        const panel = getPanel(button);
        if (!panel) return;

        const isExpanded = button.getAttribute('aria-expanded') === 'true';

        buttons.forEach((otherButton) => {
          if (otherButton === button) return;
          const otherPanel = getPanel(otherButton);
          if (!otherPanel) return;
          setExpandedState(otherButton, otherPanel, false);
        });

        setExpandedState(button, panel, !isExpanded);
      },
      { signal }
    );
  });

  return () => controller.abort();
}
