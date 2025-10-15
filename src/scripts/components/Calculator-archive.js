document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="calculator"]')) return;

  // State variables mirroring the original React component's state
  let displayValue = '0';
  let firstOperand = null;
  let operator = null;
  let waitingForSecondOperand = false;

  // DOM element references
  const display = document.getElementById('display');
  const keys = document.querySelector('.calculator-keys');
  const clearButton = document.querySelector('[data-action="clear"]');

  /**
   * Updates the calculator display with the current value and adjusts font size.
   */
  const updateDisplay = () => {
    display.textContent = displayValue;
    const len = displayValue.length;

    // Dynamically adjust font size
    display.className =
      'text-white font-light break-all transition-all duration-200'; // Reset classes
    display.style.lineHeight = '1';

    if (len > 14) {
      display.classList.add('text-4xl');
    } else if (len > 9) {
      display.classList.add('text-5xl');
    } else if (len > 6) {
      display.classList.add('text-6xl');
    } else {
      display.classList.add('text-8xl');
    }

    // Update clear button text based on original React app's logic
    clearButton.textContent = displayValue === '0' ? 'AC' : 'C';
  };

  /**
   * Handles all key presses on the calculator.
   * @param {Event} event - The click event.
   */
  const handleKeyPress = (event) => {
    const { target } = event;
    if (!target.matches('button')) {
      return;
    }

    const { action, operator: op } = target.dataset;
    const keyContent = target.textContent.trim();

    if (!action) {
      inputDigit(keyContent);
    } else {
      switch (action) {
        case 'decimal':
          inputDecimal();
          break;
        case 'add':
        case 'subtract':
        case 'multiply':
        case 'divide':
          performOperation(op);
          break;
        case 'equals':
          handleEquals();
          break;
        case 'clear':
          clearAll();
          break;
        case 'toggle-sign':
          toggleSign();
          break;
        case 'percent':
          inputPercent();
          break;
        default:
          break;
      }
    }

    updateDisplay();
  };

  // Add single event listener to the keypad
  keys.addEventListener('click', handleKeyPress);

  // --- Calculation Logic ---

  const calculate = (first, second, op) => {
    switch (op) {
      case '+':
        return first + second;
      case '−':
        return first - second;
      case '×':
        return first * second;
      case '÷':
        if (second === 0) return NaN; // Handle division by zero
        return first / second;
      default:
        return second;
    }
  };

  const inputDigit = (digit) => {
    if (waitingForSecondOperand) {
      displayValue = digit;
      waitingForSecondOperand = false;
    } else {
      displayValue = displayValue === '0' ? digit : displayValue + digit;
    }
  };

  const inputDecimal = () => {
    if (waitingForSecondOperand) {
      displayValue = '0.';
      waitingForSecondOperand = false;
      return;
    }
    if (!displayValue.includes('.')) {
      displayValue += '.';
    }
  };

  const clearAll = () => {
    displayValue = '0';
    firstOperand = null;
    operator = null;
    waitingForSecondOperand = false;
  };

  const toggleSign = () => {
    displayValue = String(parseFloat(displayValue) * -1);
  };

  const inputPercent = () => {
    displayValue = String(parseFloat(displayValue) / 100);
  };

  const performOperation = (nextOperator) => {
    const inputValue = parseFloat(displayValue);

    if (firstOperand === null) {
      firstOperand = inputValue;
    } else if (operator) {
      const result = calculate(firstOperand, inputValue, operator);
      const resultString = String(result);
      displayValue = resultString;
      firstOperand = result;
    }

    waitingForSecondOperand = true;
    operator = nextOperator;
  };

  const handleEquals = () => {
    const inputValue = parseFloat(displayValue);
    if (operator && firstOperand !== null) {
      const result = calculate(firstOperand, inputValue, operator);
      const resultString = String(result);
      displayValue = resultString;
      firstOperand = null;
      operator = null;
      waitingForSecondOperand = true;
    }
  };

  // Initial display update
  updateDisplay();
});
