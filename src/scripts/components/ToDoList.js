class ToDoList {
  constructor() {
    this.elem = document.querySelector('.todo');
    this.input = this.elem.querySelector('#todo-input');
    this.list = document.getElementById('todo-list');
    this.completedList = this.elem.querySelector('#todo-completed-list');
    this.addBtn = this.elem.querySelector('.todo-add-btn');
    this.indicator = this.elem.querySelector('.todo-indicator');
    this.id = 1;
    this.data = new Map(); // id, {value, isComplete}
  }

  renderTask(taskId) {
    const task = this.data.get(taskId);
    const listElem = document.createElement('li');
    const checkbox = document.createElement('input');
    const textInput = document.createElement('input');
    const deleteBtn = document.createElement('button');

    listElem.setAttribute('data-id', taskId);

    checkbox.type = 'checkbox';
    checkbox.name = `task-cbx-${taskId}`;
    checkbox.ariaLabel = 'Toggle task completion';
    checkbox.addEventListener('click', this.completeTask.bind(this));

    textInput.type = 'text';
    textInput.value = task.value;
    textInput.name = `task-input-${taskId}`;
    textInput.ariaLabel = 'Enter or Update Task';
    textInput.classList.add('todo-list-input');

    deleteBtn.innerText = 'Delete';
    deleteBtn.ariaLabel = 'Delete Task';
    deleteBtn.addEventListener('click', this.removeTask.bind(this));

    this.list.prepend(listElem);
    listElem.append(checkbox, textInput, deleteBtn);
  }

  toggleIndicator() {
    console.log(this.list.querySelectorAll('li').length);
    this.list.querySelectorAll('li').length > 0
      ? this.indicator.classList.add('off')
      : this.indicator.classList.remove('off');
  }

  addTask() {
    const { value } = this.input;

    this.data.set(this.id, { value, isComplete: false });
    this.renderTask(this.id);
    this.input.value = '';
    this.id += 1;

    this.toggleIndicator();
  }

  removeTask(e) {
    this.data.delete(Number(e.currentTarget.parentElement.dataset.id));
    e.currentTarget.parentElement.remove();

    this.toggleIndicator();
  }

  completeTask(e) {
    const listElem = e.currentTarget.parentElement;
    const task = this.data.get(Number(listElem.dataset.id));
    const isComplete = e.currentTarget.checked;
    const taskInputElem = listElem.querySelector('.todo-list-input');

    task.isComplete = isComplete;

    if (taskInputElem)
      taskInputElem.style.textDecoration = e.currentTarget.checked
        ? 'line-through'
        : 'none';

    if (isComplete) {
      this.completedList.prepend(listElem);
    } else {
      this.list.prepend(listElem);
    }

    this.toggleIndicator();
  }

  init() {
    this.addBtn.addEventListener('click', () => this.addTask());

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.currentTarget.value !== '') this.addTask();
      // Escape
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="todo-list"]')) return;

  new ToDoList().init();
});
