import { initAccordion } from './components/Accordion';
import { initTab } from './components/Tab';
import { initModal } from './components/Modal';
import { initCarousel } from './components/Carousel';
import { initScroll } from './components/Scroll';
import { initRateLimit } from './components/RateLimit';
import { initToDoList } from './components/ToDoList';
import { initAutocomplete } from './components/Autocomplete';
import './components/Counter';
import './components/DigitalClock';
import './components/AnalogueClock';
import './components/Calculator';
import './components/SortableTable';
import './components/Form';
import './components/TicTacToe';

// Components above still start themselves on import. Accordion, Tab, Modal,
// Carousel, Scroll, RateLimit, ToDoList and Autocomplete no longer do: they
// export an init, so deciding *when* and *where* they run happens here.
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-component="accordion"]')) initAccordion();
  if (document.querySelector('[data-component="tab"]')) initTab();
  if (document.querySelector('[data-component="modal"]')) initModal();
  if (document.querySelector('[data-component="carousel"]')) initCarousel();
  if (document.querySelector('[data-component="scroll"]')) initScroll();
  if (document.querySelector('[data-component="rateLimit"]')) initRateLimit();
  if (document.querySelector('[data-component="todo-list"]')) initToDoList();
  if (document.querySelector('[data-component="autocomplete"]'))
    initAutocomplete();
});
