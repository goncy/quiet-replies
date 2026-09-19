(() => {
  const BOT_THRESHOLD = 0.5;
  const results = new Map();
  const pending = new Set();
  let mode = 'mark';
  let view = { id: null };
  let scheduled;
  const bot = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M4 13H2m20 0h-2M8 6h8a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-6a4 4 0 0 1 4-4ZM9 12h.01M15 12h.01M9 16h6"/></svg>';
  const botOff = bot.replace('</svg>', '<path d="m3 3 18 18"/></svg>');

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  // Ignore quoted tweets and elements inserted by this extension.
  function ownTweetElement(article, selector) {
    return [...article.querySelectorAll(selector)].find(node => !node.closest('div[role="link"]') && !node.closest('.xbf-ui'));
  }

  function placeInHeader(article, node) {
    const reference = ownTweetElement(article, 'button[aria-label*="grok" i], [role="button"][aria-label*="grok" i]')
      ?? ownTweetElement(article, '[data-testid="caret"]');
    if (!reference) return false;
    // Stop at the closest horizontal control row, even if it has only one child.
    // Climbing past it can insert into the author row beside a growing spacer.
    for (let anchor = reference; anchor.parentElement && anchor.parentElement !== article; anchor = anchor.parentElement) {
      const parent = anchor.parentElement;
      const layout = getComputedStyle(parent);
      if (!['flex', 'inline-flex'].includes(layout.display) || !['row', 'row-reverse'].includes(layout.flexDirection)) continue;
      if (node.parentElement !== parent || node.nextElementSibling !== anchor) anchor.before(node);
      return true;
    }
    return false;
  }

  function readTweet(article) {
    const time = ownTweetElement(article, 'a[href*="/status/"] time');
    const id = time?.closest('a')?.pathname.match(/\/status\/(\d+)$/)?.[1];
    const text = ownTweetElement(article, '[data-testid="tweetText"]')?.innerText.trim() ?? '';
    return { article, id, text };
  }

  function clearMark(article) {
    article.classList.remove('xbf-analyzed', 'xbf-flagged', 'xbf-collapsed');
    article.querySelectorAll('.xbf-controls, :scope > .xbf-summary').forEach(node => node.remove());
  }

  function badge(probability) {
    const node = element('span', 'xbf-badge');
    node.innerHTML = bot;
    node.toggleAttribute('data-bot', probability >= BOT_THRESHOLD);
    node.append(document.createTextNode(`${Math.round(probability * 100)}%`));
    node.title = `${probability >= BOT_THRESHOLD ? 'Probably bot. ' : ''}Estimated likelihood of AI or bot authorship, based on text only.`;
    node.setAttribute('aria-label', `${node.title} ${Math.round(probability * 100)}%.`);
    return node;
  }

  function expansionButton(id, expanded) {
    const button = element('button', 'xbf-expand', expanded ? 'Collapse' : 'Show');
    button.type = 'button';
    button.setAttribute('aria-label', expanded ? 'Collapse reply' : 'Show reply');
    button.setAttribute('aria-expanded', String(expanded));
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (expanded) view.expanded.delete(id);
      else view.expanded.add(id);
      clearMark(button.closest('article'));
      schedule();
    });
    return button;
  }

  function mark({ article, id }) {
    const probability = results.get(`${view.id}:${id}`);
    if (!view.enabled || probability === undefined) return clearMark(article);
    const existing = article.querySelector('.xbf-controls');
    if (existing) {
      placeInHeader(article, existing);
      return;
    }
    const controls = element('div', 'xbf-ui xbf-controls');
    controls.append(badge(probability));
    if (!placeInHeader(article, controls)) return;
    const flagged = probability >= BOT_THRESHOLD;
    article.classList.add('xbf-analyzed');
    article.classList.toggle('xbf-flagged', flagged);
    if (mode !== 'collapse' || !flagged) return;
    controls.append(expansionButton(id, true));

    const summary = element('div', 'xbf-ui xbf-summary');
    const avatar = ownTweetElement(article, '[data-testid^="UserAvatar-"] img');
    if (avatar) {
      const image = element('img', '');
      image.src = avatar.src;
      image.alt = '';
      summary.append(image);
    }
    const name = ownTweetElement(article, '[data-testid="User-Name"] a');
    const author = element('a', 'xbf-author', name?.textContent || 'Reply');
    if (name) author.href = name.href;
    summary.append(author, badge(probability), expansionButton(id, false));
    summary.addEventListener('click', event => event.stopPropagation());
    article.append(summary);
    article.classList.toggle('xbf-collapsed', !view.expanded.has(id));
  }

  function toggle() {
    view.enabled = !view.enabled;
    view.error = '';
    scan();
  }

  function toggleButton(main) {
    const button = element('button', 'xbf-ui xbf-toggle');
    button.type = 'button';
    button.innerHTML = botOff;
    if (placeInHeader(main, button)) return button;
  }

  function updateToggle(main) {
    document.querySelectorAll('.xbf-toggle, .xbf-error').forEach(node => {
      if (node.closest('article') !== main) node.remove();
    });
    if (!main) return;
    let button = main.querySelector('.xbf-toggle');
    if (button) placeInHeader(main, button);
    if (!button) {
      button = toggleButton(main);
      if (!button) return;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      });
    }
    const busy = view.enabled && pending.size > 0 && !view.error;
    const label = view.enabled ? 'Bot reply filter on. Click to turn off.' : 'Bot reply filter off. Click to turn on.';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(view.enabled));
    button.setAttribute('aria-busy', String(busy));
    button.title = view.error || (busy ? 'Analyzing replies…' : label);
    button.toggleAttribute('data-error', Boolean(view.error));
    let error = main.querySelector('.xbf-error');
    if (!view.error || !view.enabled) return error?.remove();
    if (!error) {
      error = element('div', 'xbf-ui xbf-error');
      error.setAttribute('role', 'status');
      const actions = ownTweetElement(main, '[role="group"]');
      if (actions) actions.after(error);
      else main.append(error);
    }
    if (error.textContent !== view.error) error.textContent = view.error;
  }

  async function classify(reply) {
    const startedIn = view;
    const key = `${startedIn.id}:${reply.id}`;
    pending.add(key);
    try {
      const response = await chrome.runtime.sendMessage({ type: 'classify', original: startedIn.original, reply: reply.text });
      if (response?.error) throw new Error(response.error);
      if (!Number.isFinite(response?.probability) || response.probability < 0 || response.probability > 1) {
        throw new Error('Invalid result. Toggle off and on to retry.');
      }
      // Finish in-flight requests even when disabled, so toggling never duplicates them.
      results.set(key, response.probability);
    } catch (error) {
      startedIn.error = error.message || 'Could not analyze replies. Toggle off and on to retry.';
    } finally {
      pending.delete(key);
      schedule();
    }
  }

  function scan() {
    const id = location.pathname.match(/^\/[^/]+\/status\/(\d+)\/?$/)?.[1] ?? null;
    if (id !== view.id) {
      view = { id, enabled: false, original: null, error: '', excluded: new Set(), expanded: new Set() };
      document.querySelectorAll('.xbf-analyzed').forEach(clearMark);
    }
    const primary = document.querySelector('[data-testid="primaryColumn"]');
    const tweets = [...(primary?.querySelectorAll('article[data-testid="tweet"]') ?? [])].map(readTweet);
    const mainIndex = id ? tweets.findIndex(item => item.id === id) : -1;
    const main = tweets[mainIndex]?.article;
    if (main) {
      view.original = tweets[mainIndex].text;
      for (const item of tweets.slice(0, mainIndex + 1)) view.excluded.add(item.id);
    }
    updateToggle(main);
    if (!id || view.original === null || !primary) return;

    // A heading inside a later timeline cell starts a new section, such as recommendations.
    const boundary = [...primary.querySelectorAll('[data-testid="cellInnerDiv"] h2')].find(heading =>
      main ? Boolean(main.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) : true);
    for (const item of tweets) {
      // X can reuse an article element for a different tweet while scrolling.
      if (item.article.dataset.xbfTweet !== item.id) {
        clearMark(item.article);
        item.article.dataset.xbfTweet = item.id ?? '';
      }
      if (boundary && (boundary.compareDocumentPosition(item.article) & Node.DOCUMENT_POSITION_FOLLOWING)) view.excluded.add(item.id);
      if (!item.id || view.excluded.has(item.id)) continue;
      mark(item);
      const key = `${view.id}:${item.id}`;
      if (view.enabled && !view.error && item.text && !results.has(key) && !pending.has(key) && pending.size < 3) {
        void classify(item);
      }
    }
    updateToggle(main);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = setTimeout(() => {
      scheduled = null;
      scan();
    }, 100);
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.navigation?.addEventListener('currententrychange', schedule);
  window.addEventListener('popstate', schedule);
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type !== 'mode') return;
    mode = message.mode === 'collapse' ? 'collapse' : 'mark';
    document.querySelectorAll('.xbf-analyzed').forEach(clearMark);
    schedule();
  });
  chrome.runtime.sendMessage({ type: 'settings' }).then(settings => {
    mode = settings?.mode === 'collapse' ? 'collapse' : 'mark';
    schedule();
  }).catch(schedule);
  schedule();
})();
