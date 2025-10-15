document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="counter"]')) return;

  const countDisplay = document.getElementById('count');
  const incrementBtn = document.getElementById('increment-btn');
  const decrementBtn = document.getElementById('decrement-btn');
  const resetBtn = document.getElementById('reset-btn');

  if (!countDisplay || !incrementBtn || !decrementBtn || !resetBtn) {
    console.error('Could not find one or more required elements.');
    return;
  }

  let count = 0;

  const updateCountColor = () => {
    countDisplay.classList.remove('text-green', 'text-red', 'text-white');
    if (count > 0) {
      countDisplay.classList.add('text-green');
    } else if (count < 0) {
      countDisplay.classList.add('text-red');
    } else {
      countDisplay.classList.add('text-white');
    }
  };

  const render = () => {
    countDisplay.textContent = String(count);
    updateCountColor();
  };

  incrementBtn.addEventListener('click', () => {
    count++;
    render();
  });

  decrementBtn.addEventListener('click', () => {
    count--;
    render();
  });

  resetBtn.addEventListener('click', () => {
    count = 0;
    render();
  });

  // Initial render
  render();
});
