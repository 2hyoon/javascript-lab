document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component=carousel]')) return;

  const slidesData = [
    {
      imageUrl: 'https://picsum.photos/1200/800?random=1',
      title: 'Discover Majestic Mountains',
      description:
        "Experience the breathtaking views and serene landscapes of the world's highest peaks.",
    },
    {
      imageUrl: 'https://picsum.photos/1200/800?random=2',
      title: 'Vibrant Cityscapes at Night',
      description:
        'Explore the bustling energy and stunning lights of modern metropolises after dark.',
    },
    {
      imageUrl: 'https://picsum.photos/1200/800?random=3',
      title: 'Serene Coastal Escapes',
      description:
        'Relax on pristine beaches and listen to the gentle waves of the crystal-clear ocean.',
    },
    {
      imageUrl: 'https://picsum.photos/1200/800?random=4',
      title: 'Enchanting Forest Trails',
      description:
        'Wander through ancient forests and connect with the tranquility of nature.',
    },
    {
      imageUrl: 'https://picsum.photos/1200/800?random=5',
      title: 'Architectural Wonders',
      description:
        'Marvel at the ingenuity and beauty of iconic structures from around the globe.',
    },
  ];

  const carouselContainer = document.getElementById('carousel-container');
  const slidesContainer = document.getElementById('slides-container');
  const prevButton = document.getElementById('prev-btn');
  const nextButton = document.getElementById('next-btn');
  const dotsContainer = document.getElementById('dots-container');

  const autoPlayInterval = 5000;
  let currentIndex = 0;
  let autoPlayTimerID = null;

  function updateUI() {
    slidesContainer.style.transform = `translateX(-${currentIndex * 100}%)`;

    // Hide non-active slides from assistive technologies.
    slidesContainer.querySelectorAll('.crs-slide').forEach((slide, index) => {
      const isCurrentSlide = index === currentIndex;
      slide.setAttribute('aria-hidden', String(!isCurrentSlide));
    });

    // dots
    dotsContainer.querySelectorAll('.dot').forEach((dot, index) => {
      if (index === currentIndex) {
        dot.setAttribute('aria-current', 'true');
      } else {
        dot.removeAttribute('aria-current');
      }
    });
  }

  function goToNext() {
    currentIndex =
      currentIndex === slidesData.length - 1 ? 0 : currentIndex + 1;
    updateUI();
  }

  function goToPrev() {
    currentIndex =
      currentIndex === 0 ? slidesData.length - 1 : currentIndex - 1;
    updateUI();
  }

  function goToSlide(index) {
    currentIndex = index;
    updateUI();
    resetAutoPlay();
  }

  function startAutoPlay() {
    if (autoPlayInterval > 0) {
      autoPlayTimerID = setInterval(goToNext, autoPlayInterval);
    }
  }

  function stopAutoPlay() {
    clearInterval(autoPlayTimerID);
  }

  function resetAutoPlay() {
    stopAutoPlay();
    startAutoPlay();
  }

  function renderUI() {
    if (
      !carouselContainer ||
      !slidesContainer ||
      !prevButton ||
      !nextButton ||
      !dotsContainer
    ) {
      return;
    }

    if (!slidesData || slidesData.length === 0) {
      carouselContainer.insertAdjacentHTML(
        'afterbegin',
        '<p>No slides to display.</p>'
      );
      return;
    }

    // slides
    const slidesHTML = slidesData
      .map(
        (slide, index) =>
          `<div class="crs-slide" aria-label="slide ${index + 1} of ${slidesData.length}"><img src="${slide.imageUrl}" alt="${slide.title}"></div>`
      )
      .join('');

    slidesContainer.insertAdjacentHTML('afterbegin', slidesHTML);

    // dots
    const dotsHTML = slidesData
      .map(
        (_, index) =>
          `<button type="button" aria-label="Go to slide ${index + 1}" data-index="${index}" class="dot crs-dot"></button>`
      )
      .join('');

    dotsContainer.insertAdjacentHTML('afterbegin', dotsHTML);

    dotsContainer.querySelectorAll('.dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        goToSlide(Number(dot.dataset.index));
      });
    });

    prevButton.addEventListener('click', () => {
      goToPrev();
      resetAutoPlay();
    });

    nextButton.addEventListener('click', () => {
      goToNext();
      resetAutoPlay();
    });

    updateUI();
    // startAutoPlay();
  }

  renderUI();
});
