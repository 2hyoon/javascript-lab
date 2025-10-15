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

  /**
   * Updates the calculator display with the current value and adjusts font size.
   */
  const updateDisplay = () => {
    display.textContent = displayValue;
  };

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
    const inputValue = parseFloat(displayValue); // 지금 디스플레이 되어있는 값
    // 3 + + + 라고 치면 3 + 3 + 3 + 3이 계산되어짐

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

  // Initial display update
  updateDisplay();
});
