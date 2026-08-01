// import './components/Button';
// import './components/Debounce';
import { initAccordion } from './components/Accordion';
import { initTab } from './components/Tab';
import { initModal } from './components/Modal';
import { initCarousel } from './components/Carousel';
import './components/ToDoList';
import './components/Counter';
import './components/DigitalClock';
import './components/AnalogueClock';
import './components/Calculator';
import './components/SortableTable';
import './components/Form';
import './components/TicTacToe';
import './components/Scroll';

// Components above still start themselves on import. Accordion, Tab, Modal and
// Carousel no longer do: they export an init, so deciding *when* and *where*
// they run happens here.
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-component="accordion"]')) initAccordion();
  if (document.querySelector('[data-component="tab"]')) initTab();
  if (document.querySelector('[data-component="modal"]')) initModal();
  if (document.querySelector('[data-component="carousel"]')) initCarousel();
});
