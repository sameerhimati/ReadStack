# Save to ReadStack — Chrome extension (MV3)

Tiny unpacked extension: click the toolbar icon, hit **Save to ReadStack**, and
the current tab's URL is POSTed to the backend's `POST /add`. Hackathon demo —
no store submission, no auth.

## Load unpacked
1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this `extension/` folder.
5. Pin the icon, open any page, click it, hit **Save to ReadStack**.

## Point it at a different backend
- Quickest: open the popup and edit the **Backend** field (persisted locally).
- Permanent: change `DEFAULT_API` in `popup.js`, then add the new origin to
  `host_permissions` in `manifest.json` (e.g. `"https://api.readstack.app/*"`)
  and reload the extension.

## Files
- `manifest.json` — MV3 manifest (`activeTab` + `tabs`, host perms for localhost).
- `popup.html` / `popup.js` — the popup UI + save logic.
- `icon.png` — toolbar/action icon.
- `bookmarklet.md` — no-install one-liner alternative.

Requires the backend running (`cd backend && uvicorn main:app --reload`) and a
`POST /add` endpoint accepting `{"url": "..."}`.
