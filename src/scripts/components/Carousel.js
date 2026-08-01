const AUTOPLAY_INTERVAL = 5000;

// A slide's visibility, its dot and the tab order all describe one selection,
// so they are written together and never separately. `inert` does the work
// that aria-hidden cannot: it takes the offscreen slide out of the
// accessibility tree *and* out of the tab order, so a caption link three
// slides away is not focusable.
function setCurrentState(slide, dot, current) {
  const slideEl = slide;
  const dotEl = dot;

  if (current) slideEl.removeAttribute('inert');
  else slideEl.setAttribute('inert', '');

  if (dotEl) dotEl.setAttribute('aria-current', current ? 'true' : 'false');
}

// Enhances every carousel inside `root`, which is what makes markup added
// after load workable — call it again with the new subtree. Carousels already
// carrying data-enhanced are skipped, so a second call cannot double-bind.
// Returns a function that removes every listener *and stops every timer* this
// call started; the timer is why this component needs the handle at all.
export function initCarousel(root = document) {
  const controller = new AbortController();
  const { signal } = controller;
  const stoppers = [];

  root.querySelectorAll('.crs').forEach((carousel) => {
    const carouselEl = carousel;
    if (carouselEl.dataset.enhanced === 'true') return;

    const slidesContainer = carouselEl.querySelector('.crs-slides');
    const slides = [...carouselEl.querySelectorAll('.crs-slide')];
    if (!slidesContainer || !slides.length) return;

    const dotsContainer = carouselEl.querySelector('.crs-dots');
    const statusEl = carouselEl.querySelector('.crs-status');
    const autoPlayButton = carouselEl.querySelector('.crs-autoplay-btn');

    carouselEl.dataset.enhanced = 'true';

    if (dotsContainer) {
      dotsContainer.innerHTML = slides
        .map(
          (_, index) =>
            `<button type="button" class="crs-dot" data-index="${index}" aria-label="Go to slide ${index + 1}"></button>`
        )
        .join('');
    }

    const dots = dotsContainer
      ? [...dotsContainer.querySelectorAll('.crs-dot')]
      : [];

    let currentIndex = 0;

    // Autoplay is two separate facts. `wantsAutoPlay` is what the user asked
    // for through the button; `timerId` is whether it is *actually* rotating
    // right now. Hover, focus and a backgrounded tab suspend the rotation
    // without changing the intent, so leaving the carousel resumes it but
    // pressing Pause does not.
    let wantsAutoPlay = !window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches;
    let timerId = null;
    let pointerInside = false;
    let focusInside = false;

    function goTo(index) {
      currentIndex = (index + slides.length) % slides.length;
      slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;

      slides.forEach((slide, i) => {
        setCurrentState(slide, dots[i], i === currentIndex);
      });

      if (statusEl) {
        statusEl.textContent = `Slide ${currentIndex + 1} of ${slides.length}`;
      }
    }

    function syncAutoPlay() {
      const suspended = pointerInside || focusInside || document.hidden;
      const shouldRun = wantsAutoPlay && !suspended;

      if (shouldRun && timerId === null) {
        timerId = setInterval(() => goTo(currentIndex + 1), AUTOPLAY_INTERVAL);
      } else if (!shouldRun && timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }

      if (autoPlayButton) {
        autoPlayButton.textContent = wantsAutoPlay ? 'Pause' : 'Play';
      }

      // Rotation is not a user action, so it must not be announced. Only the
      // slide changes that happen while nothing is rotating get through.
      if (statusEl) {
        statusEl.setAttribute('aria-live', timerId === null ? 'polite' : 'off');
      }
    }

    // Manual navigation restarts the countdown, so the slide the user just
    // chose gets a full interval instead of being swept away mid-read.
    function goToManually(index) {
      goTo(index);

      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
        syncAutoPlay();
      }
    }

    carouselEl.addEventListener(
      'click',
      (event) => {
        const control = event.target.closest('button');
        if (!control || !carouselEl.contains(control)) return;

        if (control.matches('.crs-prev-btn')) {
          goToManually(currentIndex - 1);
        } else if (control.matches('.crs-next-btn')) {
          goToManually(currentIndex + 1);
        } else if (control.matches('.crs-dot')) {
          goToManually(Number(control.dataset.index));
        } else if (control.matches('.crs-autoplay-btn')) {
          wantsAutoPlay = !wantsAutoPlay;
          syncAutoPlay();
        }
      },
      { signal }
    );

    ['mouseenter', 'mouseleave'].forEach((type) => {
      carouselEl.addEventListener(
        type,
        (event) => {
          pointerInside = event.type === 'mouseenter';
          syncAutoPlay();
        },
        { signal }
      );
    });

    ['focusin', 'focusout'].forEach((type) => {
      carouselEl.addEventListener(
        type,
        (event) => {
          focusInside = event.type === 'focusin';
          syncAutoPlay();
        },
        { signal }
      );
    });

    document.addEventListener('visibilitychange', syncAutoPlay, { signal });

    stoppers.push(() => {
      clearInterval(timerId);
      timerId = null;
    });

    goTo(0);
    syncAutoPlay();
  });

  return () => {
    controller.abort();
    stoppers.forEach((stop) => stop());
  };
}
