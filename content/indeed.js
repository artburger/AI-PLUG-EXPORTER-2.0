// ======================================================
// Job Monitor Indeed – CONTENT SCRIPT
// Faza 23.9: Pełna automatyzacja – usunięto paski ostrzegawcze audio
// ======================================================

let indeedObserver = null;
let indeedScrollTimeout = null;
let assignedIndeedTabIndex = 0;
let isIndeedIndexLoaded = false;

function scrapeIndeedCards() {
  if (!chrome.runtime || !chrome.runtime.id) return;

  const cards = Array.from(document.querySelectorAll('.job_seen_beacon') || document.querySelectorAll('[class*="jobCard" i]') || document.querySelectorAll('.tapItem'));
  const payload = [];

  cards.forEach(card => {
    const titleLink = card.querySelector('h2.jobTitle a') || card.querySelector('a[id^="job_"]') || card.querySelector('a[data-jk]');
    if (!titleLink) return;

    const jk = titleLink.getAttribute('data-jk') || card.getAttribute('data-jk') || titleLink.id.replace('job_', '');
    if (!jk) return;

    let title = titleLink.textContent ? titleLink.textContent.trim() : "";
    title = title.replace(/^new\s+/i, '').replace(/^nowe\s+/i, '').trim();

    const snippetEl = card.querySelector('.job-snippet') || card.querySelector('.underLine') || card.querySelector('.heading6') || card.querySelector('[class*="snippet" i]');
    const snippet = snippetEl ? snippetEl.textContent.trim() : "";

    payload.push({ id: jk, title: title, snippet: snippet, dateText: "passed_by_url" });
  });

  if (payload.length > 0) {
    try {
      chrome.runtime.sendMessage({ type: "INDEED_CARDS", cards: payload });
    } catch (e) {}
  }
}

function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.15);
  } catch (e) {}
}

function performIndeedVirtualAction() {
  if (!chrome.runtime || !chrome.runtime.id) { stopIndeed(); return; }
  try {
    chrome.runtime.sendMessage({ type: "AUTO_SCROLL_TRIGGERED", platform: "Indeed" });
  } catch (e) { stopIndeed(); return; }

  const newJobsToast = document.querySelector('[class*="toast" i]') || document.querySelector('[class*="popup" i]');
  if (newJobsToast) {
    const refreshBtn = newJobsToast.querySelector('button') || newJobsToast.querySelector('a');
    if (refreshBtn) { refreshBtn.click(); setupIndeedLinearScheduler(); return; }
  }

  const scrollContainer = document.querySelector('#mosaic-provider-jobcards') || document.querySelector('.jobsearch-LeftPane') || window;
  if (scrollContainer && typeof scrollContainer.scrollBy === 'function') {
    scrollContainer.scrollBy({ top: 60, behavior: 'smooth' });
    setTimeout(() => {
      if (scrollContainer && typeof scrollContainer.scrollBy === 'function') {
        scrollContainer.scrollBy({ top: -60, behavior: 'smooth' });
      }
    }, 800);
  }
  document.body.dispatchEvent(new Event('scroll'));
  setupIndeedLinearScheduler();
}

function setupIndeedLinearScheduler(isFirstStart = false) {
  if (indeedScrollTimeout) clearTimeout(indeedScrollTimeout);

  if (isFirstStart) {
    const initialDelay = (assignedIndeedTabIndex + 1) * 10000;
    indeedScrollTimeout = setTimeout(performIndeedVirtualAction, initialDelay);
  } else {
    const fixedCycle = 60000;
    const safetyMicroJitter = Math.random() * 1500;
    indeedScrollTimeout = setTimeout(performIndeedVirtualAction, fixedCycle + safetyMicroJitter);
  }
}

function initIndeed() {
  console.log("Indeed tracker: START");
  scrapeIndeedCards();
  if (!indeedObserver) {
    indeedObserver = new MutationObserver(() => { scrapeIndeedCards(); });
    indeedObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (!isIndeedIndexLoaded) {
    chrome.runtime.sendMessage({ type: "REQUEST_TAB_INDEX" }, (response) => {
      if (response && typeof response.index === 'number') {
        assignedIndeedTabIndex = response.index;
        isIndeedIndexLoaded = true;
      }
      setupIndeedLinearScheduler(true);
    });
  } else {
    setupIndeedLinearScheduler(false);
  }
}

function stopIndeed() {
  console.log("Indeed tracker: STOP");
  if (indeedObserver) { indeedObserver.disconnect(); indeedObserver = null; }
  if (indeedScrollTimeout) { clearTimeout(indeedScrollTimeout); indeedScrollTimeout = null; }
}

try {
  chrome.storage.sync.get({ monitoringEnabled: false }, (data) => { if (data.monitoringEnabled) initIndeed(); });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.monitoringEnabled) {
      if (changes.monitoringEnabled.newValue === true) initIndeed();
      else stopIndeed();
    }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_MONITORING") {
      chrome.storage.sync.get({ monitoringEnabled: false }, (data) => { if (data.monitoringEnabled) initIndeed(); else stopIndeed(); });
    }
    if (msg.type === "PLAY_ALERT_SOUND") playNotificationSound();
  });
} catch (e) {}