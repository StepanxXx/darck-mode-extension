// Content script: applies dark mode based on global toggle and per-site exclusions.

(function () {
  const STORAGE_KEYS = {
    GLOBAL_ENABLED: 'globalEnabled',
    EXCLUDED: 'excludedHosts',
    ALLOWED: 'allowedHosts',
    MODE: 'mode', // 'all' | 'whitelist'
    INTENSITY: 'intensity', // 0..1
  };

  const DEFAULTS = {
    [STORAGE_KEYS.GLOBAL_ENABLED]: true,
    [STORAGE_KEYS.EXCLUDED]: [],
    [STORAGE_KEYS.ALLOWED]: [],
    [STORAGE_KEYS.MODE]: 'all',
    [STORAGE_KEYS.INTENSITY]: 1,
  };

  // Fast attribute toggle to avoid re-creating nodes repeatedly
  function setDarkMode(on) {
    const html = document.documentElement;
    if (on) {
      if (html.getAttribute('data-dark-mode') !== 'on') {
        html.setAttribute('data-dark-mode', 'on');
      }
    } else {
      if (html.hasAttribute('data-dark-mode')) {
        html.removeAttribute('data-dark-mode');
      }
    }
  }

  function getHost() {
    try {
      return location.hostname || '';
    } catch (e) {
      return '';
    }
  }

  function includesHost(list, host) {
    if (!host) return false;
    // Exact hostname match or parent-domain match if explicitly stored
    return list.some((h) => h && (host === h || host.endsWith('.' + h)));
  }

  function readSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULTS, (res) => resolve(res));
    });
  }

  async function evaluateAndApply() {
    try {
      const { globalEnabled, excludedHosts, allowedHosts, mode, intensity } = await readSettings();
      const host = getHost();
      let enabled = !!globalEnabled;
      if (enabled) {
        if ((mode || 'all') === 'whitelist') {
          enabled = includesHost(allowedHosts || [], host);
        } else {
          enabled = !includesHost(excludedHosts || [], host);
        }
      }
      setDarkMode(enabled);
      const i = Math.max(0, Math.min(1, Number(intensity ?? 1)));
      try { document.documentElement.style.setProperty('--dm-i', String(i)); } catch (_) {}
    } catch (e) {
      // Fail-safe: turn off if something goes wrong
      setDarkMode(false);
    }
  }

  // Respond to popup messages requesting re-evaluation
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'recheck-dark-mode') {
      evaluateAndApply();
      // Acknowledge to keep the port from closing without a response
      try { sendResponse({ ok: true }); } catch (_) {}
    }
  });

  // Also react to storage changes (e.g., options changed elsewhere)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (
      changes[STORAGE_KEYS.GLOBAL_ENABLED] ||
      changes[STORAGE_KEYS.EXCLUDED] ||
      changes[STORAGE_KEYS.ALLOWED] ||
      changes[STORAGE_KEYS.MODE] ||
      changes[STORAGE_KEYS.INTENSITY]
    ) {
      evaluateAndApply();
    }
  });

  // Initial apply ASAP
  evaluateAndApply();
})();
