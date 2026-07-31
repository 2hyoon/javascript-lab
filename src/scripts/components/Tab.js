function getPanel(tab) {
  const panelId = tab.getAttribute('aria-controls');
  return panelId ? document.getElementById(panelId) : null;
}

// The tab strip is a single stop in the tab order: only the selected tab is
// reachable with Tab, and the arrow keys move within the strip. That roving
// tabindex, aria-selected and the visible panel all describe one selection,
// so they are written together and never separately.
function setSelectedState(tab, panel, selected) {
  const tabEl = tab;

  tabEl.setAttribute('aria-selected', selected ? 'true' : 'false');
  tabEl.setAttribute('tabindex', selected ? '0' : '-1');
  panel.classList.toggle('current', selected);
}

// Enhances every tab widget inside `root`, which is what makes markup added
// after load workable — call it again with the new subtree. Widgets already
// carrying data-enhanced are skipped, so a second call cannot double-bind.
// Returns a function that removes every listener this call registered.
export function initTab(root = document) {
  const controller = new AbortController();
  const { signal } = controller;

  root.querySelectorAll('.tab').forEach((widget) => {
    const widgetEl = widget;
    if (widgetEl.dataset.enhanced === 'true') return;

    const tabList = widgetEl.querySelector('[role="tablist"]');
    if (!tabList) return;

    // a tab whose aria-controls points nowhere has no panel to show, so it is
    // left out of the strip entirely rather than handled at every use
    const tabs = [
      ...tabList.querySelectorAll('[role="tab"][aria-controls]'),
    ].filter((tab) => getPanel(tab));
    if (!tabs.length) return;

    widgetEl.dataset.enhanced = 'true';

    function select(selectedTab, moveFocus = true) {
      tabs.forEach((tab) => {
        setSelectedState(tab, getPanel(tab), tab === selectedTab);
      });

      if (moveFocus) selectedTab.focus();
    }

    tabList.addEventListener(
      'click',
      (event) => {
        const tab = event.target.closest('[role="tab"]');
        if (!tab || !tabs.includes(tab)) return;

        select(tab);
      },
      { signal }
    );

    tabList.addEventListener(
      'keydown',
      (event) => {
        const currentIndex = tabs.indexOf(document.activeElement);

        // the key came from somewhere other than a tab, so it is not ours to handle
        if (currentIndex === -1) return;

        let nextIndex;

        switch (event.key) {
          case 'ArrowRight':
            nextIndex = (currentIndex + 1) % tabs.length;
            break;
          case 'ArrowLeft':
            nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            break;
          case 'Home':
            nextIndex = 0;
            break;
          case 'End':
            nextIndex = tabs.length - 1;
            break;
          default:
            return;
        }

        event.preventDefault();
        select(tabs[nextIndex]);
      },
      { signal }
    );

    // the markup names the tab to open, as the accordion does; the first tab
    // is only a fallback. Focus stays put — this runs on page load.
    const preSelected = tabs.find(
      (tab) => tab.getAttribute('aria-selected') === 'true'
    );
    select(preSelected ?? tabs[0], false);
  });

  return () => controller.abort();
}
