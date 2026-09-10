# Xcode landing page

Static, dependency-free. `index.html` reads the **latest GitHub Release** at load
time (via the public GitHub API) and wires the download buttons to its assets, so
you don't edit this page per release — you just cut a new tag.

## Files

- `index.html` — the page
- `favicon.png`, `icon.png` — logo assets

## Deploy to `xcode.datadropx.net`

Pick whichever matches your setup — all serve a plain static folder:

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

The workflow builds on `windows-latest` and publishes `Xcode-<ver>-x64.zip` and
`Xcode-Setup-<ver>.exe` to a GitHub Release. The page then links to them
automatically. Add `macos-latest` / `ubuntu-latest` to the workflow matrix and
flip the `.dl.soon` cards in `index.html` when you're ready to ship those.
