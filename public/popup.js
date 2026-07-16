(() => {
  const STORAGE_KEY_ENABLED = "tinyradiEnabled";
  const STORAGE_KEY_SHOW_FOOTER = "tinyradiShowFooter";
  const STORAGE_KEY_SHOW_NOW_PLAYING = "tinyradiShowNowPlaying";
  const RULESET_ID = "ruleset";

  const enabledCheckbox = document.getElementById("enabled-toggle");
  const showFooterCheckbox = document.getElementById("show-footer-toggle");
  const showNowPlayingCheckbox = document.getElementById("show-now-playing-toggle");
  const status = document.getElementById("status");

  if (
    !(enabledCheckbox instanceof HTMLInputElement) ||
    !(showFooterCheckbox instanceof HTMLInputElement) ||
    !(showNowPlayingCheckbox instanceof HTMLInputElement) ||
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
          [STORAGE_KEY_SHOW_FOOTER]: true,
          [STORAGE_KEY_SHOW_NOW_PLAYING]: true,
        },
        (result) => {
          resolve({
            enabled: result[STORAGE_KEY_ENABLED] !== false,
            showFooter: result[STORAGE_KEY_SHOW_FOOTER] !== false,
            showNowPlaying: result[STORAGE_KEY_SHOW_NOW_PLAYING] !== false,
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

  const setShowFooter = (showFooter) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_SHOW_FOOTER]: showFooter }, () => {
        resolve();
      });
    });

  const setShowNowPlaying = (showNowPlaying) =>
    new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY_SHOW_NOW_PLAYING]: showNowPlaying }, () => {
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
      showFooterCheckbox.checked = settings.showFooter;
      showNowPlayingCheckbox.checked = settings.showNowPlaying;
      showFooterCheckbox.disabled = !settings.enabled;
      showNowPlayingCheckbox.disabled = !settings.enabled;
      setStatus(settings.enabled ? "現在: 有効" : "現在: 無効");
    } catch (error) {
      setStatus("状態の読み込みに失敗しました");
      console.error("[TinyRadi] Failed to initialize popup:", error);
    }
  };

  enabledCheckbox.addEventListener("change", async () => {
    const enabled = enabledCheckbox.checked;
    enabledCheckbox.disabled = true;
    showFooterCheckbox.disabled = true;
    showNowPlayingCheckbox.disabled = true;

    try {
      await setEnabled(enabled);
      await syncRuleset(enabled);
      setStatus(enabled ? "現在: 有効" : "現在: 無効");
      showFooterCheckbox.disabled = !enabled;
      showNowPlayingCheckbox.disabled = !enabled;
    } catch (error) {
      enabledCheckbox.checked = !enabled;
      showFooterCheckbox.disabled = !enabledCheckbox.checked;
      showNowPlayingCheckbox.disabled = !enabledCheckbox.checked;
      setStatus("切り替えに失敗しました");
      console.error("[TinyRadi] Failed to toggle enabled state:", error);
    } finally {
      enabledCheckbox.disabled = false;
    }
  });

  showFooterCheckbox.addEventListener("change", async () => {
    const showFooter = showFooterCheckbox.checked;
    showFooterCheckbox.disabled = true;

    try {
      await setShowFooter(showFooter);
    } catch (error) {
      showFooterCheckbox.checked = !showFooter;
      setStatus("下部表示設定の保存に失敗しました");
      console.error("[TinyRadi] Failed to toggle footer visibility:", error);
    } finally {
      showFooterCheckbox.disabled = !enabledCheckbox.checked;
    }
  });

  showNowPlayingCheckbox.addEventListener("change", async () => {
    const showNowPlaying = showNowPlayingCheckbox.checked;
    showNowPlayingCheckbox.disabled = true;

    try {
      await setShowNowPlaying(showNowPlaying);
    } catch (error) {
      showNowPlayingCheckbox.checked = !showNowPlaying;
      setStatus("再生画面表示設定の保存に失敗しました");
      console.error("[TinyRadi] Failed to toggle now playing visibility:", error);
    } finally {
      showNowPlayingCheckbox.disabled = !enabledCheckbox.checked;
    }
  });

  init();
})();
