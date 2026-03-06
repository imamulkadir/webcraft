/* Fullscreen Modal IDE Workspace (vanilla, 3 files)
   - Pick folder via webkitdirectory
   - Show ALL data at once: HTML/HTM -> CSS -> JS -> JSON -> Images
   - Edit opens fullscreen modal (same window)
   - Monaco Editor via CDN AMD loader
   - Live preview with DOMParser rewriting filename-only references to Blob URLs
   - iframe sandbox includes allow-same-origin to permit blob loading
   - ✅ Preview click -> jump + highlight WHOLE BLOCK in editor (robust via source-position injection)
*/

(() => {
  "use strict";

  const SUPPORTED_TEXT_EXT = new Set([
    ".html",
    ".htm",
    ".css",
    ".js",
    ".json",
    ".txt",
    ".md",
  ]);
  const SUPPORTED_IMG_EXT = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
  ]);

  const VOID_TAGS = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);

  // Prefer highlighting these (if a click happens inside nested tags)
  const HIGHLIGHT_TAG_PRIORITY = [
    "img",
    "p",
    "td",
    "th",
    "tr",
    "table",
    "li",
    "ul",
    "ol",
    "section",
    "article",
    "header",
    "footer",
    "main",
    "nav",
    "aside",
    "div",
    "span",
    "font",
    "b",
    "strong",
    "i",
    "em",
    "a",
  ];

  function extOf(name) {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i).toLowerCase() : "";
  }
  function normalizePath(p) {
    return (p || "").replace(/\\/g, "/").replace(/^\/+/, "");
  }
  function basename(p) {
    const n = normalizePath(p);
    const i = n.lastIndexOf("/");
    return i >= 0 ? n.slice(i + 1) : n;
  }
  function isTextPath(path) {
    return SUPPORTED_TEXT_EXT.has(extOf(path));
  }
  function isImagePath(path) {
    return SUPPORTED_IMG_EXT.has(extOf(path));
  }

  function mimeForPath(path) {
    const e = extOf(path);
    if (e === ".html" || e === ".htm") return "text/html";
    if (e === ".css") return "text/css";
    if (e === ".js") return "text/javascript";
    if (e === ".json") return "application/json";
    if (e === ".txt" || e === ".md") return "text/plain";
    if (e === ".png") return "image/png";
    if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
    if (e === ".gif") return "image/gif";
    if (e === ".webp") return "image/webp";
    if (e === ".svg") return "image/svg+xml";
    return "application/octet-stream";
  }

  async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(r.error || new Error("Failed to read file"));
      r.onload = () => resolve(String(r.result ?? ""));
      r.readAsText(file);
    });
  }

  // Workspace in-memory store
  const WS = {
    // path -> { path, name, file_name, file_type, file_blob, kind:'text'|'image', text?:string, size:number }
    files: new Map(),
    // blob url cache by path: path -> url
    urlByPath: new Map(),
    // filename(lower) -> { path, url } for images (first match wins)
    imageByName: new Map(),
    // filename(lower) -> { path, url } for assets (css/js/...)
    assetByName: new Map(),
    // Monaco model cache: path -> model
    models: new Map(),
    // current preview HTML path
    previewHtmlPath: null,
    // current active editor path
    activePath: null,
  };

  // ---------------------------
  // IndexedDB Persistence
  // ---------------------------
  const DB_NAME = "WebCraftDB";
  const DB_VERSION = 1;

  async function initDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("workspace")) {
          db.createObjectStore("workspace", { keyPath: "path" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearDB() {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("workspace", "readwrite");
        const store = tx.objectStore("workspace");
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("Failed to clear DB", err);
    }
  }

  async function saveFileToDB(rec) {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("workspace", "readwrite");
        const store = tx.objectStore("workspace");
        
        // Pick fields carefully so we don't try storing complex objects we can't clone.
        const data = {
          path: rec.path,
          name: rec.name,
          kind: rec.kind,
          size: rec.size,
          file_name: rec.file_name,
          file_type: rec.file_type,
        };
        
        if (rec.kind === "text") {
          data.text = rec.text;
        } else if (rec.file_blob) {
          data.file_blob = rec.file_blob;
        }

        const req = store.put(data);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("Failed to save to DB:", rec.path, err);
    }
  }

  async function loadWorkspaceFromDB() {
    try {
      const db = await initDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction("workspace", "readonly");
        const store = tx.objectStore("workspace");
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn("Failed to load workspace from DB", err);
      return [];
    }
  }

  function revokeAllUrls() {
    for (const url of WS.urlByPath.values()) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    WS.urlByPath.clear();
  }

  function clearWorkspace() {
    for (const m of WS.models.values()) {
      try {
        m.dispose();
      } catch {}
    }
    WS.models.clear();

    revokeAllUrls();
    WS.files.clear();
    WS.imageByName.clear();
    WS.assetByName.clear();
    WS.previewHtmlPath = null;
    WS.activePath = null;
  }

  function ensureBlobUrlForPath(path) {
    const p = normalizePath(path);
    const hit = WS.urlByPath.get(p);
    if (hit) return hit;

    const rec = WS.files.get(p);
    if (!rec) return null;

    const url = URL.createObjectURL(
      new Blob([rec.file_blob || rec.text || ""], { type: rec.file_type || mimeForPath(p) }),
    );
    WS.urlByPath.set(p, url);
    return url;
  }

  function rebuildNameMaps() {
    WS.imageByName.clear();
    WS.assetByName.clear();

    for (const [path, rec] of WS.files.entries()) {
      const nameLower = basename(path).toLowerCase();

      if (rec.kind === "image") {
        if (!WS.imageByName.has(nameLower)) {
          const url = ensureBlobUrlForPath(path);
          if (url) WS.imageByName.set(nameLower, { path, url });
        }
      } else if (rec.kind === "text") {
        const e = extOf(path);
        if (
          e === ".css" ||
          e === ".js" ||
          e === ".json" ||
          e === ".txt" ||
          e === ".md"
        ) {
          if (!WS.assetByName.has(nameLower)) {
            const url = ensureBlobUrlForPath(path);
            if (url) WS.assetByName.set(nameLower, { path, url });
          }
        }
      }
    }
  }

  // UI refs
  const landingEl = document.getElementById("landing");
  const workspaceEl = document.getElementById("workspace");
  const folderPicker = document.getElementById("folderPicker");
  const landingStatus = document.getElementById("landingStatus");

  const backBtn = document.getElementById("backBtn");
  const convMeta = document.getElementById("convMeta");
  const contentSummary = document.getElementById("contentSummary");
  const contentSections = document.getElementById("contentSections");

  const downloadZipBtn = document.getElementById("downloadZipBtn");
  const uploadZipBtn = document.getElementById("uploadZipBtn");

  const openDrawerBtn = document.getElementById("openDrawerBtn");

  // Modal refs
  const ideModal = document.getElementById("ideModal");
  const closeModalBtn = document.getElementById("closeModalBtn");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const refreshPreviewBtn = document.getElementById("refreshPreviewBtn");

  const activeFileName = document.getElementById("activeFileName");
  const activeFilePath = document.getElementById("activeFilePath");
  const editorState = document.getElementById("editorState");
  const previewState = document.getElementById("previewState");

  const editorHost = document.getElementById("editorHost");
  const editorPlaceholder = document.getElementById("editorPlaceholder");
  const imageInspector = document.getElementById("imageInspector");
  const imageInspectorImg = document.getElementById("imageInspectorImg");
  const imageInspectorMeta = document.getElementById("imageInspectorMeta");

  const previewFrame = document.getElementById("previewFrame");
  const noHtmlPreview = document.getElementById("noHtmlPreview");
  const downloadHtmlBtn = document.getElementById("downloadHtmlBtn");
  const downloadZipBtn2 = document.getElementById("downloadZipBtn2");

  const exportZipBtn = document.getElementById("exportZipBtn");

  // ---------------------------
  // Download current preview HTML (rewritten)
  // ---------------------------
  downloadHtmlBtn.addEventListener("click", () => {
    const p = WS.previewHtmlPath || WS.activePath;
    if (!p) return;

    const e = extOf(p);
    if (e !== ".html" && e !== ".htm") return;

    const rawText = getLatestTextForPath(p);
    const blob = new Blob([rawText], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = basename(p);
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }, 2000);
  });

  function setLandingStatus(msg, kind = "neutral") {
    landingStatus.classList.remove("ok", "err");
    if (kind === "ok") landingStatus.classList.add("ok");
    if (kind === "err") landingStatus.classList.add("err");
    landingStatus.textContent = msg;
  }

  function showLanding() {
    landingEl.hidden = false;
    workspaceEl.hidden = true;
    closeModal();
    openDrawerBtn.disabled = WS.files.size === 0;
  }

  function showWorkspace() {
    landingEl.hidden = true;
    workspaceEl.hidden = false;
  }

  // ---------------------------
  // Folder ingest
  // ---------------------------
  async function processFiles(list) {
    try {
      if (!list.length) {
        setLandingStatus("No folder selected.");
        return;
      }

      clearWorkspace();
      await clearDB();

      const supported = [];
      for (const f of list) {
        const rel = normalizePath(f.webkitRelativePath || f.customPath || f.name);
        const e = extOf(rel);
        if (SUPPORTED_TEXT_EXT.has(e) || SUPPORTED_IMG_EXT.has(e)) {
          supported.push({ file: f, path: rel });
        }
      }

      if (!supported.length) {
        setLandingStatus(
          "Folder selected, but no supported files were found.",
          "err",
        );
        return;
      }

      setLandingStatus(`Loading ${supported.length} supported file(s)…`);

      await Promise.all(
        supported.map(async ({ file, path }) => {
          const kind = isImagePath(path) ? "image" : "text";
          const rec = {
            path,
            name: basename(path),
            file_name: file.name,
            file_type: file.type || mimeForPath(path),
            kind,
            size: file.size,
          };
          if (kind === "text") {
            rec.text = await readFileAsText(file);
          } else {
            // For images, store as an ArrayBuffer -> Blob to save into IndexedDB
            const buf = await file.arrayBuffer();
            rec.file_blob = new Blob([buf], { type: rec.file_type });
          }
          WS.files.set(path, rec);
          await saveFileToDB(rec);
        }),
      );

      // Prebuild blob URLs for images and assets (css/js/...)
      for (const [path, rec] of WS.files.entries()) {
        if (rec.kind === "image") {
          ensureBlobUrlForPath(path);
        } else {
          const e = extOf(path);
          if (e !== ".html" && e !== ".htm") {
            ensureBlobUrlForPath(path);
          }
        }
      }

      rebuildNameMaps();
      chooseDefaultPreviewHtml();

      // Render workspace (ALL data at once, ordered)
      renderWorkspaceList();

      // Enable buttons (UI-only)
      if (exportZipBtn) exportZipBtn.disabled = false;

      // Sidebar meta
      convMeta.textContent = `${supported.length} file(s) loaded`;
      contentSummary.textContent = summarizeCounts();

      setLandingStatus(`Loaded ✅ ${supported.length} file(s).`, "ok");
      openDrawerBtn.disabled = false;
      // showWorkspace();
    } catch (err) {
      console.error(err);
      setLandingStatus(
        `Failed to load folder: ${err?.message || String(err)}`,
        "err",
      );
    }
  }

  folderPicker.addEventListener("change", () => {
    processFiles(Array.from(folderPicker.files || []));
  });

  // ---------------------------
  // Drag and drop ingest
  // ---------------------------
  const landingCard = document.querySelector(".landing-card");
  if (landingCard) {
    landingCard.addEventListener("dragover", (e) => {
      e.preventDefault();
      landingCard.classList.add("drag-over");
    });
    
    landingCard.addEventListener("dragleave", (e) => {
      e.preventDefault();
      landingCard.classList.remove("drag-over");
    });
    
    landingCard.addEventListener("drop", async (e) => {
      e.preventDefault();
      landingCard.classList.remove("drag-over");

      if (!e.dataTransfer || !e.dataTransfer.items) return;
      
      const items = Array.from(e.dataTransfer.items)
        .filter(item => item.kind === 'file')
        .map(item => item.webkitGetAsEntry());
      
      const files = [];
      setLandingStatus("Scanning dropped files...");
      
      async function traverse(entry, path = "") {
        if (!entry) return;
        if (entry.isFile) {
          return new Promise(resolve => {
            entry.file(f => {
              Object.defineProperty(f, 'customPath', { value: path + f.name });
              files.push(f);
              resolve();
            });
          });
        } else if (entry.isDirectory) {
          const dirReader = entry.createReader();
          return new Promise(resolve => {
            const readEntries = () => {
              dirReader.readEntries(async entries => {
                if (entries.length === 0) {
                  resolve();
                } else {
                  for (const e of entries) {
                    await traverse(e, path + entry.name + '/');
                  }
                  readEntries();
                }
              });
            };
            readEntries();
          });
        }
      }
      
      for (const entry of items) {
        await traverse(entry);
      }
      
      await processFiles(files);
    });
  }

  let __wsdExporting = false;

  function zipPathForWorkspacePath(p) {
    const n = normalizePath(p);
    const parts = n.split("/").filter(Boolean);
    // Strip the top-level selected folder name
    return parts.length > 1 ? parts.slice(1).join("/") : parts.join("/");
  }

  function getLatestTextForPath(path) {
    const p = normalizePath(path);

    // If Monaco model exists, it's the freshest source
    const model = WS.models.get(p);
    if (model && typeof model.getValue === "function") return model.getValue();

    // Fallback to cached text in WS.files
    const rec = WS.files.get(p);
    return rec?.text ?? "";
  }

  exportZipBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (__wsdExporting) return;
    if (!WS.files.size) return;

    try {
      __wsdExporting = true;
      exportZipBtn.disabled = true;

      if (!window.JSZip) {
        setLandingStatus(
          "JSZip failed to load. Check the CDN script tag.",
          "err",
        );
        return;
      }

      const zip = new window.JSZip();

      for (const rec of WS.files.values()) {
        const zipPath = zipPathForWorkspacePath(rec.path);
        if (!zipPath) continue;

        if (rec.kind === "text") {
          zip.file(zipPath, getLatestTextForPath(rec.path));
        } else if (rec.file_blob) {
          zip.file(zipPath, rec.file_blob);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "project.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      console.error(err);
      setLandingStatus(
        `ZIP export failed: ${err?.message || String(err)}`,
        "err",
      );
    } finally {
      __wsdExporting = false;
      exportZipBtn.disabled = WS.files.size === 0;
    }
  });

  openDrawerBtn.addEventListener("click", () => {
    if (!WS.files.size) return; // safety check
    showWorkspace();
  });

  backBtn.addEventListener("click", () => {
    showLanding();
  });

  // ---------------------------
  // Workspace view rendering
  // ---------------------------
  function summarizeCounts() {
    const paths = Array.from(WS.files.keys());
    const html = paths.filter((p) =>
      [".html", ".htm"].includes(extOf(p)),
    ).length;
    const css = paths.filter((p) => extOf(p) === ".css").length;
    const js = paths.filter((p) => extOf(p) === ".js").length;
    const json = paths.filter((p) => extOf(p) === ".json").length;
    const img = paths.filter((p) => isImagePath(p)).length;
    return `HTML: ${html} • CSS: ${css} • JS: ${js} • JSON: ${json} • Images: ${img}`;
  }

  function chooseDefaultPreviewHtml() {
    const all = Array.from(WS.files.keys());
    const htmls = all.filter((p) => [".html", ".htm"].includes(extOf(p)));
    const index = htmls.find((p) => basename(p).toLowerCase() === "index.html");
    WS.previewHtmlPath = index || htmls[0] || null;
  }

  function groupOrdered() {
    const all = Array.from(WS.files.values());

    const html = [];
    const css = [];
    const js = [];
    const json = [];
    const images = [];

    for (const rec of all) {
      const e = extOf(rec.path);
      if (e === ".html" || e === ".htm") html.push(rec);
      else if (e === ".css") css.push(rec);
      else if (e === ".js") js.push(rec);
      else if (e === ".json") json.push(rec);
      else if (rec.kind === "image") images.push(rec);
    }

    const byName = (a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    html.sort(byName);
    css.sort(byName);
    js.sort(byName);
    json.sort(byName);
    images.sort(byName);

    return [
      { key: "html", title: "HTML", items: html },
      { key: "css", title: "CSS", items: css },
      { key: "js", title: "JavaScript", items: js },
      { key: "json", title: "JSON", items: json },
      { key: "images", title: "Images", items: images },
    ];
  }

  function fileIconForExt(e) {
    if (e === ".html" || e === ".htm") return "🌐";
    if (e === ".css") return "🎨";
    if (e === ".js") return "⚙️";
    if (e === ".json") return "🧾";
    return "📄";
  }

  function humanSize(bytes) {
    const b = Number(bytes || 0);
    if (b < 1024) return `${b} B`;
    const kb = b / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  }

  function renderWorkspaceList() {
    contentSections.innerHTML = "";
    const groups = groupOrdered();

    for (const g of groups) {
      if (!g.items.length) continue;

      const sec = document.createElement("section");
      sec.className = "section";

      const head = document.createElement("div");
      head.className = "section-title";
      head.innerHTML = `<span>${g.title}</span><span class="section-count">${g.items.length}</span>`;
      sec.appendChild(head);

      for (const rec of g.items) {
        const row = document.createElement("div");
        row.className = "row";

        const thumb = document.createElement("div");
        thumb.className = "thumb";

        if (rec.kind === "image") {
          const url = ensureBlobUrlForPath(rec.path);
          const img = document.createElement("img");
          img.src = url || "";
          img.alt = rec.name;
          thumb.appendChild(img);
        } else {
          const t = document.createElement("span");
          t.className = "ticon";
          t.textContent = fileIconForExt(extOf(rec.path));
          thumb.appendChild(t);
        }

        const main = document.createElement("div");
        main.className = "row-main";

        const name = document.createElement("div");
        name.className = "row-name";
        name.textContent = rec.name;

        const meta = document.createElement("div");
        meta.className = "row-meta";
        meta.innerHTML = `
          <span>Size: ${humanSize(rec.size)}</span>
          <span>Warning: 0</span>
        `;

        main.appendChild(name);
        main.appendChild(meta);

        const actions = document.createElement("div");
        actions.className = "row-actions";

        const primaryBtn = document.createElement("button");
        primaryBtn.className = "small-btn";
        primaryBtn.type = "button";

        if (rec.kind === "image") {
          primaryBtn.title = "View";
          primaryBtn.textContent = "👁";
          primaryBtn.addEventListener("click", () => openImageViewer(rec.path));
        } else {
          primaryBtn.title = "Edit";
          primaryBtn.textContent = "✎";
          primaryBtn.addEventListener("click", () =>
            openEditorForPath(rec.path),
          );
        }

        const openBtn = document.createElement("button");
        openBtn.className = "small-btn";
        openBtn.type = "button";
        openBtn.title = "Open";
        openBtn.textContent = "↗";
        openBtn.addEventListener("click", () => {
          const p = normalizePath(rec.path);
          const e = extOf(p);

          if (e === ".html" || e === ".htm") {
            const rec2 = WS.files.get(p);
            const rewritten = rewriteHtmlForPreview(rec2?.text || "", "", false);

            const blob = new Blob([rewritten], { type: "text/html" });
            const url = URL.createObjectURL(blob);

            window.open(url, "_blank", "noopener");
            setTimeout(() => {
              try {
                URL.revokeObjectURL(url);
              } catch {}
            }, 15000);
            return;
          }

          const url = ensureBlobUrlForPath(p);
          if (!url) return;
          window.open(url, "_blank", "noopener");
        });

        actions.appendChild(primaryBtn);
        actions.appendChild(openBtn);

        row.appendChild(thumb);
        row.appendChild(main);
        row.appendChild(actions);

        sec.appendChild(row);
      }

      contentSections.appendChild(sec);
    }
  }

  // ---------------------------
  // Modal IDE (Monaco + Preview)
  // ---------------------------
  let monacoReady = false;
  let monaco = null;
  let editor = null;
  let previewUpdateTimer = null;

  // Highlight decoration state
  let currentHighlightDecos = [];

  function loadMonaco() {
    if (monacoReady) return Promise.resolve(monaco);

    return new Promise((resolve, reject) => {
      const loaderUrl =
        "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js";
      const s = document.createElement("script");
      s.src = loaderUrl;
      s.async = true;
      s.onload = () => {
        try {
          // eslint-disable-next-line no-undef
          require.config({
            paths: {
              vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs",
            },
          });
          // eslint-disable-next-line no-undef
          require(["vs/editor/editor.main"], () => {
            // eslint-disable-next-line no-undef
            monaco = window.monaco;
            monacoReady = true;
            resolve(monaco);
          });
        } catch (e) {
          reject(e);
        }
      };
      s.onerror = () => reject(new Error("Failed to load Monaco loader"));
      document.head.appendChild(s);
    });
  }

  function languageForPath(path) {
    const e = extOf(path);
    if (e === ".html" || e === ".htm") return "html";
    if (e === ".css") return "css";
    if (e === ".js") return "javascript";
    if (e === ".json") return "json";
    if (e === ".md") return "markdown";
    if (e === ".txt") return "plaintext";
    return "plaintext";
  }

  function initEditor() {
    if (editor) return;

    editor = monaco.editor.create(editorHost, {
      value: "",
      language: "plaintext",
      theme: "vs-dark",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily:
        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      smoothScrolling: true,
      scrollBeyondLastLine: false,
      renderLineHighlight: "line",
      wordWrap: "on",
      readOnly: false,
      domReadOnly: false,
    });

    editor.onDidChangeModelContent(() => {
      const p = WS.activePath;
      if (!p) return;

      const model = WS.models.get(p);
      if (!model) return;

      const rec = WS.files.get(p);
      if (rec && rec.kind === "text") {
        rec.text = model.getValue();
        // Fire and forget save to IDB so it persists on reload
        saveFileToDB(rec).catch(console.warn);
      }

      // ✅ Debounce preview update (wait for typing to stop + 300ms)
      if (previewUpdateTimer) clearTimeout(previewUpdateTimer);

      previewUpdateTimer = setTimeout(() => {
        const e = extOf(p);

        if (e === ".html" || e === ".htm") {
          WS.previewHtmlPath = p;
          updatePreview(p);
        } else {
          if (WS.previewHtmlPath) updatePreview(WS.previewHtmlPath);
        }
      }, 150);
    });
  }

  function getOrCreateModel(path) {
    const p = normalizePath(path);
    const hit = WS.models.get(p);
    if (hit) return hit;

    const rec = WS.files.get(p);
    const val = rec?.kind === "text" ? (rec.text ?? "") : "";
    const lang = languageForPath(p);

    const uri = monaco.Uri.parse(`inmemory://model/${encodeURIComponent(p)}`);
    const model = monaco.editor.createModel(val, lang, uri);
    WS.models.set(p, model);
    return model;
  }

  function setModalHeader(path) {
    const p = normalizePath(path);
    activeFileName.textContent = basename(p);
    activeFilePath.textContent = p;
    activeFilePath.title = p;
  }

  function setEditorMode(mode, stateText = "—") {
    editorHost.style.display = mode === "editor" ? "block" : "none";
    editorPlaceholder.hidden = mode !== "placeholder";
    imageInspector.hidden = mode !== "image";
    editorState.textContent = stateText;
  }

  function openModal() {
    ideModal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    ideModal.hidden = true;
    document.body.style.overflow = "";
    WS.activePath = null;
  }

  closeModalBtn.addEventListener("click", closeModal);
  ideModal.addEventListener("click", (e) => {
    if (e.target === ideModal) closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (!ideModal.hidden && e.key === "Escape") closeModal();
  });

  undoBtn.addEventListener("click", () => {
    if (!editor) return;
    editor.trigger("ui", "undo", null);
    editor.focus();
  });
  redoBtn.addEventListener("click", () => {
    if (!editor) return;
    editor.trigger("ui", "redo", null);
    editor.focus();
  });
  refreshPreviewBtn.addEventListener("click", () => {
    if (WS.previewHtmlPath) updatePreview(WS.previewHtmlPath);
  });

  function openEditorForPath(path) {
    const p = normalizePath(path);
    const rec = WS.files.get(p);
    if (!rec || rec.kind !== "text") return;

    setModalHeader(p);
    openModal();

    loadMonaco()
      .then(() => {
        initEditor();

        WS.activePath = p;

        const model = getOrCreateModel(p);
        editor.setModel(model);

        const lang = languageForPath(p);
        setEditorMode(
          "editor",
          `${lang} • ${Math.max(1, model.getLineCount())} lines`,
        );

        editor.updateOptions({ readOnly: false, domReadOnly: false });
        setTimeout(() => editor.focus(), 0);

        const e = extOf(p);
        if (e === ".html" || e === ".htm") {
          WS.previewHtmlPath = p;
          noHtmlPreview.hidden = true;
          updatePreview(p);
        } else if (WS.previewHtmlPath) {
          noHtmlPreview.hidden = true;
          updatePreview(WS.previewHtmlPath);
        } else {
          noHtmlPreview.hidden = false;
          previewState.textContent = "—";
          previewFrame.srcdoc = emptyPreviewDoc("No HTML selected.");
        }
      })
      .catch((err) => {
        console.error(err);
        setEditorMode("placeholder", "Editor failed to load");
      });
  }

  function openImageViewer(path) {
    const p = normalizePath(path);
    const rec = WS.files.get(p);
    if (!rec || rec.kind !== "image") return;

    setModalHeader(p);
    openModal();
    WS.activePath = p;

    const url = ensureBlobUrlForPath(p);
    imageInspectorImg.src = url || "";
    imageInspectorImg.alt = rec.name;
    imageInspectorMeta.textContent = p;

    setEditorMode("image", "View only");

    if (WS.previewHtmlPath) {
      noHtmlPreview.hidden = true;
      updatePreview(WS.previewHtmlPath);
    } else {
      noHtmlPreview.hidden = false;
      previewState.textContent = "—";
      previewFrame.srcdoc = emptyPreviewDoc("No HTML selected.");
    }
  }

  function emptyPreviewDoc(msg) {
    const safe = String(msg || "");
    return `<!doctype html><html><head><meta charset="utf-8"></head>
      <body style="background:#0a0d14;color:#cbd5e1;font-family:system-ui;margin:18px;">${safe}</body></html>`;
  }

  function updatePreview(htmlPath) {
    const p = normalizePath(htmlPath);
    const rec = WS.files.get(p);
    if (!rec || rec.kind !== "text") {
      previewState.textContent = "Unable to preview";
      previewFrame.srcdoc = emptyPreviewDoc("Unable to preview.");
      previewFrame.removeAttribute("data-loaded-path");
      return;
    }

    // Capture current scroll
    let sx = 0, sy = 0;
    try {
      const win = previewFrame.contentWindow;
      if (win) {
        sx = win.scrollX;
        sy = win.scrollY;
      }
    } catch (e) {}

    rebuildNameMaps();

    const rewritten = rewriteHtmlForPreview(rec.text ?? "", rec.text ?? "");
    
    // Switch to blob URLs for bit-for-bit rendering parity with the "Open" (↗) tab
    const oldUrl = previewFrame.getAttribute("data-preview-url");
    if (oldUrl) {
      try { URL.revokeObjectURL(oldUrl); } catch {}
    }

    const blob = new Blob([rewritten], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    
    previewFrame.setAttribute("data-preview-url", url);
    previewFrame.src = url;

    // Restore scroll after load
    const restore = () => {
      try {
        previewFrame.contentWindow.scrollTo(sx, sy);
      } catch (e) {}
    };

    // We use multiple triggers for the best chance of restoration after layout settling
    previewFrame.onload = restore;
    setTimeout(restore, 0);
    setTimeout(restore, 30);
    setTimeout(restore, 100);

    previewState.textContent = `Rendering ${basename(p)}`;
  }

  // -----------------------------------------
  // ✅ Preview click -> jump + highlight (robust)
  // -----------------------------------------
  function clearHighlight() {
    if (!editor) return;
    currentHighlightDecos = editor.deltaDecorations(currentHighlightDecos, []);
  }

  function highlightEditorRangeByOffsets(startOffset, endOffset) {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const s = clampInt(startOffset, 0, model.getValueLength());
    const e = clampInt(endOffset, s, model.getValueLength());

    const startPos = model.getPositionAt(s);
    const endPos = model.getPositionAt(e);

    // Requires a CSS rule in styles.css, e.g.
    // .wsd-monaco-block-highlight { background: rgba(255, 212, 59, 0.18); outline: 1px solid rgba(255, 212, 59, 0.35); }
    currentHighlightDecos = editor.deltaDecorations(currentHighlightDecos, [
      {
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column,
        ),
        options: {
          isWholeLine: false,
          className: "wsd-monaco-block-highlight",
        },
      },
    ]);

    editor.revealRangeInCenter(
      new monaco.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column,
      ),
      monaco.editor.ScrollType.Smooth,
    );
    editor.setSelection(
      new monaco.Range(
        startPos.lineNumber,
        startPos.column,
        endPos.lineNumber,
        endPos.column,
      ),
    );
    editor.focus();
  }

  function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(min, Math.min(max, x));
  }

  function findElementRangeFromStart(html, startIndex, tagName) {
    const htmlLen = html.length;
    const start = clampInt(startIndex, 0, htmlLen);
    const tag = String(tagName || "").toLowerCase();

    // Find end of opening tag
    const gt = html.indexOf(">", start);
    if (gt === -1) return { start, end: Math.min(start + 200, htmlLen) };

    const openTagText = html.slice(start, gt + 1);
    const selfClosing =
      /\/\s*>$/.test(openTagText) || VOID_TAGS.has(tag) || tag === "img";

    if (selfClosing) {
      return { start, end: gt + 1 };
    }

    // Scan forward for matching closing tag (simple stack by tag)
    let depth = 1;
    const re = /<\/?([A-Za-z][A-Za-z0-9:-]*)(\s[^<>]*?)?>/g;
    re.lastIndex = gt + 1;

    while (true) {
      const m = re.exec(html);
      if (!m) break;

      const raw = m[0];
      const t = (m[1] || "").toLowerCase();
      const isClose = raw.startsWith("</");
      const isSelfClose = /\/\s*>$/.test(raw) || VOID_TAGS.has(t);

      if (t !== tag) continue;

      if (!isClose && !isSelfClose) {
        depth++;
        continue;
      }
      if (isClose) {
        depth--;
        if (depth === 0) {
          return { start, end: m.index + raw.length };
        }
      }
    }

    // Fallback: highlight to next block break / line
    const nl = html.indexOf("\n", gt + 1);
    return { start, end: nl === -1 ? Math.min(gt + 1, htmlLen) : nl };
  }

  // Listen for preview messages (postMessage from srcdoc)
  window.addEventListener("message", (ev) => {
    const data = ev && ev.data;
    if (!data || data.__wsd_type !== "wsd-preview-click") return;

    // Only apply when modal is open + editor exists + we have an HTML preview file
    if (ideModal.hidden) return;
    if (!editor) return;

    // Ensure we highlight inside the current HTML model (previewHtmlPath)
    const htmlPath = WS.previewHtmlPath;
    if (!htmlPath) return;

    // If user is currently viewing a different text file, switch to HTML automatically
    const currentModelPath = WS.activePath;
    if (
      currentModelPath !== htmlPath &&
      WS.files.get(htmlPath)?.kind === "text"
    ) {
      // keep modal open; just swap model
      WS.activePath = htmlPath;
      setModalHeader(htmlPath);

      const model = getOrCreateModel(htmlPath);
      editor.setModel(model);

      const lang = languageForPath(htmlPath);
      setEditorMode(
        "editor",
        `${lang} • ${Math.max(1, model.getLineCount())} lines`,
      );
    }

    const model = editor.getModel();
    if (!model) return;

    const html = model.getValue();
    const start = Number(data.start);
    const tag = String(data.tag || "").toLowerCase();
    if (!Number.isFinite(start) || start < 0) return;

    const range = findElementRangeFromStart(html, start, tag);
    highlightEditorRangeByOffsets(range.start, range.end);
  });

  // ---------------------------
  // HTML rewrite for preview
  // ---------------------------
  function tokenizeOpeningTags(sourceHtml) {
    // Produces a list of opening tags in source order with their start indices.
    // Skips closing tags and comments/doctype.
    const tokens = [];
    const re = /<([A-Za-z][A-Za-z0-9:-]*)(\s[^<>]*?)?>/g;

    while (true) {
      const m = re.exec(sourceHtml);
      if (!m) break;

      const raw = m[0];
      const idx = m.index;

      // Skip if closing tag
      if (raw.startsWith("</")) continue;

      // Skip comments / doctype / processing instructions
      const c1 = sourceHtml[idx + 1];
      if (c1 === "!" || c1 === "?") continue;

      const tag = (m[1] || "").toLowerCase();
      tokens.push({ tag, index: idx, raw });
    }
    return tokens;
  }

  function injectSourcePositions(doc, sourceHtml) {
    // Strategy:
    // 1) Tokenize opening tags from *original* HTML.
    // 2) Walk parsed DOM elements in document order.
    // 3) Assign the next matching token index to each element with same tag.
    // This is very stable for Word-exported HTML (your sample).
    const tokens = tokenizeOpeningTags(sourceHtml);
    if (!tokens.length) return;

    const els = Array.from(doc.querySelectorAll("*"));
    let cursor = 0;

    for (const el of els) {
      const tag = el.tagName ? el.tagName.toLowerCase() : "";
      if (!tag) continue;

      // Find next token with same tag
      let found = null;
      for (let i = cursor; i < tokens.length; i++) {
        if (tokens[i].tag === tag) {
          found = tokens[i];
          cursor = i + 1;
          break;
        }
      }
      if (!found) continue;

      el.setAttribute("data-wsd-start", String(found.index));
      el.setAttribute("data-wsd-tag", tag);

      // For images: also store filename-only for extra resiliency (optional)
      if (tag === "img") {
        const src = (el.getAttribute("src") || "").trim();
        if (src) el.setAttribute("data-wsd-srcfile", basename(src));
      }
    }
  }

  function buildPreviewClickBridgeScript() {
    // In iframe:
    // - find best ancestor to highlight (block/priority tags)
    // - postMessage({start, tag}) to parent
    return `
(function(){
  function closestWithStart(node){
    if(!node) return null;
    var el = node.nodeType === 1 ? node : (node.parentElement || null);
    while(el && el !== document.documentElement){
      if(el.hasAttribute && el.hasAttribute('data-wsd-start')) return el;
      el = el.parentElement;
    }
    return null;
  }

  function pickHighlightElement(target){
    var el = closestWithStart(target);
    if(!el) return null;

    // --- choose best by priority ---
    var cur = el;
    var best = el;
    var bestRank = 999999;

    function rank(tag){
      tag = String(tag||'').toLowerCase();
      var arr = ["img","p","td","th","tr","table","li","ul","ol","section","article","header","footer","main","nav","aside","div","span","font","b","strong","i","em","a"];
      var i = arr.indexOf(tag);
      return i === -1 ? 999999 : i;
    }

    while(cur && cur !== document.documentElement){
      if(cur.hasAttribute && cur.hasAttribute('data-wsd-start')){
        var r = rank(cur.getAttribute('data-wsd-tag') || cur.tagName);
        if(r < bestRank){
          best = cur;
          bestRank = r;
          if(r === 0) break;
        }
      }
      cur = cur.parentElement;
    }
    return best;
  }

  function onClick(e){
    var el = pickHighlightElement(e.target);
    if(!el) return;

    var start = parseInt(el.getAttribute('data-wsd-start'), 10);
    if(!isFinite(start)) return;
    var tag = (el.getAttribute('data-wsd-tag') || el.tagName || '').toLowerCase();

    // Send to parent
    window.parent && window.parent.postMessage({
      __wsd_type: 'wsd-preview-click',
      start: start,
      tag: tag
    }, '*');
  }

  document.addEventListener('click', onClick, true);
})();
`.trim();
  }

  function rewriteHtmlForPreview(htmlText, originalSourceHtml = "", isForPreviewFrame = true) {
    let raw = htmlText || "";

    // 1. Rebuild name maps (needed for URL replacement)
    rebuildNameMaps();

    // 2. STAGE 1: Inject Preview-only attributes (SINGLE-PASS for 100% accurate offsets)
    if (isForPreviewFrame) {
      const skipTags = /^(html|head|meta|title|link|script|style)$/i;
      
      // We match either a block to skip (script/style/etc) OR a tag to inject.
      // Offset is relative to the START of the match in 'raw' (the original source string).
      raw = raw.replace(/<(script|style|title|head)(?:[^>]*?)>[\s\S]*?<\/\1>|<([A-Za-z][A-Za-z0-9:-]*)([^>]*?)>/gi, (match, blockTag, normalTag, rest, offset) => {
          if (blockTag) return match; // Skip the whole block untouched
          
          if (normalTag.startsWith("!") || normalTag.startsWith("?")) return match;
          const tagLower = normalTag.toLowerCase();
          if (skipTags.test(tagLower)) return match;
          if (rest.includes("data-wsd-start")) return match;

          // Inject data-wsd-start using the ACCURATE offset
          return `<${normalTag} data-wsd-start="${offset}"${rest}>`;
      });

      // Inject Click Bridge at end of body or end of string
      const bridgeScript = `<script id="__wsd_bridge">` + buildPreviewClickBridgeScript() + `</script>`;
      if (raw.toLowerCase().includes("</body>")) {
         raw = raw.replace(/<\/body>/i, match => bridgeScript + match);
      } else {
         raw += bridgeScript;
      }
    }

    // 3. STAGE 2: URL Replacement (SECOND! After offsets are secured)
    raw = raw.replace(/(src|href)\s*=\s*(['"])([^'"]+)\2/gi, (match, attr, q, val) => {
      const file = basename(val).toLowerCase();
      const hit = WS.imageByName.get(file) || WS.assetByName.get(file);
      return hit ? `${attr}=${q}${hit.url}${q}` : match;
    });

    return raw;
  }

  // On unload, cleanup ONLY blob URLs and monaco models, NOT the persistent files
  window.addEventListener("beforeunload", () => {
    // Only clear memory assets that leak, dont clear WS.files so we don't accidentally wipe
    // before closing if there's a race condition.
    for (const m of WS.models.values()) {
      try { m.dispose(); } catch {}
    }
    revokeAllUrls();
  });

  // Init state
  setLandingStatus("Checking for saved workspace...");

  loadWorkspaceFromDB().then((savedFiles) => {
    if (savedFiles && savedFiles.length > 0) {
      setLandingStatus(`Restoring ${savedFiles.length} file(s) from previous session...`);
      
      for (const rec of savedFiles) {
        WS.files.set(rec.path, rec);
      }

      // Prebuild blob URLs for images and assets (css/js/...)
      for (const [path, rec] of WS.files.entries()) {
        if (rec.kind === "image") {
          ensureBlobUrlForPath(path);
        } else {
          const e = extOf(path);
          if (e !== ".html" && e !== ".htm") {
            ensureBlobUrlForPath(path);
          }
        }
      }

      rebuildNameMaps();
      chooseDefaultPreviewHtml();
      renderWorkspaceList();

      if (exportZipBtn) exportZipBtn.disabled = false;
      convMeta.textContent = `${savedFiles.length} file(s) restored`;
      contentSummary.textContent = summarizeCounts();

      setLandingStatus(`Restored ✅ ${savedFiles.length} file(s).`, "ok");
      openDrawerBtn.disabled = false;
    } else {
      setLandingStatus("No folder selected.");
    }
  }).catch((err) => {
    console.error("Error loading workspace from DB:", err);
    setLandingStatus("No folder selected.");
  }).finally(() => {
    showLanding();
  });
})();
