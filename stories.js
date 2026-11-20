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

  // Optional permission for a future book, journal, or collection, with an
  // optional email shown only when that permission is given. Added by script so
  // the article pages themselves don't need to change.
  const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  const style = document.createElement('style');
  style.textContent = '.story-hint{margin:0;color:#64727D;font:12px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}.story-optional{font-weight:400;color:#64727D}';
  document.head.appendChild(style);

  const collectionLabel = document.createElement('label');
  collectionLabel.className = 'story-consent';
  collectionLabel.htmlFor = 'story-collection-consent';
  const collectionInput = document.createElement('input');
  collectionInput.type = 'checkbox';
  collectionInput.id = 'story-collection-consent';
  collectionInput.setAttribute('aria-controls', 'story-contact-field');
  collectionInput.setAttribute('aria-expanded', 'false');
  const collectionText = document.createElement('span');
  collectionText.append('BEYOND may also include my story in a future book, journal, or collection. ');
  const optionalTag = document.createElement('span');
  optionalTag.className = 'story-optional';
  optionalTag.textContent = '(Optional)';
  collectionText.append(optionalTag);
  collectionLabel.append(collectionInput, collectionText);

  const contactField = document.createElement('div');
  contactField.className = 'story-field';
  contactField.id = 'story-contact-field';
  contactField.style.display = 'none';
  const emailLabel = document.createElement('label');
  emailLabel.htmlFor = 'story-contact-email';
  emailLabel.textContent = 'Email address (optional)';
  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.id = 'story-contact-email';
  emailInput.autocomplete = 'email';
  emailInput.inputMode = 'email';
  emailInput.maxLength = 254;
  emailInput.setAttribute('aria-describedby', 'story-contact-hint');
  const emailHint = document.createElement('p');
  emailHint.className = 'story-hint';
  emailHint.id = 'story-contact-hint';
  emailHint.textContent = "I'll contact you before your story appears in print. Your email is never shown on the site.";
  contactField.append(emailLabel, emailInput, emailHint);

  const consentRow = consentInput.closest('.story-consent') || consentInput.closest('label') || consentInput.parentElement;
  consentRow.after(collectionLabel, contactField);

  const updateContactField = () => {
    const show = collectionInput.checked;
    contactField.style.display = show ? '' : 'none';
    collectionInput.setAttribute('aria-expanded', String(show));
  };
  collectionInput.addEventListener('change', updateContactField);

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
    const collectionConsent = collectionInput.checked;
    const contactEmail = collectionConsent ? emailInput.value.trim() : '';
    if (contactEmail && (contactEmail.length > 254 || !EMAIL_PATTERN.test(contactEmail))) {
      setStatus('Please enter a valid email address, or leave it blank.', 'error');
      emailInput.focus();
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
          turnstile_token: token,
          collection_consent: collectionConsent,
          contact_email: contactEmail
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Your story could not be submitted.');
      }

      form.reset();
      updateCounter();
      updateContactField();
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
