const key = document.querySelector('#api-key');
const reveal = document.querySelector('#reveal');
const status = document.querySelector('#status');
const modes = [...document.querySelectorAll('[name="mode"]')];

async function init() {
  const settings = await chrome.storage.local.get({ apiKey: '', mode: 'mark' });
  key.value = settings.apiKey;
  modes.find(input => input.value === settings.mode)?.click();

  key.addEventListener('input', () => save({ apiKey: key.value.trim() }));
  for (const input of modes) {
    input.addEventListener('change', async () => {
      if (!await save({ mode: input.value })) return;
      const tabs = await chrome.tabs.query({ url: 'https://x.com/*' });
      await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { type: 'mode', mode: input.value }).catch(() => {})));
    });
  }
}

async function save(settings) {
  try {
    await chrome.storage.local.set(settings);
    status.textContent = 'Saved';
    return true;
  } catch {
    status.textContent = 'Could not save. Try again.';
    return false;
  }
}

reveal.addEventListener('click', () => {
  const visible = key.type === 'password';
  key.type = visible ? 'text' : 'password';
  reveal.textContent = visible ? 'Hide' : 'Show';
  reveal.setAttribute('aria-label', visible ? 'Hide API key' : 'Show API key');
  reveal.setAttribute('aria-pressed', String(visible));
});

init().catch(() => { status.textContent = 'Could not load settings. Reopen the popup.'; });
