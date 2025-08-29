Cascade Canvass — Always-Online Patch
==========================================

What this does
--------------
- **Disables offline caching completely** so your app always hits the network.
- **Unregisters any previous service worker** to avoid stale assets.

How to apply
------------
1) In your **/index.html**, remove any existing service worker registration code. For example, delete blocks like:
   if ('serviceWorker' in navigator) { ... register('./sw.js') ... }

2) Add the following snippet just before the closing </body> tag:

<!-- Always-Online: Service Worker registration removed and unregistration added -->
<script>
  // Unregister any existing service workers so the app is truly online-only
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const reg of regs) reg.unregister();
    }).catch(()=>{});
  }
</script>


3) Replace your **/sw.js** with the included file. This SW clears caches and immediately unregisters itself on install/activate.

4) Commit & push to GitHub Pages.

5) On every device: open the app → hard refresh or revisit the URL. The previous SW will unregister and caching will be disabled.

Note
----
- If you want to re-enable offline later, restore your previous service worker and registration.
