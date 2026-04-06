<p align="center">
  <img src="https://raw.githubusercontent.com/cmdkolab/osko/refs/heads/main/logo.jpeg" alt="OSKO Logo" width="640">
</p>

# 🚀 OS(KO) - Browser OS

![Version](https://img.shields.io/badge/version-5.4.0-blue.svg)
![Vanilla JS](https://img.shields.io/badge/Vanilla-Javascript-yellow)
![Local](https://img.shields.io/badge/Runs-Locally-success)

**OSKO** is an advanced, lightweight, and fully client-side Browser Operating System. It runs entirely within your web browser without requiring a backend server, offering a native-like desktop experience with window management, a virtual file system, and various built-in applications.

## ✨ Features

- **🪟 Advanced Window Manager**: Draggable, resizable, stackable, and snappable windows with minimize/maximize capabilities.
- **🔍 Quick Search & Multitasking**: Instant access to apps and files via `Ctrl+Space` and a dedicated Task View for effortless multitasking.
- **📁 Virtual File System (VFS)**: IndexedDB-backed persistent file system simulating a real directory structure (`/sys`, `/home/user`, `/tmp`) with quota management.
- **⚙️ Core EventBus Architecture**: Robust internal message passing and event handling across different isolated applications.
- **🔒 Sandboxed "WebOS" API**: Applications run within a managed lifecycle, interacting with the system through a safely scoped permissions module.
- **🎨 Custom Themes & Personalization**: Premium "Liquid Glass" aesthetic with 8+ color presets (Sunset, Ocean, Cyberpunk, and more), customizable wallpapers, and dark/light modes.
- **🌍 Internationalization (i18n)**: Multi-language support out of the box (English & Polish).
- **🛡️ Secure & Optimized**: No external dependencies. Built with security in mind (mitigation of Prototype Pollution and strict memory leak management).

## 📦 Built-in Applications

OSKO natively ships with a core suite of productive applications:
- **📂 Explorer**: Full-featured file manager to browse, create, edit, move, and delete files. Includes wallpaper management directly from the file context menu.
- **⚙️ Settings**: Control personalization (8+ color presets), system language, autostart programs, and audio preferences.
- **📊 Task Manager**: Monitor active processes, inspect memory/DOM usage, and force-kill stuck applications.
- **📝 Notes**: A sleek text editor for quick thoughts featuring auto-save, export, and text wrap.
- **📟 Terminal**: A powerful UNIX-like CLI. Supports 19+ commands: `help`, `ls`, `cd`, `cat`, `edit`, `mkdir`, `rm`, `clear`, `echo`, `date`, `pwd`, `version`, `play`, `uptime`, `ps`, `system`, `theme`, `history`, `top`. Features custom themes (Matrix, Cyberpunk) and tab-completion.
- **🧮 Calculator**: A beautifully designed numeric calculator with history.
- **📋 Syslog**: A diagnostic tool for monitoring OS-level background events, processes, and errors.

## 🛠️ Technology Stack

- **HTML5 & Vanilla CSS3** (Custom UI system without external UI libraries, utilizing Glassmorphism).
- **Vanilla JavaScript (ES6+)** (No React, Vue, or Angular — purely native APIs for maximum speed).
- **IndexedDB** & **LocalStorage** (For blazing-fast, strictly local data persistency).
- *Zero Build Steps for usage. Zero npm Installs.*
- **Bash build script** (`build.sh` concatenates system core scripts into `osko.min.js` and all application stylesheets into `osko.min.css` for faster local loading and less HTTP requests).

## 🚀 Getting Started

Running OSKO is incredibly simple because it requires exactly **zero** backend servers, databases, or build compilers.

1. Clone or download the repository.
2. Open `index.html` in any modern web browser.
3. Enjoy your new browser-based OS!

> **Developer Note:** If you want to modify core system files in `/system` directory or any `.css` stylesheets, you must run `./build.sh` script to merge them into `osko.min.js` and `osko.min.css` files which are loaded by the `index.html`. 

> **Persistence Note**: For the virtual file system to persist your files and settings between reloads, make sure your browser allows local storage APIs (IndexedDB) execution.

## 🤝 Contributing
Contributions, issues, and feature requests are always welcome! Feel free to check the issues page or submit pull requests.

- **Core**: Update global version in `README.md` (badge) and `system/storage.js` for kernel changes.
- **Apps**: App versions are **independent** of the core. Bump version in `app/main.js` for every change.
- **Rules**: Small fix -> `4.0.1`, Major update -> `4.1.0` or `5.0.0`.
This helps to maintain a clear trajectory of updates for both the system kernel and its utilities.

## 📄 License
This project is open-source and available under the MIT License.
