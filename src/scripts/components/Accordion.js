document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="accordion"]')) return;

  function getPanel(button) {
    const contentId = button.getAttribute('aria-controls');
    return contentId ? document.getElementById(contentId) : null;
  }

  function setExpandedState(button, panel, expanded) {
    const buttonEl = button;
    const panelEl = panel;

    buttonEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    panelEl.setAttribute('aria-hidden', expanded ? 'false' : 'true');
    panelEl.style.maxHeight = expanded ? `${panelEl.scrollHeight}px` : '0px';
  }

  const accordions = document.querySelectorAll('.accordion');
  if (!accordions.length) return;

  accordions.forEach((accordion) => {
    const accordionEl = accordion;
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

    accordionEl.addEventListener('click', (event) => {
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
    });
  });
});
