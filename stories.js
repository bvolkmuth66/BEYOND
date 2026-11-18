(() => {
  'use strict';

  const ENDPOINT = 'https://lwnuzdymjszavqwfqriz.supabase.co/functions/v1/submit-story';
  const form = document.querySelector('#beyond-story-form');
  if (!form) return;

  const articleNumber = Number(form.dataset.articleNumber);
  const nameInput = form.querySelector('#story-display-name');
  const storyInput = form.querySelector('#story-text');
  const consentInput = form.querySelector('#story-consent');
  const honeypot = form.querySelector('#story-website');
  const submitButton = form.querySelector('.story-submit');
  const counter = form.querySelector('#story-word-count');
  const remaining = form.querySelector('#story-remaining');
  const status = form.querySelector('#story-status');

  const countWords = (value) => {
    const clean = value.trim();
    return clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  };

  const setStatus = (message, kind = '') => {
    status.textContent = message;
    status.className = `story-status ${kind}`.trim();
  };

  const validArticle = Number.isInteger(articleNumber) && articleNumber >= 1 && articleNumber <= 12;
  if (!validArticle) {
    setStatus('This article is not configured for story submissions.', 'error');
    submitButton.disabled = true;
    return;
  }

  const updateCounter = () => {
    const words = countWords(storyInput.value);
    const left = 500 - words;
    counter.textContent = `${words} / 500 words`;
    remaining.textContent = left >= 0 ? `${left} remaining` : `${Math.abs(left)} over limit`;
    const wrapper = counter.parentElement;
    wrapper.classList.toggle('warning', words >= 450 && words <= 500);
    wrapper.classList.toggle('over', words > 500);
    submitButton.disabled = words > 500;
  };

  storyInput.addEventListener('input', updateCounter);
  updateCounter();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');

    if (honeypot.value) return;

    const displayName = nameInput.value.trim();
    const story = storyInput.value.trim();
    const words = countWords(story);
    const token = window.turnstile?.getResponse?.() || '';

    if (!displayName || displayName.length > 80) {
      setStatus('Please enter a display name of 80 characters or fewer.', 'error');
      nameInput.focus();
      return;
    }
    if (words < 25 || words > 500) {
      setStatus('Please share between 25 and 500 words.', 'error');
      storyInput.focus();
      return;
    }
    if (!consentInput.checked) {
      setStatus('Please confirm that your story may be publicly displayed.', 'error');
      consentInput.focus();
      return;
    }
    if (!token) {
      setStatus('Please complete human verification before submitting.', 'error');
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = 'Submitting…';
    setStatus('Submitting your story…');

    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          article_number: articleNumber,
          display_name: displayName,
          story,
          turnstile_token: token
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Your story could not be submitted.');
      }

      form.reset();
      updateCounter();
      window.turnstile?.reset?.();
      setStatus('Thank you. Your story has been received for review.', 'success');
    } catch (error) {
      window.turnstile?.reset?.();
      setStatus(error.message || 'Something went wrong. Please try again.', 'error');
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Share My Story →';
    }
  });
})();
