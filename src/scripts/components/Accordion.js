document.addEventListener('DOMContentLoaded', () => {
  if(!document.querySelector('[data-component="accordion"]')) return;

  const accordionButtons = document.querySelectorAll('.accordion-item button');

  accordionButtons.forEach((button) => {
    button.addEventListener('click', () => {
      // close
      accordionButtons.forEach((otherButton) => {
        if (otherButton !== button) {
          otherButton.setAttribute('aria-expanded', 'false');
          const contentId = otherButton.getAttribute('aria-controls');
          if (contentId) {
            const otherContent = document.getElementById(contentId);
            if (otherContent) {
              otherContent.style.maxHeight = null;
            }
          }
        }
      });

      // toggle clicked item
      const isExpanded = button.getAttribute('aria-expanded') === 'true';
      const content = document.getElementById(
        button.getAttribute('aria-controls')
      );

      if (content) {
        if (isExpanded) {
          // Collapse the content
          button.setAttribute('aria-expanded', 'false');
          content.style.maxHeight = null;
        } else {
          // Expand the content
          button.setAttribute('aria-expanded', 'true');
          // Set max-height to the content's scroll height to trigger the transition
          content.style.maxHeight = `${content.scrollHeight}px`;
        }
      }
    });
  });
});
