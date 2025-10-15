document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="digital-clock"]')) return;

  const DIGIT_MAP = {
    0: ['a', 'b', 'c', 'd', 'e', 'f'],
    1: ['b', 'c'],
    2: ['a', 'b', 'g', 'e', 'd'],
    3: ['a', 'b', 'g', 'c', 'd'],
    4: ['f', 'g', 'b', 'c'],
    5: ['a', 'f', 'g', 'c', 'd'],
    6: ['a', 'f', 'g', 'e', 'c', 'd'],
    7: ['a', 'b', 'c'],
    8: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    9: ['a', 'b', 'c', 'd', 'f', 'g'],
  };

  const segmentsConfig = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  function createSegmentPiece(active, position) {
    const segment = document.createElement('div');
    const baseClasses = 'digit-bar';
    const onClasses = 'opacity-off';
    const offClasses = 'opacity-20';

    segment.className = `${baseClasses} ${position} ${active ? onClasses : offClasses}`;
    return segment;
  }

  function createDigit(digit) {
    const container = document.createElement('div');
    container.className = 'digit';

    // const activeSegments = DIGIT_MAP[digit] ?? [];
    const activeSegments = DIGIT_MAP[digit];

    segmentsConfig.forEach((key) => {
      const segment = createSegmentPiece(
        activeSegments.includes(key),
        `digit-bar-${key}`
      );
      container.append(segment);
    });

    // for (const segmentKey of segmentsConfig) {
    //   const segment = createSegmentPiece(
    //     activeSegments.includes(segmentKey),
    //     `digit-bar-${segmentKey}`
    //   );
    //   container.append(segment);
    // }

    return container;
  }

  function createColon() {
    const container = document.createElement('div');
    container.className = 'dot-container';

    const dot1 = document.createElement('div');
    dot1.className = 'dot';

    const dot2 = document.createElement('div');
    dot2.className = 'dot';

    container.append(dot1);
    container.append(dot2);

    return container;
  }

  const clockContainer = document.getElementById('digital-clock-container');
  const timeElement = document.getElementById('time-element');
  // const screenReaderTime = document.getElementById('sr-time');

  function updateClock() {
    if (!clockContainer || !timeElement) return;

    const now = new Date();
    // const hours = (
    //   now.getHours() % 12 > 0 ? now.getHours() - 12 : now.getHours()
    // )
    //   .toString()
    //   .padStart(2, '0');
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    // Update accessibility elements
    timeElement.setAttribute(
      'aria-label',
      `Current local time is ${now.toLocaleTimeString()}`
    );
    // screenReaderTime.textContent = now.toLocaleTimeString();
    // toISOString

    while (clockContainer.firstElementChild) {
      clockContainer.firstElementChild.remove();
    }

    // Render new time
    clockContainer.append(createDigit(hours[0]));
    clockContainer.append(createDigit(hours[1]));
    clockContainer.append(createColon());
    clockContainer.append(createDigit(minutes[0]));
    clockContainer.append(createDigit(minutes[1]));
    clockContainer.append(createColon());
    clockContainer.append(createDigit(seconds[0]));
    clockContainer.append(createDigit(seconds[1]));
  }

  // Initial call to display clock immediately
  updateClock();

  // Update the clock every second
  setInterval(updateClock, 1000);
});
