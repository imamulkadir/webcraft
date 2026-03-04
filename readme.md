# /> WebCraft

A lightweight **browser-based HTML workspace editor** that lets you load a local project folder, edit files with a full-featured code editor, and preview the result instantly — all without installing anything.

WebCraft runs entirely in the browser and works perfectly when deployed on **GitHub Pages** or any static hosting platform.

---

# ✨ Features

### 📂 Folder Workspace

Load an entire project folder directly into the browser.

- Supports folder selection via `webkitdirectory`
- Automatically detects project files
- Displays files grouped by type

Supported file types:

| Type       | Extensions                                       |
| ---------- | ------------------------------------------------ |
| HTML       | `.html`, `.htm`                                  |
| CSS        | `.css`                                           |
| JavaScript | `.js`                                            |
| JSON       | `.json`                                          |
| Images     | `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg` |
| Text       | `.txt`, `.md`                                    |

---

### 🧠 Full Code Editor (Monaco)

WebCraft uses the **Monaco Editor** (the same editor used in VS Code).

Features include:

- syntax highlighting
- undo / redo
- live editing
- multiple language support
- line wrapping
- automatic layout

---

### 👀 Live Preview

HTML files render instantly in the preview pane.

- updates automatically when code changes
- images and assets are dynamically resolved
- preview content is sandboxed for safety
- layout automatically scales to fit the screen

---

### 🖱 Click-to-Code Navigation

Click any element in the preview and WebCraft will:

1. locate the element in the source HTML
2. scroll the editor to that location
3. highlight the corresponding block

This makes inspecting and editing HTML much faster.

---

### 🖼 Image Inspection

Images in the workspace can be opened in a built-in viewer for quick inspection.

---

### 📦 Export Project

Download the **entire edited workspace** as a ZIP file.

- includes all modified files
- preserves folder structure
- uses the latest editor content
- does **not include an extra root folder**

---

### ⚡ Fully Client-Side

WebCraft runs entirely in the browser.

- no backend
- no file uploads
- no server processing
- perfect for static hosting

All files remain local to the user’s machine.

---

# 🚀 Demo

You can deploy WebCraft easily using **GitHub Pages**.

Example URL:
https://imamulkadir.github.io/webcraft

---

# 🛠 How It Works

WebCraft loads files using the browser's **File API**.

Workflow:

1. User selects a folder
2. Browser provides file handles
3. Files are read into memory
4. Blob URLs are generated for assets
5. HTML references are rewritten dynamically
6. Preview iframe renders the result

Images and assets are displayed using:

`URL.createObjectURL(file)`

This allows local files to be previewed safely inside the browser.

---

# 📁 Project Structure

```
webcraft/
│
├── index.html
├── styles.css
├── script.js
├── favicon.svg
└── README.md
```

---

# 🧩 Dependencies

WebCraft uses two CDN dependencies.

### Monaco Editor

https://cdn.jsdelivr.net/npm/monaco-editor

Used for the code editing interface.

---

### JSZip

https://cdn.jsdelivr.net/npm/jszip

Used to generate downloadable ZIP exports of the workspace.

---

# 🌐 Browser Support

| Browser | Status                              |
| ------- | ----------------------------------- |
| Chrome  | ✅ Fully supported                  |
| Edge    | ✅ Fully supported                  |
| Firefox | ⚠ Folder picker support varies      |
| Safari  | ⚠ Limited `webkitdirectory` support |
| Mobile  | ⚠ Not recommended                   |

Best experience is on **desktop Chrome or Edge**.

---

# ⚠ Limitations

Because WebCraft runs entirely in the browser:

- users must select a folder each session
- browser security prevents automatic file access
- folder access resets on page refresh
- large projects may increase memory usage

---

# 🔒 Security

All previews are rendered in a sandboxed iframe:

`sandbox="allow-same-origin allow-scripts allow-forms allow-popups"`

This prevents previewed code from accessing the parent application.

---

# 🧑‍💻 Author

**Imamul Kadir**

Senior Software Engineer  
LinkedIn:  
https://linkedin.com/in/imamulkadir

---

# 📄 License

MIT License

You are free to use, modify, and distribute this project.

---

# ⭐ Contributing

Contributions, improvements, and suggestions are welcome.

If you'd like to contribute:

1. Fork the repository
2. Create a new branch
3. Submit a pull request

---

# 🧠 Future Improvements

Planned enhancements:

- multi-file search
- drag-and-drop file loading
- code formatting
- file tree explorer
- dark/light theme switching
- project persistence using IndexedDB
- offline PWA support

---

# 🧪 Built With

- HTML
- CSS
- Vanilla JavaScript
- Monaco Editor
- JSZip

---

# ❤️ Why WebCraft

WebCraft was built to provide a **simple, zero-install HTML workspace** for quickly inspecting, editing, and previewing web projects directly in the browser.

Perfect for:

- reviewing HTML exports
- inspecting downloaded templates
- editing small web projects
- learning front-end development

---

**/>WebCraft — Craft the Web, Directly in Your Browser**
