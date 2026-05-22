(() => {
  const MARK_STYLE = "data-tinyradi-style";
  const MARK_SCRIPT = "data-tinyradi-script";
  const STORAGE_KEY_ENABLED = "tinyradiEnabled";
  const STORAGE_KEY_SHOW_FOOTER = "tinyradiShowFooter";
  const ROOT_SHOW_FOOTER_DATASET = "showFooter";

  const getSettings = () =>
    new Promise((resolve) => {
      chrome.storage.local.get(
        {
          [STORAGE_KEY_ENABLED]: true,
          [STORAGE_KEY_SHOW_FOOTER]: true,
        },
        (result) => {
          resolve({
            enabled: result[STORAGE_KEY_ENABLED] !== false,
            showFooter: result[STORAGE_KEY_SHOW_FOOTER] !== false,
          });
        }
      );
    });

  const applyShowFooter = (showFooter) => {
    if (!document.documentElement) {
      return;
    }
    if (showFooter) {
      document.documentElement.dataset[ROOT_SHOW_FOOTER_DATASET] = "1";
      return;
    }
    document.documentElement.dataset[ROOT_SHOW_FOOTER_DATASET] = "0";
  };

  const watchShowFooter = () => {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY_SHOW_FOOTER)) {
        return;
      }
      const nextValue = changes[STORAGE_KEY_SHOW_FOOTER]?.newValue !== false;
      applyShowFooter(nextValue);
    });
  };

  const routing = () => {
    const isDirectRadikoTop = location.hash === '#!/top';
    if (isDirectRadikoTop) {
      location.replace('/');
      return true;
    }
  
    const isSomeRadikoPage = location.hash !== '';
    if (isSomeRadikoPage) {
      window.addEventListener('hashchange', () => {
        const isTop = location.hash === '' || location.hash === '#!/top';
        if (isTop) {
          if (window.opener) {
            window.close();
            return;
          }
          location.replace('/');
        }
      });
      return true;
    }
  };

  const toExtensionUrl = (path) => {
    if (!path) return null;
    if (/^(https?:|chrome-extension:)/.test(path)) return path;
    return chrome.runtime.getURL(path.replace(/^\//, ""));
  };

  const injectFavicon = (path) => {
    const href = toExtensionUrl(path);
    if (!href) return;

    let link = document.querySelector(`link[rel="icon"][${MARK_STYLE}]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute(MARK_STYLE, "1");
      document.head.appendChild(link);
    }
    link.href = href;
  };

  const injectCss = (paths) => {
    paths.forEach((path) => {
      const href = toExtensionUrl(path);
      if (!href) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute(MARK_STYLE, "1");
      document.head.appendChild(link);
    });
  };

  const injectModuleScript = (path) => {
    const src = toExtensionUrl(path);
    if (!src) return;

    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.setAttribute(MARK_SCRIPT, "1");
    document.body.appendChild(script);
  };

  const replaceBodyWithExtensionApp = async () => {
    const outerCommentNodes = [];

    for (let node = document.documentElement.previousSibling; node && node.nodeType === Node.COMMENT_NODE; node = node.previousSibling) {
      outerCommentNodes.push(node);
    }

    outerCommentNodes.forEach(node => node.remove());

    const extensionPageUrl = chrome.runtime.getURL("index.html");
    const htmlText = await fetch(extensionPageUrl).then((res) => res.text());

    const parser = new DOMParser();
    const appDoc = parser.parseFromString(htmlText, "text/html");

    const appFavicon = appDoc.querySelector('link[rel="icon"][href]');
    const faviconPath = appFavicon?.getAttribute("href");

    const appCss = appDoc.querySelectorAll('link[rel="stylesheet"][href]');
    const cssPaths = Array.from(appCss)
      .map((el) => el.getAttribute("href"))
      .filter(Boolean);

    const appModuleScript = appDoc.querySelector('script[type="module"][src]');
    const moduleScriptPath = appModuleScript?.getAttribute("src");

    appFavicon?.remove();
    appCss.forEach((el) => el.remove());
    appModuleScript?.remove();

    document.documentElement.innerHTML = appDoc.documentElement.innerHTML;

    injectFavicon(faviconPath);
    injectCss(cssPaths);
    injectModuleScript(moduleScriptPath);
  };

  getSettings()
    .then((settings) => {
      if (!settings.enabled) {
        return;
      }
      if (routing()) {
        return;
      }
      return replaceBodyWithExtensionApp().then(() => {
        applyShowFooter(settings.showFooter);
        watchShowFooter();
      });
    })
    .catch((error) => {
      console.error("[TinyRadi] Failed to replace body:", error);
    });
})();
