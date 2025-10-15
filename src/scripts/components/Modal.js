document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="modal"]')) return;

  const firstFocusableElem = document.getElementById('first-focusable-elem');
  const lastFocusableElem = document.getElementById('last-focusable-elem');
  const modal = document.querySelector('[role="dialog"]');
  const openModalBtn = document.querySelector('#open-modal-btn');
  const closeModalBtns = document.querySelectorAll('.close-modal-btn');
  const bg = document.querySelector('.dialoge-bg');

  function openModal() {
    modal.classList.add('visible');
    firstFocusableElem.focus();
  }

  function closeModal() {
    modal.classList.remove('visible');
    openModalBtn.focus();
  }

  // trap focus in modal
  modal.addEventListener('keydown', (e) => {
    if (!modal || !firstFocusableElem || !lastFocusableElem) return;

    if (e.target === firstFocusableElem && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      lastFocusableElem.focus();
    } else if (
      e.target === lastFocusableElem &&
      e.key === 'Tab' &&
      !e.shiftKey
    ) {
      e.preventDefault();
      firstFocusableElem.focus();
    }
  });

  openModalBtn.addEventListener('click', openModal);

  closeModalBtns.forEach((b) => {
    b.addEventListener('click', closeModal);
  });

  bg.addEventListener('click', closeModal);
});

// export function addModalKeyDownHandler(
//   target,
//   firstFocusableElement,
//   lastFocusableElement
// ) {
//   if (!target || !firstFocusableElement || !lastFocusableElement) return;

// export function flickitySettleHandler(slides) {
//   slides.forEach((slide) => {
//     const focusableElements = slide.querySelectorAll("a, button");

//     if (slide.classList.contains("is-selected")) {
//       focusableElements.forEach((elem) => {
//         elem.setAttribute("tabindex", -1);
//       });
//     } else {
//       focusableElements.forEach((elem) => {
//         elem.removeAttribute("tabindex");
//       });
//     }
//   });
// }

// if (element.tabIndex < 0) {
//   return false;
// }

// if (element.disabled) {
//   return false;
// }

// switch (element.nodeName) {
//   case 'A':
//     return !!element.href && element.rel != 'ignore';
//   case 'INPUT':
//     return element.type != 'hidden';
//   case 'BUTTON':
//   case 'SELECT':
//   case 'TEXTAREA':
//     return true;
//   default:
//     return false;
// }
