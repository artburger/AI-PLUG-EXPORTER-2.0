// ======================================================
// Job Monitor – BACKGROUND SCRIPT
// Faza 23.8: Pełna integracja powiadomień OS z bezpośrednimi URL
// ======================================================

console.log("Job Monitor Multi-Site Cluster Engine Active");

let flashInterval = null;
let persistentAlarmInterval = null;
let memoryHistoryCache = null;
let tabRefreshTimers = {};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.matchedHistory) {
    memoryHistoryCache = changes.matchedHistory.newValue || [];
  }
});

function ensureHistoryLoaded(callback) {
  if (memoryHistoryCache !== null) {
    callback();
  } else {
    chrome.storage.local.get({ matchedHistory: [] }, (store) => {
      memoryHistoryCache = store.matchedHistory || [];
      callback();
    });
  }
}

function updateLiveStatus(text) {
  const timestamp = new Date().toLocaleTimeString();
  const fullText = `[${timestamp}] ${text}`;
  chrome.storage.local.set({ extensionStatus: fullText });
  chrome.runtime.sendMessage({ type: "STATUS_UPDATE", text: fullText }).catch(() => {});
}

function refreshBadgeState() {
  chrome.storage.sync.get({ monitoringEnabled: false }, (data) => {
    if (data.monitoringEnabled) {
      if (!flashInterval) {
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#0A66C2" });
      }
    } else {
      stopFlashing();
      chrome.action.setBadgeText({ text: "OFF" });
      chrome.action.setBadgeBackgroundColor({ color: "#666666" });
    }
  });
}

function startFlashing() {
  if (flashInterval) return;
  chrome.action.setBadgeBackgroundColor({ color: "#FF3B30" });
  let showText = true;
  flashInterval = setInterval(() => {
    chrome.action.setBadgeText({ text: showText ? "SCAN" : "" });
    showText = !showText;
  }, 300);
}

function stopFlashing() {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
  refreshBadgeState();
}

function startLoopingAlarm() {
  if (persistentAlarmInterval) return;
  updateLiveStatus("[Klaster] 🔥 Nowe oferty! Alarm dźwiękowy aktywny.");
  playAlarmOnAllPinnedTabs();
  persistentAlarmInterval = setInterval(() => {
    playAlarmOnAllPinnedTabs();
  }, 4000);
}

function playAlarmOnAllPinnedTabs() {
  chrome.tabs.query({ pinned: true }, (tabs) => {
    if (tabs && tabs.length > 0) {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type: "PLAY_ALERT_SOUND" }).catch(() => {});
      });
    }
  });
}

function getKeywords(callback) {
  chrome.storage.sync.get(
    { keywords: "packaging, prepress, dtp, dieline, print, fmcg, extendscript, color management, illustrator" },
    (data) => {
      const raw = data.keywords || "";
      const list = raw.split(",").map(k => k.trim()).filter(k => k.length > 0);
      callback(list);
    }
  );
}

function withMonitoring(callback) {
  chrome.storage.sync.get({ monitoringEnabled: false }, (data) => {
    if (!data.monitoringEnabled) return;
    callback();
  });
}

async function fetchLinkedInDetails(jobId) {
  try {
    const url = `https://www.linkedin.com/jobs/view/${jobId}/`;
    const response = await fetch(url);
    const html = await response.text();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const snippetMatch = html.match(/<meta name="description" content="(.*?)"/i);

    try {
      const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (jsonLdMatch) {
        const jsonLd = JSON.parse(jsonLdMatch[1].trim());
        if (jsonLd && jsonLd.datePosted) {
          const postedDate = new Date(jsonLd.datePosted);
          if ((new Date() - postedDate) / (1000 * 60 * 60) > 24) {
            return { title: null, snippet: null, isValid: false, reason: "Wiek > 24h" };
          }
        }
      }
    } catch (e) {}

    const jsonAppCount = html.match(/"applicantCount"\s*:\s*([1-9]\d*)/) || html.match(/&quot;applicantCount&quot;\s*:\s*([1-9]\d*)/);
    const jsonNumApp = html.match(/"numApplicants"\s*:\s*([1-9]\d*)/) || html.match(/&quot;numApplicants&quot;\s*:\s*([1-9]\d*)/);
    if (jsonAppCount || jsonNumApp) {
      return { title: null, snippet: null, isValid: false, reason: "Posiada aplikantów" };
    }

    return {
      title: titleMatch ? titleMatch[1].replace(" | LinkedIn", "").trim() : null,
      snippet: snippetMatch ? snippetMatch[1].trim() : null,
      isValid: true
    };
  } catch (e) {
    return { title: null, snippet: null, isValid: false, reason: "Błąd sieci fetch" };
  }
}

function matchesKeywords(text, keywords) {
  if (!text) return false;
  return keywords.some(kw => {
    const escapedKw = kw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const regex = new RegExp(escapedKw, "i");
    return regex.test(text);
  });
}

// NOWOŚĆ: Generowanie dymków Windows 11 zawierających dokładny adres URL w opisie
function showNotification(job, source) {
  const targetUrl = source === "linkedin"
    ? `https://www.linkedin.com/jobs/view/${job.id}/`
    : `https://www.indeed.com/viewjob?jk=${job.id}`;

  // Identyfikatorem powiadomienia staje się bezpośredni URL oferty
  const notificationId = targetUrl;

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icon.png",
    title: `[🔥 KLASTER] ${source.toUpperCase()}`,
    message: `${job.title}\n\nKliknij, aby otworzyć ofertę natychmiast.`,
    contextMessage: targetUrl, // Wyświetla pełny, zielony/szary adres URL na dole dymka w Windows 11
    priority: 2
  });
}

// NOWOŚĆ: Bezbłędny i uproszczony odbiorca kliknięć – otwiera dokładnie ten URL, który wywołał powiadomienie
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("http://") || notificationId.startsWith("https://")) {
    chrome.tabs.create({ url: notificationId });
  }
});

function saveMatchedJobsToHistory(jobsArray, source) {
  ensureHistoryLoaded(() => {
    let addedCount = 0;
    jobsArray.forEach(job => {
      const fullId = `${source}_${job.id}`;
      const isDuplicateId = memoryHistoryCache.some(item => item.fullId === fullId);
      if (!isDuplicateId) {
        const entry = {
          fullId: fullId,
          id: job.id,
          title: `[${source.toUpperCase()}] ${job.title}`,
          snippet: job.snippet,
          url: source === "linkedin" ? `https://www.linkedin.com/jobs/view/${job.id}/` : `https://www.indeed.com/viewjob?jk=${job.id}`,
          matchedAt: new Date().toISOString()
        };
        memoryHistoryCache.unshift(entry);
        addedCount++;
        showNotification(job, source);
      }
    });
    if (addedCount > 0) {
      memoryHistoryCache = memoryHistoryCache.slice(0, 100);
      chrome.storage.local.set({ matchedHistory: memoryHistoryCache }, () => {
        chrome.runtime.sendMessage({ type: "HISTORY_UPDATED" }).catch(() => {});
      });
    }
  });
}

function checkAndApplyHardRefresh(tabId, tabIndex, platform) {
  const now = Date.now();
  const threeMinutes = 180000;

  if (!tabRefreshTimers[tabId]) {
    tabRefreshTimers[tabId] = now;
    return;
  }

  if (now - tabRefreshTimers[tabId] >= threeMinutes) {
    updateLiveStatus(`[Klaster] 🔄 Karta #${tabIndex} (${platform}) ➔ Wymuszam CTRL+F5 (Czyszczenie cache)...`);
    tabRefreshTimers[tabId] = now;

    chrome.tabs.reload(tabId, { bypassCache: true }, () => {
      if (chrome.runtime.lastError) {
        console.log("Błąd reloadu karty:", chrome.runtime.lastError.message);
      }
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "STOP_ALARM") {
    if (persistentAlarmInterval) {
      clearInterval(persistentAlarmInterval);
      persistentAlarmInterval = null;
      updateLiveStatus("[System] 🔇 Alarm wyciszony.");
    }
    return;
  }

  if (!sender.tab || !sender.tab.id) return;
  const tabId = sender.tab.id;

  if (msg.type === "REQUEST_TAB_INDEX") {
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab) {
        sendResponse({ index: tab.index });
      }
    });
    return true;
  }

  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    if (!tab.pinned) return;

    const platformLabel = msg.platform || (msg.type === "JOB_IDS" ? "LinkedIn" : "Indeed");
    checkAndApplyHardRefresh(tabId, tab.index, platformLabel);

    if (msg.type === "AUTO_SCROLL_TRIGGERED") {
      updateLiveStatus(`[${platformLabel}] Karta #${tab.index} ➔ Stymulacja DOM.`);
      return;
    }

    if (msg.type === "JOB_IDS") {
      withMonitoring(() => {
        getKeywords(async (KEYWORDS) => {
          const currentIds = msg.ids || [];
          chrome.storage.local.get({ lastSeenIds: [], ignoredJobs: [] }, (store) => {
            const lastSeenIds = store.lastSeenIds || [];
            const ignoredJobs = store.ignoredJobs || [];
            const newIds = currentIds.filter(id => !lastSeenIds.includes(id) && !ignoredJobs.includes(id));

            if (newIds.length === 0) {
              updateLiveStatus(`[LinkedIn] Karta #${tab.index} ➔ Skan pasywny (${currentIds.length} id w cache).`);
              return;
            }

            updateLiveStatus(`[LinkedIn] Karta #${tab.index} ➔ Skan sieciowy ${newIds.length} nowych ofert...`);
            startFlashing();

            (async () => {
              const results = [];
              const concurrentLimit = 4;
              for (let i = 0; i < newIds.length; i += concurrentLimit) {
                const chunk = newIds.slice(i, i + concurrentLimit);
                const promises = chunk.map(async (id) => {
                  const details = await fetchLinkedInDetails(id);
                  if (details.isValid && (matchesKeywords(details.title, KEYWORDS) || matchesKeywords(details.snippet, KEYWORDS))) {
                    return { id, title: details.title, snippet: details.snippet, matches: true };
                  }
                  return null;
                });
                const resolved = await Promise.all(promises);
                results.push(...resolved.filter(r => r !== null));
              }
              stopFlashing();

              const matched = results.filter(r => r.matches);
              if (matched.length > 0) {
                updateLiveStatus(`[LinkedIn] Karta #${tab.index} ➔ 🔥 TRAFIENIE!`);
                saveMatchedJobsToHistory(matched, "linkedin");
                startLoopingAlarm();
              } else {
                updateLiveStatus(`[LinkedIn] Karta #${tab.index} ➔ Zakończono. Brak dopasowań.`);
              }
              chrome.storage.local.set({ lastSeenIds: [...lastSeenIds, ...newIds] });
            })();
          });
        });
      });
    }

    if (msg.type === "INDEED_CARDS") {
      withMonitoring(() => {
        getKeywords((KEYWORDS) => {
          const rawCards = msg.cards || [];
          chrome.storage.local.get({ lastSeenIndeedIds: [], ignoredJobs: [] }, (store) => {
            const lastSeenIndeedIds = store.lastSeenIndeedIds || [];
            const ignoredJobs = store.ignoredJobs || [];
            const newCards = rawCards.filter(card => !lastSeenIndeedIds.includes(card.id) && !ignoredJobs.includes(card.id));

            if (newCards.length === 0) {
              updateLiveStatus(`[Indeed] Karta #${tab.index} ➔ Skan pasywny (${rawCards.length} id w cache).`);
              return;
            }

            updateLiveStatus(`[Indeed] Karta #${tab.index} ➔ Filtrowanie ${newCards.length} nowych pozycji...`);
            startFlashing();

            const matchedJobs = [];
            const processedIds = [];

            newCards.forEach(card => {
              processedIds.push(card.id);
              if (matchesKeywords(card.title, KEYWORDS) || matchesKeywords(card.snippet, KEYWORDS)) {
                matchedJobs.push(card);
              }
            });

            stopFlashing();

            if (matchedJobs.length > 0) {
              updateLiveStatus(`[Indeed] Karta #${tab.index} ➔ 🔥 TRAFIENIE!`);
              saveMatchedJobsToHistory(matchedJobs, "indeed");
              startLoopingAlarm();
            } else {
              updateLiveStatus(`[Indeed] Karta #${tab.index} ➔ Zakończono. Brak dopasowań.`);
            }

            chrome.storage.local.set({ lastSeenIndeedIds: [...lastSeenIndeedIds, ...processedIds] });
          });
        });
      });
    }
  });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.monitoringEnabled) {
    refreshBadgeState();
    if (changes.monitoringEnabled.newValue === false && persistentAlarmInterval) {
      clearInterval(persistentAlarmInterval);
      persistentAlarmInterval = null;
    }
  }
});

refreshBadgeState();