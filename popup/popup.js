// ======================================================
// Job Monitor LinkedIn & Indeed – POPUP SCRIPT
// Faza 23.0: Sterowanie z poziomu potrójnego paska narzędzi
// ======================================================

// Zatrzymanie pętli pikania po otwarciu interfejsu
chrome.runtime.sendMessage({ type: "STOP_ALARM" }).catch(() => {});

const button = document.getElementById("toggle");
const keywordsTextarea = document.getElementById("keywords");
const saveKeywordsButton = document.getElementById("saveKeywords");
const statusDiv = document.getElementById("status");
const historyDiv = document.getElementById("history");
const liveStatusDiv = document.getElementById("live-status");
const clearCacheButton = document.getElementById("clearCache");
const clearHistoryButton = document.getElementById("clearHistory");

// -----------------------------------------------
// 1. Aktualizacja wyglądu przycisku (ON / OFF)
// -----------------------------------------------
function updateButton(enabled) {
  button.textContent = enabled ? "ON" : "OFF";
  if (enabled) {
    button.style.backgroundColor = "#e7f5ff";
    button.style.borderColor = "#a5d8ff";
    button.style.color = "#228be6";
  } else {
    button.style.backgroundColor = "#f1f3f5";
    button.style.borderColor = "#ced4da";
    button.style.color = "#495057";
  }
}

// -----------------------------------------------
// 2. Render historii ofert
// -----------------------------------------------
function renderHistory(items) {
  if (!items || items.length === 0) {
    historyDiv.textContent = "Brak zapisanych ofert.";
    return;
  }

  historyDiv.innerHTML = "";

  items.forEach(item => {
    const container = document.createElement("div");
    container.className = "history-item";

    const titleEl = document.createElement("div");
    titleEl.className = "history-title";
    titleEl.textContent = item.title || "(brak tytułu)";

    const snippetEl = document.createElement("div");
    snippetEl.className = "history-snippet";
    snippetEl.textContent = item.snippet ? item.snippet.slice(0, 140) + "..." : "(brak opisu)";

    const linkEl = document.createElement("a");
    linkEl.className = "history-link";
    linkEl.href = item.url;
    linkEl.textContent = "Otwórz ofertę";
    linkEl.target = "_blank";

    const dateEl = document.createElement("div");
    dateEl.className = "history-date";
    if (item.matchedAt) {
      try {
        const d = new Date(item.matchedAt);
        dateEl.textContent = new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "medium" }).format(d);
      } catch (e) {
        dateEl.textContent = item.matchedAt;
      }
    }

    container.appendChild(titleEl);
    container.appendChild(snippetEl);
    container.appendChild(linkEl);
    container.appendChild(dateEl);

    historyDiv.appendChild(container);
  });
}

// -----------------------------------------------
// 3. Wczytanie stanu początkowego
// -----------------------------------------------
chrome.storage.sync.get(
  {
    monitoringEnabled: false,
    keywords: "designer, design, packaging, artwork, prepress, dtp, production, fmcg, brand, operator"
  },
  (data) => {
    updateButton(data.monitoringEnabled);
    keywordsTextarea.value = data.keywords;
  }
);

// Wczytanie historii
chrome.storage.local.get({ matchedHistory: [] }, (store) => {
  renderHistory(store.matchedHistory || []);
});

// Wczytanie statusu LIVE
chrome.storage.local.get({ extensionStatus: "Oczekiwanie na akcję..." }, (store) => {
  if (liveStatusDiv) {
    liveStatusDiv.textContent = store.extensionStatus;
  }
});

// -----------------------------------------------
// 4. Przełącznik ON/OFF (Przycisk: "ON/OFF")
// -----------------------------------------------
button.addEventListener("click", () => {
  chrome.storage.sync.get({ monitoringEnabled: false }, (data) => {
    const newValue = !data.monitoringEnabled;

    chrome.storage.sync.set({ monitoringEnabled: newValue }, () => {
      updateButton(newValue);

      chrome.tabs.query({ pinned: true }, (tabs) => {
        if (!tabs || tabs.length === 0) return;
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_MONITORING" }).catch(() => {});
        });
      });
    });
  });
});

// -----------------------------------------------
// 5. Zapis słów kluczowych
// -----------------------------------------------
saveKeywordsButton.addEventListener("click", () => {
  const value = keywordsTextarea.value || "";
  chrome.storage.sync.set({ keywords: value }, () => {
    statusDiv.textContent = "Słowa kluczowe zapisane.";
    setTimeout(() => { statusDiv.textContent = ""; }, 2000);
  });
});

// -----------------------------------------------
// 6. Reset pamięci podręcznej (Przycisk: "RESET")
// -----------------------------------------------
clearCacheButton.addEventListener("click", () => {
  chrome.storage.local.set({ lastSeenIds: [], lastSeenIndeedIds: [] }, () => {
    const timestamp = new Date().toLocaleTimeString();
    if (liveStatusDiv) {
      liveStatusDiv.textContent = `[${timestamp}] Pamięć cache wyczyszczona. Reskan klastra...`;
    }
    chrome.tabs.query({ pinned: true }, (tabs) => {
      if (tabs && tabs.length > 0) {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_MONITORING" }).catch(() => {});
        });
      }
    });
  });
});

// -----------------------------------------------
// 7. Czyszczenie Historii (Przycisk: "CLEAN")
// -----------------------------------------------
clearHistoryButton.addEventListener("click", () => {
  if (confirm("Czy na pewno chcesz bezpowrotnie usunąć całą historię znalezionych ofert?")) {
    chrome.storage.local.set({ matchedHistory: [] }, () => {
      const timestamp = new Date().toLocaleTimeString();
      if (liveStatusDiv) {
        liveStatusDiv.textContent = `[${timestamp}] Historia ofert została wyczyszczona.`;
      }
      renderHistory([]);
    });
  }
});

// -----------------------------------------------
// 8. Odbiór statusów diagnostycznych LIVE + Live-Refresh historii
// -----------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STATUS_UPDATE" && liveStatusDiv) {
    liveStatusDiv.textContent = msg.text;
  }
  if (msg.type === "HISTORY_UPDATED") {
    chrome.storage.local.get({ matchedHistory: [] }, (store) => {
      renderHistory(store.matchedHistory || []);
    });
  }
});