(() => {
  const STORAGE_KEY = "tinyradiEnabled";
  const RULESET_ID = "ruleset";

  const checkbox = document.getElementById("enabled-toggle");
  const status = document.getElementById("status");

  if (!(checkbox instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
    return;
  }

  const setStatus = (message) => {
    status.textContent = message;
  };

  const getEnabled = () =>
    new Promise((resolve) => {
      chrome.storage.local.get({ [STORAGE_KEY]: true }, (result) => {
        resolve(result[STORAGE_KEY] !== false);
      });
    });

  const setEnabled = (enabled) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: enabled }, () => {
        resolve();
      });
    });

  const syncRuleset = (enabled) =>
    new Promise((resolve, reject) => {
      chrome.declarativeNetRequest.updateEnabledRulesets(
        {
          enableRulesetIds: enabled ? [RULESET_ID] : [],
          disableRulesetIds: enabled ? [] : [RULESET_ID],
        },
        () => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve();
        }
      );
    });

  const init = async () => {
    try {
      const enabled = await getEnabled();
      checkbox.checked = enabled;
      setStatus(enabled ? "現在: 有効" : "現在: 無効");
    } catch (error) {
      setStatus("状態の読み込みに失敗しました");
      console.error("[TinyRadi] Failed to initialize popup:", error);
    }
  };

  checkbox.addEventListener("change", async () => {
    const enabled = checkbox.checked;
    checkbox.disabled = true;

    try {
      await setEnabled(enabled);
      await syncRuleset(enabled);
      setStatus(enabled ? "現在: 有効" : "現在: 無効");
    } catch (error) {
      checkbox.checked = !enabled;
      setStatus("切り替えに失敗しました");
      console.error("[TinyRadi] Failed to toggle enabled state:", error);
    } finally {
      checkbox.disabled = false;
    }
  });

  init();
})();
