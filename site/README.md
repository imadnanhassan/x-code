# Xcode landing page

Static, dependency-free, multi-page. Any page with a `[data-dl-*]` element reads
the **latest GitHub Release** at load time (via the public GitHub API, see
`site.js`) and wires itself up automatically — so you don't edit these pages per
release, you just cut a new tag.

## Files

- `index.html` — Home
- `features.html` — full feature tour
- `download.html` — download + release notes + system requirements
- `support.html` — FAQ, troubleshooting, get-help links
- `styles.css` — shared design system (nav, buttons, sections, components)
- `site.js` — shared behavior (nav, mobile menu, scroll reveal, release fetch)
- `favicon.png`, `icon.png` — logo assets

## Deploy to `xcode.datadropx.net`

Pick whichever matches your setup — all serve a plain static folder:

### Vercel
1. [vercel.com/new](https://vercel.com/new) → Import Git Repository → pick `imadnanhassan/x-code`.
2. Framework Preset: **Other**. Root Directory: click Edit → select **`site`**.
3. Build Command / Output Directory: leave both blank (it's static — nothing to build).
4. Deploy. Then Project → Settings → Domains → add `xcode.datadropx.net` and follow Vercel's DNS instructions (it'll give you a CNAME or A record to add wherever `datadropx.net`'s DNS is managed).
5. Every future push to `main` redeploys automatically — no CI step needed for the site itself.

### Cloudflare Pages
1. Push this repo to GitHub (already done).
2. Cloudflare dashboard → Workers & Pages → Create → Pages → connect the repo.
3. Build command: *(none)* · Build output directory: `site`
4. Custom domain → add `xcode.datadropx.net` (Cloudflare adds the CNAME).

### Netlify
- New site from Git → Base directory: `site` → Publish directory: `site` → no build command.
- Domain settings → add custom domain `xcode.datadropx.net`.

### Your own server / nginx
```nginx
server {
  server_name xcode.datadropx.net;
  root /var/www/xcode-site;      # copy the contents of site/ here
  location / { try_files $uri $uri/ /index.html; }
}
```
Then `certbot --nginx -d xcode.datadropx.net`.

## Cutting a release (so the buttons get files)

```bash
npm version patch          # bumps package.json + creates git tag vX.Y.Z
git push --follow-tags     # triggers .github/workflows/release.yml
```

The workflow builds on `windows-latest` and publishes `Xcode-Setup-<ver>.exe` (+
blockmap + `latest.yml`) to a GitHub Release. `download.html` then links to it
automatically. Add `macos-latest` / `ubuntu-latest` to the workflow matrix and
enable the macOS/Linux cards in `download.html` when you're ready to ship those.
