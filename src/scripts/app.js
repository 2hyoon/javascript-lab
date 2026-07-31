// import './components/Button';
// import './components/Debounce';
import { initAccordion } from './components/Accordion';
import './components/ToDoList';
import './components/Counter';
import './components/DigitalClock';
import './components/AnalogueClock';
import './components/Calculator';
import './components/SortableTable';
import './components/Form';
import './components/Carousel';
import './components/TicTacToe';
import './components/Tab';
import './components/Modal';
import './components/Scroll';

// Components below still start themselves on import. Accordion no longer does:
// it exports an init, so deciding *when* and *where* it runs happens here.
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-component="accordion"]')) initAccordion();
});
