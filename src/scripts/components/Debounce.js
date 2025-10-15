function example1() {
  function debounce(debounceTime = 300) {
    let timeout;

    window.addEventListener('scroll', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log('Scroll event debounced');
        // Place your scroll handling logic here
      }, debounceTime);
    });

    window.addEventListener('resize', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        console.log('Resize event debounced');
        // Place your resize handling logic here
      }, debounceTime);
    });
  }

  debounce(500);
}

function example2() {
  function debounce(fn, t) {
    let timeoutId = null; // Store the timeout ID

    return function (...args) {
      // Clear any existing timeout to reset the timer
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      // Set a new timeout to call fn after t milliseconds
      timeoutId = setTimeout(() => {
        fn(...args);
        // fn.apply(this, args);
      }, t);
    };
  }

  const fn = (x, y) => {
    console.log(x + 1, y);
    return x + 1;
  };

  const debounced = debounce(fn, 100);
  debounced(1, 'a'); // t=0ms: Call queued
  debounced(2, 'b'); // t=50ms: Resets timer, previous call canceled
  // After t=150ms (100ms after last call), fn(2) runs, returns 3
}

/**
 * input example
 */
function example3() {
  const searchInput = document.getElementById('search-input');

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fn.apply(this, args);
      }, delay);
    };
  }

  const debouncedSearch = debounce((event) => {
    console.log('검색 중...', `${event.target.value}`);
  }, 500);

  searchInput.addEventListener('input', debouncedSearch);
}

document.addEventListener('DOMContentLoaded', () => {
  example1();
  // example2();
  // example3();
});
