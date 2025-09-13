const STORAGE_KEYS = {
  GLOBAL_ENABLED: 'globalEnabled',
  EXCLUDED: 'excludedHosts',
};

const DEFAULTS = {
  [STORAGE_KEYS.GLOBAL_ENABLED]: true,
  [STORAGE_KEYS.EXCLUDED]: [],
};

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0]);
    });
  });
}

function getHostFromUrl(url) {
  try {
    return new URL(url).hostname || '';
  } catch (e) {
    return '';
  }
}

function loadStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULTS, (res) => resolve(res));
  });
}

function saveStorage(patch) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(patch, () => resolve());
  });
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

async function refreshUI() {
  const tab = await getActiveTab();
  const host = tab ? getHostFromUrl(tab.url) : '';
  const { globalEnabled, excludedHosts } = await loadStorage();

  const globalToggle = document.getElementById('global-toggle');
  const excludeToggle = document.getElementById('exclude-toggle');
  const siteInfo = document.getElementById('site-info');

  globalToggle.checked = !!globalEnabled;
  const isExcluded = (excludedHosts || []).some((h) => h === host || (host && host.endsWith('.' + h)));
  excludeToggle.checked = isExcluded;

  if (host) {
    siteInfo.textContent = `Поточний сайт: ${host}`;
  } else {
    siteInfo.textContent = 'Поточний сайт: невідомо';
  }
}

async function applyChangesAndNotify() {
  const tab = await getActiveTab();
  if (tab && tab.id != null) {
    // Ask content script to re-evaluate settings; swallow absence of receiver
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'recheck-dark-mode' }, () => {
        // Access lastError to prevent "Unchecked runtime.lastError" noise
        void chrome.runtime.lastError;
      });
    } catch (_) {
      // Ignore tabs where messaging is not allowed (e.g., chrome://)
    }
  }
}

async function onGlobalToggleChange(ev) {
  const checked = !!ev.target.checked;
  await saveStorage({ [STORAGE_KEYS.GLOBAL_ENABLED]: checked });
  await applyChangesAndNotify();
}

async function onExcludeToggleChange(ev) {
  const tab = await getActiveTab();
  const host = tab ? getHostFromUrl(tab.url) : '';
  if (!host) return;

  const { excludedHosts } = await loadStorage();
  const list = Array.isArray(excludedHosts) ? excludedHosts.slice() : [];

  const idxExact = list.findIndex((h) => h === host);
  const currentlyExcluded = idxExact !== -1;

  if (ev.target.checked) {
    // add host to exclusions
    if (!currentlyExcluded) list.push(host);
  } else {
    // remove exact host; also remove parent domains if they equal host
    if (currentlyExcluded) list.splice(idxExact, 1);
  }
  await saveStorage({ [STORAGE_KEYS.EXCLUDED]: uniq(list) });
  await applyChangesAndNotify();
}

document.addEventListener('DOMContentLoaded', async () => {
  await refreshUI();
  document.getElementById('global-toggle').addEventListener('change', onGlobalToggleChange);
  document.getElementById('exclude-toggle').addEventListener('change', onExcludeToggleChange);
});
