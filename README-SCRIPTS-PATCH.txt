Cascade Canvass — Scripts Patch
Adds:
- A full **Scripts** screen (Season / Audience / Local cues preview)
- **Rebuttals A/B counters** with local persistence (scriptStats in localStorage)

Files to replace/add in your repo:
- /index.html     (adds the Scripts tab to the header nav)
- /assets/scripts.json
- /assets/app.js  (merge or replace with consolidated version; or append app.patch.js content to your current app.js)
- /sw.js          (cache bump to canvass-stable-full-v2; precaches scripts.json)

After deploying:
- On device: Settings → **Refresh Offline Cache**.
- Go to **Scripts** tab: choose cues to see live opener text; tap A/B use buttons to track which rebuttal you used.
