document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="tab"]')) return;

  const tabList = document.querySelector('[role="tablist"]');
  const tabs = document.querySelectorAll('[role="tab"]');
  const panels = document.querySelectorAll('[role="tabpanel"]');

  function switchTab(selectedTab, moveFocus = true) {
    tabs.forEach((tab, i) => {
      if (tab === selectedTab) {
        tab.setAttribute('aria-selected', true);
        tab.setAttribute('tabindex', 0);
        if (moveFocus) tab.focus();
        panels[i].classList.add('current');
      } else {
        tab.setAttribute('aria-selected', false);
        tab.setAttribute('tabindex', -1);
        panels[i].classList.remove('current');
      }
    });
  }

  tabList.addEventListener('click', (e) => {
    const clickedTab = e.target.closest('button');

    if (clickedTab) switchTab(clickedTab);
  });

  tabList.addEventListener('keydown', (e) => {
    const currentIndex = Array.from(tabs).findIndex(
      (tab) => tab === document.activeElement
    );

    // the key came from somewhere other than a tab, so it is not ours to handle
    if (currentIndex === -1) return;

    let nextIndex;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'ArrowLeft':
        nextIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
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

    e.preventDefault();
    switchTab(tabs[nextIndex]);
  });

  // select the first tab without pulling focus away on page load
  switchTab(tabs[0], false);
});
