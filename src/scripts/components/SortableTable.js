document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="sortable-table"]')) return;

  const table = document.querySelector('#sortable-table');
  let data;

  // table columns
  const columns = [
    { key: 'id', name: 'ID' },
    { key: 'title', name: 'Product Name' },
    { key: 'brand', name: 'Brand' },
    { key: 'price', name: 'Price' },
  ];

  let sortConfig = {
    key: null,
    direction: 'ascending', // 'ascending' or 'descending'
  };

  function buildTable() {
    const sortedItems = [...data];

    if (sortConfig.key) {
      sortedItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }

    const tableHTML = `<table>
      <thead>
        <tr>
          ${columns.map((c) => `<th data-key=${c.key}>${c.name}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${sortedItems
          .map(
            (item) => `<tr>
            <td>${item.id}</td>
            <td>${item.title}</td>
            <td>${item.brand}</td>
            <td>${item.price}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`;

    table.insertAdjacentHTML('afterbegin', tableHTML);
    addEventListeners();
  }

  function handleSort(key) {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    sortConfig = { key, direction };
    buildTable();
  }

  function addEventListeners() {
    const heads = table.querySelectorAll('[data-key]');

    heads.forEach((h) => {
      h.addEventListener('click', () => {
        handleSort(h.dataset.key);
      });
    });
  }

  async function callApi() {
    try {
      const response = await fetch('https://dummyjson.com/products?limit=100');

      if (!response.ok) {
        throw new Error('Data could not be fetched.');
      }

      const parsedJson = await response.json();
      data = parsedJson.products;
      buildTable();
    } catch (err) {
      throw new Error(err);
    }
  }

  callApi();
});
