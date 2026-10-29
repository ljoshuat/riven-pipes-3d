/* Riven pipes 3D loader.
   Bricks loads this small file once; it looks up the latest commit on main and loads the main
   script pinned to that commit, so every update is live on the next page load (pinned jsDelivr
   URLs are never stale). Falls back to @main if GitHub can't be reached. */
(function () {
  var REPO = "ljoshuat/riven-pipes-3d", FILE = "riven-pipes-3d.min.js";
  var CDN = "https://cdn.jsdelivr.net/gh/" + REPO + "@";
  var KEY = "riven-pipes-3d-sha", TTL = 5 * 60 * 1000;   // reuse the lookup for 5 minutes per visitor
  function load(ref) {
    var s = document.createElement("script");
    s.src = CDN + ref + "/" + FILE; s.defer = true;
    if (ref !== "main") s.onerror = function () { load("main"); };
    document.head.appendChild(s);
  }
  var force = /[?&]pipes-tune\b/.test(location.search);   // tuning always checks for the newest build
  try {
    var c = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!force && c && Date.now() - c.t < TTL && /^[0-9a-f]{40}$/.test(c.sha)) return load(c.sha);
  } catch (e) {}
  var done = false, timer = setTimeout(function () { if (!done) { done = true; load("main"); } }, 2500);
  fetch("https://api.github.com/repos/" + REPO + "/commits/main", { headers: { Accept: "application/vnd.github.sha" } })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    .then(function (sha) {
      sha = sha.trim(); if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("bad sha");
      try { sessionStorage.setItem(KEY, JSON.stringify({ sha: sha, t: Date.now() })); } catch (e) {}
      if (!done) { done = true; clearTimeout(timer); load(sha); }
    })
    .catch(function () { if (!done) { done = true; clearTimeout(timer); load("main"); } });
})();
