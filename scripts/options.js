const STORAGE_KEYS = {
  GLOBAL_ENABLED: 'globalEnabled',
  EXCLUDED: 'excludedHosts',
  ALLOWED: 'allowedHosts',
  MODE: 'mode',
  INTENSITY: 'intensity',
};

const DEFAULTS = {
  [STORAGE_KEYS.GLOBAL_ENABLED]: true,
  [STORAGE_KEYS.EXCLUDED]: [],
  [STORAGE_KEYS.ALLOWED]: [],
  [STORAGE_KEYS.MODE]: 'all',
  [STORAGE_KEYS.INTENSITY]: 1,
};

function load() {
  return new Promise((resolve) => chrome.storage.sync.get(DEFAULTS, resolve));
}

function save(patch) {
  return new Promise((resolve) => chrome.storage.sync.set(patch, resolve));
}

function normalizeHost(input) {
  if (!input) return '';
  let s = String(input).trim().toLowerCase();
  // Allow pasting full URLs or hosts
  try {
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    const url = new URL(s);
    return url.hostname.replace(/^\./, '');
  } catch (_) {
    // Fallback: basic hostname characters only
    return s.replace(/^\./, '').replace(/[^a-z0-9.-]/g, '');
  }
}

function uniq(list) {
  return Array.from(new Set((list || []).filter(Boolean)));
}

function renderList(hosts) {
  const ul = document.getElementById('host-list');
  ul.innerHTML = '';
  (hosts || []).forEach((host, idx) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.className = 'host';
    left.textContent = host;
    const btn = document.createElement('button');
    btn.textContent = 'Видалити';
    btn.addEventListener('click', async () => {
      const data = await load();
      const next = (data.excludedHosts || []).slice();
      next.splice(idx, 1);
      await save({ [STORAGE_KEYS.EXCLUDED]: next });
      renderList(next);
    });
    li.append(left, btn);
    ul.appendChild(li);
  });
}

function renderAllowList(hosts) {
  const ul = document.getElementById('allow-host-list');
  ul.innerHTML = '';
  (hosts || []).forEach((host, idx) => {
    const li = document.createElement('li');
    const left = document.createElement('span');
    left.className = 'host';
    left.textContent = host;
    const btn = document.createElement('button');
    btn.textContent = 'Видалити';
    btn.addEventListener('click', async () => {
      const data = await load();
      const next = (data.allowedHosts || []).slice();
      next.splice(idx, 1);
      await save({ [STORAGE_KEYS.ALLOWED]: next });
      renderAllowList(next);
    });
    li.append(left, btn);
    ul.appendChild(li);
  });
}

async function init() {
  const globalEnabled = document.getElementById('global-enabled');
  const hostInput = document.getElementById('host-input');
  const addHost = document.getElementById('add-host');
  const allowHostInput = document.getElementById('allow-host-input');
  const addAllowHost = document.getElementById('add-allow-host');
  const exportBtn = document.getElementById('export');
  const importInput = document.getElementById('import');
  const clearBtn = document.getElementById('clear');
  const modeInputs = Array.from(document.querySelectorAll('input[name="mode"]'));
  const intensityRange = document.getElementById('intensity');
  const intensityValue = document.getElementById('intensity-value');

  const data = await load();
  globalEnabled.checked = !!data.globalEnabled;
  renderList(data.excludedHosts || []);
  renderAllowList(data.allowedHosts || []);

  // Mode
  const mode = (data.mode || 'all');
  modeInputs.forEach((el) => { el.checked = el.value === mode; });

  // Intensity
  const i = Math.max(0, Math.min(1, Number(data.intensity ?? 1)));
  intensityRange.value = String(Math.round(i * 100));
  intensityValue.textContent = `${Math.round(i * 100)}%`;

  globalEnabled.addEventListener('change', async (e) => {
    await save({ [STORAGE_KEYS.GLOBAL_ENABLED]: !!e.target.checked });
  });

  addHost.addEventListener('click', async () => {
    const host = normalizeHost(hostInput.value);
    if (!host) return;
    const data = await load();
    const next = uniq([...(data.excludedHosts || []), host]);
    await save({ [STORAGE_KEYS.EXCLUDED]: next });
    hostInput.value = '';
    renderList(next);
  });

  hostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addHost.click();
    }
  });

  exportBtn.addEventListener('click', async () => {
    const data = await load();
    const payload = {
      globalEnabled: !!data.globalEnabled,
      excludedHosts: data.excludedHosts || [],
      allowedHosts: data.allowedHosts || [],
      mode: data.mode || 'all',
      intensity: Math.max(0, Math.min(1, Number(data.intensity ?? 1))),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dark-mode-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importInput.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const payload = {};
      if (typeof data.globalEnabled === 'boolean') payload[STORAGE_KEYS.GLOBAL_ENABLED] = data.globalEnabled;
      if (Array.isArray(data.excludedHosts)) payload[STORAGE_KEYS.EXCLUDED] = uniq(data.excludedHosts.map(normalizeHost));
      if (Array.isArray(data.allowedHosts)) payload[STORAGE_KEYS.ALLOWED] = uniq(data.allowedHosts.map(normalizeHost));
      if (data.mode === 'all' || data.mode === 'whitelist') payload[STORAGE_KEYS.MODE] = data.mode;
      if (typeof data.intensity === 'number') payload[STORAGE_KEYS.INTENSITY] = Math.max(0, Math.min(1, Number(data.intensity)));
      await save(payload);
      const latest = await load();
      globalEnabled.checked = !!latest.globalEnabled;
      renderList(latest.excludedHosts || []);
      renderAllowList(latest.allowedHosts || []);
      modeInputs.forEach((el) => { el.checked = el.value === (latest.mode || 'all'); });
      const i = Math.max(0, Math.min(1, Number(latest.intensity ?? 1)));
      intensityRange.value = String(Math.round(i * 100));
      intensityValue.textContent = `${Math.round(i * 100)}%`;
    } catch (_) {
      alert('Не вдалося імпортувати файл налаштувань.');
    } finally {
      e.target.value = '';
    }
  });

  clearBtn.addEventListener('click', async () => {
    if (!confirm('Видалити всі виключення?')) return;
    await save({ [STORAGE_KEYS.EXCLUDED]: [] });
    renderList([]);
  });

  addAllowHost.addEventListener('click', async () => {
    const host = normalizeHost(allowHostInput.value);
    if (!host) return;
    const data = await load();
    const next = uniq([...(data.allowedHosts || []), host]);
    await save({ [STORAGE_KEYS.ALLOWED]: next });
    allowHostInput.value = '';
    renderAllowList(next);
  });

  allowHostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addAllowHost.click();
    }
  });

  modeInputs.forEach((el) => {
    el.addEventListener('change', async () => {
      const selected = modeInputs.find((i) => i.checked)?.value || 'all';
      await save({ [STORAGE_KEYS.MODE]: selected });
    });
  });

  intensityRange.addEventListener('input', async (e) => {
    const pct = Math.max(0, Math.min(100, Number(e.target.value)));
    intensityValue.textContent = `${pct}%`;
    await save({ [STORAGE_KEYS.INTENSITY]: pct / 100 });
  });
}

document.addEventListener('DOMContentLoaded', init);
