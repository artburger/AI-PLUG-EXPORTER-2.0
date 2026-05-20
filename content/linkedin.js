// ======================================================
// Job Monitor LinkedIn – CONTENT SCRIPT
// Faza 23.9: Pełna automatyzacja – usunięto paski ostrzegawcze audio
// ======================================================

let observer = null;
let autoScrollTimeout = null;
let assignedTabIndex = 0;
let isIndexLoaded = false;

function extractJobIds() {
  const ids = new Set();
  const selectors = [
    'a[href*="/jobs/view/"]',
    'a[href*="/jobs/collections/"]',
    '[data-job-id]',
    '.job-card-container',
    '.jobs-search-results__list-item'
  ];

  selectors.forEach(selector => {
    const elements = Array.from(document.querySelectorAll(selector));
    elements.forEach(el => {
      if (el.href) {
        const match = el.href.match(/\/jobs\/(view|collections)\/(\d+)/);
        if (match && match[2]) ids.add(match[2]);
      }
      const dataId = el.getAttribute('data-job-id') || el.getAttribute('data-id');
      if (dataId && /^\d+$/.test(dataId)) ids.add(dataId);
    });
  });

  return Array.from(ids);
}

function sendJobIdsToBackground() {
  if (!chrome.runtime || !chrome.runtime.id) return;
  const ids = extractJobIds();
  if (ids.length > 0) {
    chrome.runtime.sendMessage({ type: "JOB_IDS", ids }).catch(() => {});
  }
}

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') return; // Ciche pominięcie, jeśli brak interakcji (Windows i tak wyda dźwięk systemowy)
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

function performVirtualAction() {
  if (!chrome.runtime || !chrome.runtime.id) return;
  chrome.runtime.sendMessage({ type: "AUTO_SCROLL_TRIGGERED", platform: "LinkedIn" }).catch(() => {});

  const updateButton = Array.from(document.querySelectorAll('button')).find(b =>
    b.textContent.toLowerCase().includes('nowe') || b.textContent.toLowerCase().includes('new jobs')
  );
  if (updateButton) {
    updateButton.click();
    setTimeout(sendJobIdsToBackground, 1000);
    setupLinearScheduler();
    return;
  }

  const scrollContainer = document.querySelector('.jobs-search-results-list') || document.querySelector('.scaffold-layout__list') || window;
  if (scrollContainer && typeof scrollContainer.scrollBy === 'function') {
    scrollContainer.scrollBy({ top: 60, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollContainer && typeof scrollContainer.scrollBy === 'function') {
        scrollContainer.scrollBy({ top: -60, behavior: 'smooth' });
      }
    }, 800);
  }
  setupLinearScheduler();
}

function setupLinearScheduler(isFirstStart = false) {
  if (autoScrollTimeout) clearTimeout(autoScrollTimeout);

  if (isFirstStart) {
    const initialDelay = (assignedTabIndex + 1) * 10000;
    autoScrollTimeout = setTimeout(performVirtualAction, initialDelay);
  } else {
    const fixedCycle = 60000;
    const safetyMicroJitter = Math.random() * 1500;
    autoScrollTimeout = setTimeout(performVirtualAction, fixedCycle + safetyMicroJitter);
  }
}

function init() {
  console.log("LinkedIn tracker: START");
  sendJobIdsToBackground();

  if (!observer) {
    observer = new MutationObserver(() => { sendJobIdsToBackground(); });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (!isIndexLoaded) {
    chrome.runtime.sendMessage({ type: "REQUEST_TAB_INDEX" }, (response) => {
      if (response && typeof response.index === 'number') {
        assignedTabIndex = response.index;
        isIndexLoaded = true;
      }
      setupLinearScheduler(true);
    });
  } else {
    setupLinearScheduler(false);
  }
}

function stop() {
  console.log("LinkedIn tracker: STOP");
  if (observer) { observer.disconnect(); observer = null; }
  if (autoScrollTimeout) { clearTimeout(autoScrollTimeout); autoScrollTimeout = null; }
}

try {
  chrome.storage.sync.get({ monitoringEnabled: false }, (data) => { if (data.monitoringEnabled) init(); });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.monitoringEnabled) {
      if (changes.monitoringEnabled.newValue === true) init();
      else stop();
    }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_MONITORING") {
      chrome.storage.sync.get({ monitoringEnabled: false }, (data) => { if (data.monitoringEnabled) init(); else stop(); });
    }
    if (msg.type === "PLAY_ALERT_SOUND") playNotificationSound();
  });
} catch (e) {}