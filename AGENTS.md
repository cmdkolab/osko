# 🤖 OS(KO) - Agent's Guide

Welcome, Agent. This document provides a technical overview of the OS(KO) architecture and the rules for modifying or extending the system.

## 🏗️ System Architecture

OSKO is a strictly client-side, vanilla JavaScript operating system. It relies on a few core modules:

- **Kernel (`WebOS`)**: The central coordinator for app lifecycles, global state, and system-wide UI (Search, Calendar, Taskbar).
- **Virtual File System (`VFS`)**: An `IndexedDB`-backed persistent storage layer. All file operations go through here. Paths follow a Unix-like structure: `/sys`, `/home/user`, `/var/log`, `/tmp`.
- **WindowManager**: Handles the creation, stacking, dragging, and snapping of application windows.
- **Permissions & Scoped API**: Every app receives a `scopedAPI` which is tailored to its manifest permissions. Agents must respect these boundaries.
- **EventBus**: The primary communication channel for system-wide events (`vfs:changed`, `system:ready`, etc.).

## 🛠️ Modifying the System

### Core Logic & Styles
Core system files are located in `/system` and the main stylesheet is `style.css`.
> [!IMPORTANT]
> After modifying any file in `/system` OR any `.css` file in the project, you **must** run `./build.sh` to bundle changes into `osko.min.js` and `osko.min.css`.

### Applications
Apps are located in `/apps/[id]`. Each app must have:
- `main.js`: The application entry point using `WebOS.registerApp()`.
- `style.css`: App-specific styling (automatically bundled into `osko.min.css` by the build script).
- `manifest.json`: Defines permissions and metadata (though `main.js` registration is the source of truth).

## 📜 Agent Rules & Standards

1. **Keep it Clean**: 
   - Do not add unnecessary comments.
   - Remove redundant empty lines.
   - Keep the code concise and production-ready.
2. **Persistence**: 
   - Use `api.fs` for file operations.
   - Session state is persisted in `/sys/session.json`.
   - Critical system flags (like lock state) are in `PersistenceManager` under `SYS:LOCKED`.
3. **Internationalization (I18n)**:
   - **Never** hardcode strings in the UI. 
   - Always use `window.I18n.t('key.path')`.
   - Add new strings to both English and Polish dictionaries in `i18n.js`.
4. **Versioning**:
   - Bump the version in `README.md` and `system/storage.js` for core changes.
   - Bump the app version in `apps/[id]/main.js` for app-specific changes.
   - Patch: `0.0.x`, Feature/Minor: `0.x.0`, Breaking/Major: `x.0.0`.

## 🧩 Scoped API Surface

When building apps, you interact with the system via the `api` object provided in `mount(container, api, params)`:

- `api.fs`: `read`, `write`, `list`, `exists`, `remove`, `mkdir`, `copy`, `rename`.
- `api.system`: `getProcesses`, `killApp`, `getUptime`, `storage.get/set`, `subscribe`.
- `api.ui`: `showDialog`, `confirm`, `prompt`, `showContextMenu`.
- `api.notifications`: `show`.

## 🚀 Efficient Workflow for Agents

- Always verify `build.sh` results after JS **or CSS** changes.
- When debugging session issues, check `/sys/session.json` and `localStorage` (for refresh-safety).
- Ensure `VFS.saveImmediate()` is called for critical data persistence.
