document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="tictactoe"]')) return;

  const squareButtons = document.querySelectorAll('.square');
  const resetButton = document.querySelector('#reset-button');
  const status = document.querySelector('#game-status');
  const historyList = document.querySelector('#history-list');

  let history = [{ squares: Array(9).fill(null) }];
  let xIsNext = true;
  let currentStep = 0;

  function calculateWinner(squares) {
    const lines = [
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ];

    for (let i = 0; i < lines.length; i++) {
      const [a, b, c] = lines[i];
      if (
        squares[a] &&
        squares[a] === squares[b] &&
        squares[a] === squares[c]
      ) {
        return { winner: squares[a], line: lines[i] };
      }
    }

    return null;
  }

  function renderUI() {
    const current = history[currentStep];
    const winnerInfo = calculateWinner(current.squares);
    const isDraw =
      !winnerInfo && current.squares.every((square) => square !== null);

    // update status panel
    if (winnerInfo) {
      status.textContent = `Winner is ${winnerInfo.winner}!`;
    } else if (isDraw) {
      status.textContent = `It's a Draw!`;
    } else {
      status.textContent = `Next Player: ${xIsNext ? 'X' : 'O'}`;
    }

    // square buttons
    squareButtons.forEach((square, i) => {
      const value = current.squares[i];
      const isWinningNumber = winnerInfo && winnerInfo.line.includes(i);

      // Accessibility: Update aria-label
      let ariaLabel = `Board square ${i + 1}, `;
      if (value) {
        ariaLabel += `currently ${value}`;
      } else {
        ariaLabel += 'empty';
      }
      square.setAttribute('aria-label', ariaLabel);

      square.className = 'square';
      square.textContent = '';

      if (isWinningNumber) square.classList.add('won');

      if (value) {
        square.textContent = value;
        square.classList.add(`player-${value.toLowerCase()}`);
      }
    });

    // Render History
    historyList.innerHTML = '';
    history.forEach((_step, move) => {
      const desc = move ? `Go to move #${move}` : 'Go to game start';
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.textContent = desc;
      if (move === currentStep) {
        button.classList.add('current');
        button.setAttribute('aria-current', 'step');
      }
      button.addEventListener('click', () => jumpTo(move));
      li.append(button);
      historyList.append(li);
    });
  }

  function handleSquareButtonClick(index) {
    // copy previous
    const current = [...history[currentStep].squares];

    // if current game has a winner or, if it already has a value
    if (calculateWinner(current) || current[index]) {
      return;
    }

    current[index] = xIsNext ? 'X' : 'O';

    // update history
    history = [...history.slice(0, currentStep + 1), { squares: current }];

    // update values
    xIsNext = !xIsNext;
    currentStep = history.length - 1;

    renderUI();
  }

  function handleReset() {
    history = [{ squares: Array(9).fill(null) }];
    currentStep = 0;
    xIsNext = true;
    renderUI();
  }

  function jumpTo(step) {
    currentStep = step;
    xIsNext = step % 2 === 0;
    renderUI();
  }

  squareButtons.forEach((square) => {
    square.addEventListener('click', () => {
      handleSquareButtonClick(square.dataset.index);
    });
  });

  resetButton.addEventListener('click', handleReset);
  renderUI();
});
