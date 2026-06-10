# ReadStack bookmarklet

One-click "save this page to ReadStack" from any browser — no extension install.
It POSTs `location.href` to `{API}/add` and shows a confirmation alert.

## Install (10 seconds)
1. Show your bookmarks bar (Chrome: `⌘⇧B` / `Ctrl+Shift+B`).
2. Create a new bookmark named **Save to ReadStack** and paste the line below as
   its URL. (Or: drag the link from the rendered version of this file onto the
   bar.)

## Localhost (demo)
Backend at `http://localhost:8000`:

```
javascript:%28function%28%29%7Bvar%20A%3D%27http%3A%2F%2Flocalhost%3A8000%27%3Bfetch%28A%2B%27%2Fadd%27%2C%7Bmethod%3A%27POST%27%2Cheaders%3A%7B%27Content-Type%27%3A%27application%2Fjson%27%7D%2Cbody%3AJSON.stringify%28%7Burl%3Alocation.href%7D%29%7D%29.then%28function%28r%29%7Bif%28%21r.ok%29throw%20new%20Error%28%27HTTP%20%27%2Br.status%29%3Breturn%20r.json%28%29.catch%28function%28%29%7Breturn%7B%7D%3B%7D%29%3B%7D%29.then%28function%28d%29%7Bvar%20t%3D%28d%26%26%28d.topic%26%26d.topic.label%7C%7Cd.topic%7C%7Cd.label%29%29%7C%7C%27%27%3Balert%28%27Saved%20to%20ReadStack%20%5Cu2713%27%2B%28t%3F%27%20%5Cu2192%20%27%2Bt%3A%27%27%29%29%3B%7D%29.catch%28function%28e%29%7Balert%28%27ReadStack%20error%3A%20%27%2Be.message%2B%27.%20Is%20the%20backend%20running%3F%27%29%3B%7D%29%3B%7D%29%28%29%3B
```

## Prod
Swap the host: change `http%3A%2F%2Flocalhost%3A8000` (the URL-encoded
`http://localhost:8000`) inside the line to your deployed backend, e.g.
`https%3A%2F%2Fapi.readstack.app`. Everything else stays the same.

## Readable source (what the encoded line does)
```js
(function () {
  var A = "http://localhost:8000";
  fetch(A + "/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: location.href }),
  })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json().catch(function () { return {}; });
    })
    .then(function (d) {
      var t = (d && (d.topic && d.topic.label || d.topic || d.label)) || "";
      alert("Saved to ReadStack ✓" + (t ? " → " + t : ""));
    })
    .catch(function (e) {
      alert("ReadStack error: " + e.message + ". Is the backend running?");
    });
})();
```

> Note: a bookmarklet runs in the page's own origin, so the cross-origin POST
> relies on the backend's permissive CORS (already `allow_origins=["*"]` in
> `backend/main.py`). The unpacked extension (see `README.md`) doesn't have this
> constraint thanks to `host_permissions`.
