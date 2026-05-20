(() => {
  const MARK_STYLE = "data-tinyradi-style";
  const MARK_SCRIPT = "data-tinyradi-script";

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

  replaceBodyWithExtensionApp().catch((error) => {
    console.error("[TinyRadi] Failed to replace body:", error);
  });
})();
