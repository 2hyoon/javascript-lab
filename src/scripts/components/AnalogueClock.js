document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="analogue-clock"]')) return;

  const hourHand = document.querySelector('[data-hour-hand]');
  const minHand = document.querySelector('[data-min-hand]');
  const secHand = document.querySelector('[data-sec-hand]');
  const markersContainer = document.querySelector('.markers');
  const clockContainer = document.querySelector('.aclock-container');
  const clock = document.querySelector('.aclock');

  function createMarkers() {
    if (!markersContainer) return;
    for (let i = 1; i <= 60; i++) {
      const marker = document.createElement('div');
      const isHourMarker = i % 5 === 0;
      marker.classList.add(
        'marker',
        isHourMarker ? 'hour-marker' : 'minute-marker'
      );
      marker.style.transform = `rotate(${i * 6}deg)`;
      markersContainer.append(marker);
    }
  }

  function setRotation(element, rotationRatio) {
    if (element) {
      element.style.setProperty('--rotation', rotationRatio * 360);
    }
  }

  function updateAriaLabel(date) {
    if (!clockContainer) return;

    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();

    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12; // Convert to 12-hour format, 0 should be 12
    const formattedMinutes = minutes.toString().padStart(2, 0);
    const formattedSeconds = seconds.toString().padStart(2, 0);

    const formattedTime = `${formattedHours}:${formattedMinutes}:${formattedSeconds} ${ampm}`;
    clock.setAttribute(
      'aria-label',
      `Analogue clock showing the time: ${formattedTime}`
    );
  }

  function setClock() {
    const currentDate = new Date();
    const secondsRatio = currentDate.getSeconds() / 60;
    const minutesRatio = (secondsRatio + currentDate.getMinutes()) / 60;
    const hoursRatio = (minutesRatio + currentDate.getHours()) / 12;

    setRotation(secHand, secondsRatio);
    setRotation(minHand, minutesRatio);
    setRotation(hourHand, hoursRatio);
    updateAriaLabel(currentDate);
  }

  createMarkers();
  setClock(); // Initial call to avoid delay
  setInterval(setClock, 1000);
});
