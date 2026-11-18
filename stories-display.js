(() => {
  'use strict';

  const list = document.querySelector('#published-stories-list');
  if (!list) return;

  const articleNumber = Number(list.dataset.articleNumber);
  if (!Number.isInteger(articleNumber) || articleNumber < 1 || articleNumber > 12) {
    list.textContent = 'Reader stories are unavailable for this article.';
    return;
  }

  const ENDPOINT = `https://lwnuzdymjszavqwfqriz.supabase.co/functions/v1/get-stories?article=${articleNumber}`;

  const formatDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    }).format(date);
  };

  const storyCard = (item) => {
    const article = document.createElement('article');
    article.className = 'reader-story';

    const header = document.createElement('p');
    header.className = 'reader-story-header';
    header.textContent = `Shared by ${String(item.display_name || 'Anonymous')}`;

    const text = document.createElement('p');
    text.className = 'reader-story-text';
    text.textContent = String(item.story || '');

    article.append(header, text);

    const formatted = formatDate(item.published_at);
    if (formatted) {
      const meta = document.createElement('p');
      meta.className = 'reader-story-date';
      meta.textContent = `Published ${formatted}`;
      article.append(meta);
    }
    return article;
  };

  fetch(ENDPOINT, { method: 'GET', cache: 'no-store' })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Stories could not be loaded.');
      }
      return Array.isArray(result.stories) ? result.stories.slice(0, 5) : [];
    })
    .then((stories) => {
      list.replaceChildren();
      if (!stories.length) {
        const empty = document.createElement('p');
        empty.className = 'published-stories-empty';
        empty.textContent = 'No reader stories have been published yet. You can be the first to share one.';
        list.append(empty);
        return;
      }
      stories.forEach((story) => list.append(storyCard(story)));
    })
    .catch((error) => {
      list.replaceChildren();
      const message = document.createElement('p');
      message.className = 'published-stories-error';
      message.textContent = error.message || 'Stories could not be loaded.';
      list.append(message);
    });
})();
