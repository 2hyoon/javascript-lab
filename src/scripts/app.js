// import './components/Button';
// import './components/Debounce';
import { initAccordion } from './components/Accordion';
import { initTab } from './components/Tab';
import './components/ToDoList';
import './components/Counter';
import './components/DigitalClock';
import './components/AnalogueClock';
import './components/Calculator';
import './components/SortableTable';
import './components/Form';
import './components/Carousel';
import './components/TicTacToe';
import './components/Modal';
import './components/Scroll';

// Components above still start themselves on import. Accordion and Tab no
// longer do: they export an init, so deciding *when* and *where* they run
// happens here.
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('[data-component="accordion"]')) initAccordion();
  if (document.querySelector('[data-component="tab"]')) initTab();
});
