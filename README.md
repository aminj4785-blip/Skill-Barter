# SkillBarter AI — Modular Version

This is your app refactored into **modular ES modules**, one job per file. The behaviour is modern, clean, and extensible.

---

## 🚀 How to Run It (One-Click)

Because the project uses modern ES modules (`import` / `export`), browsers require it to be served via HTTP rather than opened as a static `file://` link.

### 1. Windows (Easiest)
Simply double-click **`start.bat`** in the `skillbarter/` folder. It automatically detects Python, Node (`npx serve`), or uses the built-in Windows web server to start the app and opens `http://localhost:5000` in your browser.

### 2. VS Code
Open the `skillbarter` folder in VS Code, right-click `index.html`, and choose **"Open with Live Server"**.

### 3. Command Line / Terminal
```bash
# Option A — Python
cd skillbarter
python -m http.server 5000
# then open http://localhost:5000

# Option B — Node.js
cd skillbarter
npx serve -p 5000
```

---

## Folder structure

```
skillbarter/
├── index.html          ← Single HTML shell
├── style.css           ← Unified dark design system
├── start.bat           ← One-click launcher for Windows
├── start.command       ← One-click launcher for macOS
└── js/
    ├── main.js         ← entry point (starts the app)
    ├── firebase.js     ← Firebase setup + SDK exports
    ├── state.js        ← shared app state (currentUser, allSkills, …)
    ├── utils.js        ← helpers: escapeHtml, avatars, notifications
    ├── modal.js        ← reusable popup (renderModal / closeModal)
    ├── data.js         ← realtime Firestore listeners (skills + workshops)
    ├── auth.js         ← login / signup / logout + requireAuth() guard
    ├── layout.js       ← navbar, page routing, home-page markup, intent filters
    ├── skills.js       ← 3-way intent selector, skill cards, skill details
    ├── workshops.js    ← workshop cards + details
    ├── swaps.js        ← propose / accept / decline / complete a swap
    ├── ratings.js      ← leave a rating + average-rating cache + notification dismissal
    ├── chat.js         ← 1-to-1 realtime chat
    ├── call.js         ← WebRTC video calls
    ├── community.js    ← community Q&A
    ├── notifications.js ← the notifications bell + its action buttons
    ├── profile.js      ← profile page, avatar upload watchdog, edit profile
    └── matcher.js      ← AI Skill Matcher with intent-aware ranking
```
