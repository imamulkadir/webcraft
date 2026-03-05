# /> WebCraft

A lightweight **browser-based HTML workspace editor** that lets you load a local project folder, edit files with a full-featured code editor, and preview the result instantly — all without installing anything.

WebCraft runs entirely in the browser and works perfectly when deployed on **GitHub Pages** or any static hosting platform.

---

## ✨ Features

### 📂 Folder Workspace
Load an entire project folder directly into the browser.
- Supports folder selection via `webkitdirectory`
- Automatically detects project files
- Displays files grouped by type

**Supported file types:**
| Type       | Extensions                                       |
| ---------- | ------------------------------------------------ |
| HTML       | `.html`, `.htm`                                  |
| CSS        | `.css`                                           |
| JavaScript | `.js`                                            |
| JSON       | `.json`                                          |
| Images     | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` |
| Text       | `.txt`, `.md`                                    |

### 🧠 Full Code Editor (Monaco)
WebCraft uses the **Monaco Editor** (the same editor used in VS Code).
Features include:
- Syntax highlighting
- Undo / redo
- Live editing
- Multiple language support
- Line wrapping
- Automatic layout

### 👀 Live Preview
HTML files render instantly in the preview pane.
- Updates automatically when code changes (using `morphdom` for seamless DOM-diffing updates)
- Images and assets are dynamically resolved
- Preview content is sandboxed for safety
- Layout automatically scales to fit the screen

### 🖱 Click-to-Code Navigation
Click any element in the preview and WebCraft will:
1. Locate the element in the source HTML
2. Scroll the editor to that location
3. Highlight the corresponding block

### 🖼 Image Inspection
Images in the workspace can be opened in a built-in viewer for quick inspection.

### 📦 Export Project
Download the **entire edited workspace** as a ZIP file.
- Includes all modified files
- Preserves folder structure
- Uses the latest editor content
- Does **not** include an extra root folder

### ⚡ Fully Client-Side
WebCraft runs entirely in the browser.
- No backend
- No file uploads
- No server processing
- Perfect for static hosting

---

## 🚀 Demo

You can deploy WebCraft easily using **GitHub Pages**.

**Example URL:**
[https://imamulkadir.github.io/webcraft](https://imamulkadir.github.io/webcraft)

---

## 🛠 How It Works

WebCraft loads files using the browser's **File API**.

**Workflow:**
1. User selects a folder
2. Browser provides file handles
3. Files are read into memory using IndexedDB
4. Blob URLs are generated for assets
5. HTML references are rewritten dynamically
6. Preview iframe renders the result

Images and assets are displayed using `URL.createObjectURL(file)`, which allows local files to be previewed safely inside the browser.

---

## 📁 Project Structure

```text
webcraft/
│
├── index.html
├── styles.css
├── script.js
├── favicon.svg
└── README.md
```

---

## 🧩 Dependencies

WebCraft uses CDN dependencies:

- **Monaco Editor:** [https://cdn.jsdelivr.net/npm/monaco-editor](https://cdn.jsdelivr.net/npm/monaco-editor) - Used for the code editing interface.
- **JSZip:** [https://cdn.jsdelivr.net/npm/jszip](https://cdn.jsdelivr.net/npm/jszip) - Used to generate downloadable ZIP exports of the workspace.
- **Morphdom:** [https://cdn.jsdelivr.net/npm/morphdom](https://cdn.jsdelivr.net/npm/morphdom) - Used for precise DOM updates to avoid iframe flashing.

---

## 🌐 Browser Support

| Browser | Status                              |
| ------- | ----------------------------------- |
| Chrome  | ✅ Fully supported                  |
| Edge    | ✅ Fully supported                  |
| Firefox | ⚠ Folder picker support varies      |
| Safari  | ⚠ Limited `webkitdirectory` support |
| Mobile  | ⚠ Not recommended                   |

**Best experience is on desktop Chrome or Edge.**

---

## ⚠ Limitations

Because WebCraft runs entirely in the browser:
- Users must select a folder or drop files on first load, though recent updates persist data via IndexedDB across refreshes.
- Browser security prevents automatic unrestricted file access.
- Huge projects may increase memory usage.

---

## 🔒 Security

All previews are rendered in a sandboxed iframe:
`sandbox="allow-same-origin allow-scripts allow-forms allow-popups"`

This prevents previewed code from accessing the parent application.

---

## ❤️ Why WebCraft

WebCraft was built to provide a **simple, zero-install HTML workspace** for quickly inspecting, editing, and previewing web projects directly in the browser.

**Perfect for:**
- Reviewing HTML exports
- Inspecting downloaded templates
- Editing small web projects
- Learning front-end development

---

## 🧑‍💻 Author

[**Imamul Kadir**](https://linkedin.com/in/imamulkadir)

---

## 📄 License

**MIT License:** You are free to use, modify, and distribute this project.

---

## ⭐ Contributing

Contributions, improvements, and suggestions are welcome.
1. Fork the repository
2. Create a new branch
3. Submit a pull request

---

**/>WebCraft — Craft the Web, Directly in Your Browser**
