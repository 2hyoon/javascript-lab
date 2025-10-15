document.addEventListener('DOMContentLoaded', () => {
  if (!document.querySelector('[data-component="form"]')) return;

  const form = document.getElementById('subscription-form');
  const nameInput = document.getElementById('name');
  const emailInput = document.getElementById('email');
  const termsCheckbox = document.getElementById('agreedToTerms');
  const submitButton = document.getElementById('submit-button');
  const alertContainer = document.getElementById('alert-container');

  function setLoading(loading) {
    const formElements = form.elements;
    // console.log(formElements);

    for (let i = 0; i < formElements.length; i++) {
      formElements[i].disabled = loading;
    }

    if (loading) {
      submitButton.textContent = 'Processing...';
      form.setAttribute('area-busy', 'true');
    } else {
      submitButton.textContent = 'Subscribe Now';
      form.setAttribute('area-busy', 'false');
    }
  }

  // type: 'success' | 'error'
  function showAlert(type, message = '') {
    alertContainer.innerHTML = ''; // reset

    const alertDiv = document.createElement('div');

    alertDiv.className = type === 'error' ? 'alert-error' : 'alert-success';
    alertDiv.setAttribute('role', 'alert');
    alertDiv.setAttribute('tablindex', '-1'); // Make it programmatically focusable
    alertDiv.insertAdjacentHTML('afterbegin', `<p>${message}</p>`);
    alertContainer.append(alertDiv);
    alertDiv.focus(); // Move focus to the new alert
  }

  function hideAlert() {
    alertContainer.innerHTML = '';
  }

  function validateForm() {
    if (!nameInput.value.trim()) {
      showAlert('error', 'Name is required.');
      return false;
    }

    if (!emailInput.value.trim()) {
      showAlert('error', 'Email is required.');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailInput.value)) {
      showAlert('error', 'Please enter a valid email address.');
      return false;
    }

    if (!termsCheckbox.checked) {
      showAlert('error', 'You must agree to the terms and conditions.');
      return false;
    }

    return true;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    hideAlert();

    // const formData2 = new FormData(form);

    // for (const [key, value] of formData2) {
    //   console.log(key, value);
    // }

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    const formData = {
      name: nameInput.value,
      email: emailInput.value,
      plan: form.querySelector('input[name="plan"]:checked').value,
      agreedToTerms: termsCheckbox.checked,
    };

    // console.log(formData);

    try {
      const response = await fetch(
        'https://jsonplaceholder.typicode.com/posts',
        {
          method: 'POST',
          body: JSON.stringify({
            title: 'New Subscription',
            body: formData,
            userId: 1,
          }),
          headers: {
            'Content-type': 'application/json; charset=UTF-8',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Network response was not ok.');
      }

      // success
      setLoading(false); // Set loading false before showing alert
      showAlert('success', 'Thank you for subscribing!');
      form.reset();
    } catch (err) {
      setLoading(false);
      showAlert('error', 'Failed to submit the form. Please try again later');
    }
  }

  form.addEventListener('submit', handleSubmit);
});
