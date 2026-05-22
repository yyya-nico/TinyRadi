(() => {
  const STORAGE_KEY_ENABLED = "tinyradiEnabled";
  const STORAGE_KEY_HIDE_FOOTER = "tinyradiHideFooter";
  const RULESET_ID = "ruleset";

  const enabledCheckbox = document.getElementById("enabled-toggle");
  const hideFooterCheckbox = document.getElementById("hide-footer-toggle");
  const status = document.getElementById("status");

  if (
    !(enabledCheckbox instanceof HTMLInputElement) ||
    !(hideFooterCheckbox instanceof HTMLInputElement) ||
    !(status instanceof HTMLElement)
  ) {
    return;
  }

  const setStatus = (message) => {
    status.textContent = message;
  };

  const getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(
        {
          [STORAGE_KEY_ENABLED]: true,
          [STORAGE_KEY_HIDE_FOOTER]: false,
        },
        (result) => {
          resolve({
            enabled: result[STORAGE_KEY_ENABLED] !== false,
            hideFooter: result[STORAGE_KEY_HIDE_FOOTER] === true,
          });
        }
      );
    });

  const setEnabled = (enabled) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_ENABLED]: enabled }, () => {
        resolve();
      });
    });

  const setHideFooter = (hideFooter) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_HIDE_FOOTER]: hideFooter }, () => {
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
      const settings = await getSettings();
      enabledCheckbox.checked = settings.enabled;
      hideFooterCheckbox.checked = settings.hideFooter;
      hideFooterCheckbox.disabled = !settings.enabled;
      setStatus(settings.enabled ? "現在: 有効" : "現在: 無効");
    } catch (error) {
      setStatus("状態の読み込みに失敗しました");
      console.error("[TinyRadi] Failed to initialize popup:", error);
    }
  };

  enabledCheckbox.addEventListener("change", async () => {
    const enabled = enabledCheckbox.checked;
    enabledCheckbox.disabled = true;
    hideFooterCheckbox.disabled = true;

    try {
      await setEnabled(enabled);
      await syncRuleset(enabled);
      setStatus(enabled ? "現在: 有効" : "現在: 無効");
      hideFooterCheckbox.disabled = !enabled;
    } catch (error) {
      enabledCheckbox.checked = !enabled;
      hideFooterCheckbox.disabled = !enabledCheckbox.checked;
      setStatus("切り替えに失敗しました");
      console.error("[TinyRadi] Failed to toggle enabled state:", error);
    } finally {
      enabledCheckbox.disabled = false;
    }
  });

  hideFooterCheckbox.addEventListener("change", async () => {
    const hideFooter = hideFooterCheckbox.checked;
    hideFooterCheckbox.disabled = true;

    try {
      await setHideFooter(hideFooter);
    } catch (error) {
      hideFooterCheckbox.checked = !hideFooter;
      setStatus("下部表示設定の保存に失敗しました");
      console.error("[TinyRadi] Failed to toggle footer visibility:", error);
    } finally {
      hideFooterCheckbox.disabled = !enabledCheckbox.checked;
    }
  });

  init();
})();
