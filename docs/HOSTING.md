# Hosting BallotWatch SA

Three routes, chosen by what you need: **freshness**, **cost**, and whether the
host can run Python.

| Route | Runs the live poller? | Freshness | Cost | Good for |
| --- | --- | --- | --- | --- |
| GitHub Pages (static export) | No — the poller runs in GitHub Actions | ~10 min | Free | Zero-maintenance public copy |
| Render / Fly / Railway (Docker) | Yes, 24/7 process | 30 s while counting | Free tier sleeps; ~$5–7/mo always-on | Election night, second-by-second |
| Namecheap VPS (Docker + Caddy) | Yes | 30 s | ~$7–10/mo | Own domain, own box, no platform limits |
| Namecheap **shared** hosting | No | — | already paid | Static copy only (see the ASGI caveat) |

The app has two modes, and they are the same codebase:

- **Live** — FastAPI poller + SSE. Needs a long-running process.
- **Static** — `export_static.py` polls once, writes the same JSON as files, and
  drops the SPA next to them. Honest about being a snapshot: the header shows
  `static build` and the notice bar carries the build time.

---

## 1. GitHub Pages (static, free)

GitHub Pages serves files only — it cannot run uvicorn. So the polling happens in
GitHub Actions and the result is published as a static site. The workflow is
already in the repo at `.github/workflows/pages.yml` (every 10 minutes, plus on
push and on demand).

**One-time setup**

1. Push the repo (already done).
2. Enable Pages with the Actions build type:
   ```bash
   gh api -X POST repos/<you>/ballotwatch-sa/pages -f build_type=workflow
   ```
   Or in the browser: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Run the workflow once:
   ```bash
   gh workflow run pages.yml
   gh run watch
   ```
4. The site appears at `https://<you>.github.io/ballotwatch-sa/`.

### If Actions cannot run (billing lock, org policy, minutes limit)

A scheduled workflow needs a runner, and GitHub will refuse to start jobs when the
account has a billing problem. The Pages site does not need Actions at all if you
build it locally and push the branch:

```bash
./scripts/publish_pages.sh          # or: make publish
```

That builds the SPA in static mode with the right base path, exports the snapshot,
and force-pushes it to `gh-pages`. Then set **Settings → Pages → Source: Deploy
from a branch → `gh-pages` / `/`** (one time). Verify with:

```bash
gh api repos/<you>/ballotwatch-sa/pages --jq '{status, source, cname}'
```

The cost of this route: the snapshot is as fresh as your last `make publish`.
Re-run it (or put it on a local cron) during counting:

```
*/10 * * * * /path/to/sa-election-live/scripts/cron_publish.sh
```

`cron_publish.sh` pins `PATH` (cron has no profile) and uses a project venv, so it
needs nothing from your shell. It costs nothing to run — it is a shell script, not
an agent task, so it consumes no model credits.

**Custom domains and branch publishes.** With branch builds, Pages reads the
`CNAME` file *from the branch*. A publish script that commits a fresh tree must
write that file, or the next publish silently detaches the domain and the custom
host starts 404-ing. `publish_pages.sh` now reads the configured domain from the
Pages API and commits `CNAME` on every run — verified by publishing twice and
re-checking `gh api repos/<you>/<repo>/pages --jq .cname`.

**If your project page redirects somewhere unexpected.** GitHub Pages project
sites inherit the custom domain of the account's *user site*
(`<you>.github.io`). If that domain is parked or has no DNS records, every
project URL answers `301` to a hostname that does not resolve. Check it with:

```bash
curl -sI https://<you>.github.io/ballotwatch-sa/ | grep -i location
```

Either point that domain at Pages (records below), or remove it:
**Settings of the `<you>.github.io` repo → Pages → Custom domain → remove**, then
rebuild the project site.

**Check the domain actually exists first.** A Pages custom domain pointed at an
unregistered or DNS-less hostname is worse than none: GitHub still 301s to it.

```bash
whois yourdomain.co.za | head -5        # "available for registration" = buy it first
dig +short NS yourdomain.co.za          # empty = no DNS, nothing will resolve
```

`scripts/attach_domain.sh <domain> [--project]` does the whole switch: detaches
the domain from the user site, attaches it here, republishes with the right base
path, and turns on HTTPS once the certificate is ready.

```bash
./scripts/attach_domain.sh culolethu.online --project   # keep /ballotwatch-sa/ path
./scripts/attach_domain.sh elections.example.com        # serve at the root
```

**Custom domain (Namecheap DNS)**

This is the configuration `zarpolls.online` actually runs on.

1. Attach it to Pages from the repo side — do not edit the domain in the web UI
   first, or you will fight a redirect:
   ```bash
   ./scripts/attach_domain.sh zarpolls.online        # root
   # ./scripts/attach_domain.sh zarpolls.online --project   # keep /ballotwatch-sa/
   ```
2. At Namecheap → **Domain List → Manage → Advanced DNS**:

   **Delete these first** — the defaults block the new records:

   | Type | Host | Value | Why it must go |
   | --- | --- | --- | --- |
   | URL Redirect Record | `@` | `http://www.<domain>/` | occupies the apex; no A record can be added |
   | CNAME Record | `www` | `parkingpage.namecheap.com.` | points www at the parking page |

   Then add:

   | Type | Host | Value | TTL |
   | --- | --- | --- | --- |
   | A | `@` | `185.199.108.153` | Automatic |
   | A | `@` | `185.199.109.153` | Automatic |
   | A | `@` | `185.199.110.153` | Automatic |
   | A | `@` | `185.199.111.153` | Automatic |
   | CNAME | `www` | `<you>.github.io.` | Automatic |

   The trailing dot on the CNAME matters: without it Namecheap appends the
   domain again and you get `www.<domain>.<domain>`.

   Keep the `TXT` record that starts `v=spf1 include:spf.efwd…` — that is email
   forwarding, not a parking artifact.
3. The script waits for the certificate (`approved`), then enforces HTTPS. If it
   exits early, re-run `gh api -X PUT repos/<you>/<repo>/pages --input -` with
   `{"https_enforced": true}` once the certificate shows approved.

Sanity check the result:

```bash
dig +short A zarpolls.online            # four 185.199.x.153 addresses
curl -sI http://zarpolls.online         # 301 → https
curl -sI https://zarpolls.online        # 200
curl -s  https://zarpolls.online/api/meta.json | head -c 80
```

**Trade-off:** a snapshot every ~10 minutes. GitHub throttles scheduled
workflows, and the IEC itself only publishes every 5–10 minutes, so this is close
to the practical floor. For election night, use route 2 or 3.

**Manual export** (any static host, including Namecheap shared):

```bash
cd frontend && VITE_STATIC=1 npm run build && cd ..
python backend/scripts/export_static.py --out static-export
# static-export/ now contains index.html, assets/, api/*.json, 404.html
```

---

## 2. Render (live, Docker, free tier available)

The repo has a `Dockerfile`, so no build configuration is needed.

1. Render → **New → Web Service** → connect the repo.
2. Runtime **Docker**, plan **Free** (sleeps after 15 min idle) or **Starter**.
3. Health check path: `/api/health`.
4. Add a disk if you want snapshots to survive restarts: mount `/data`
   (the app reads `LGE_DATA_DIR`, default `/data` in the image).
5. Deploy. Render gives you `https://ballotwatch-sa.onrender.com`.

**Custom domain:** Render → Settings → Custom Domains → add
`elections.yourdomain.co.za`, then at Namecheap add a `CNAME` to the hostname
Render shows you (e.g. `ballotwatch-sa.onrender.com`).

Note: on the free plan the service spins down when idle, so the first visit after
a quiet period takes ~30 s and the poller restarts cold. It rebuilds from the
IEC feed immediately, so nothing is lost except the in-memory snapshot history
(which also lives in SQLite if you attached a disk).

## 3. Fly.io (live, always-on, cheap)

```bash
fly launch --no-deploy        # uses the existing Dockerfile
fly volumes create lge_data --size 1
# in fly.toml: [mounts] source = "lge_data"  destination = "/data"
fly deploy
fly certs add elections.yourdomain.co.za
```

Then add the `A`/`AAAA` records Fly prints at Namecheap.

---

## 4. Namecheap

### 4a. Shared hosting (Stellar, Stellar Plus) — static only

Namecheap's own knowledge base is explicit: **ASGI applications are not supported
on shared hosting**; FastAPI/uvicorn needs a VPS or dedicated server. Shared
hosting also cannot keep a background poller alive between requests, and SSE
would be buffered by LiteSpeed.

So on shared hosting, publish the **static export**:

1. Build it locally (commands above).
2. cPanel → **File Manager** → `public_html` (or a subfolder such as
   `public_html/elections`).
3. Upload the *contents* of `static-export/` (zip it, upload, then **Extract**).
4. Visit `https://yourdomain.co.za/elections/`.

Because the export uses relative paths (`api/meta.json`, `assets/...`), it works
from a subfolder without rebuilding. `404.html` is a copy of `index.html` so deep
links work.

Refresh it by re-running the export and re-uploading — or skip the manual step
and use GitHub Pages instead, which does this on a schedule.

### 4b. Namecheap VPS (Plesk/Ubuntu) — full live dashboard

```bash
# on the VPS, as root
apt update && apt install -y docker.io docker-compose-plugin git
git clone https://github.com/<you>/ballotwatch-sa.git /opt/ballotwatch
cd /opt/ballotwatch
docker compose up -d --build          # app on 127.0.0.1:8000
```

Put TLS in front with Caddy (simplest) — create `/etc/caddy/Caddyfile`:

```
elections.yourdomain.co.za {
    reverse_proxy 127.0.0.1:8000
}
```

```bash
apt install -y caddy && systemctl reload caddy
```

Caddy obtains and renews the Let's Encrypt certificate automatically. Point the
domain's `A` record at the VPS IP first.

If you prefer nginx:

```nginx
server {
    server_name elections.yourdomain.co.za;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_buffering off;          # SSE needs this off
        proxy_read_timeout 3600s;
    }
    # then: certbot --nginx -d elections.yourdomain.co.za
}
```

`proxy_buffering off` matters: without it the server-sent events stream is
buffered and the dashboard silently falls back to its 30 s interval.

---

## Namecheap DNS cheat-sheet

Register the domain *before* attaching it. `.online`, `.africa` and `.co.za`
all work with Pages; only the records below change.

| Goal | Record |
| --- | --- |
| GitHub Pages project site | `CNAME  elections  <you>.github.io.` |
| GitHub Pages apex domain | four `A` records to `185.199.108-111.153` |
| Render / Fly / VPS | `A  elections  <server IPv4>` (or `CNAME` to the platform hostname) |
| Verify before switching | `dig +short elections.yourdomain.co.za` |

Keep TTL low (Automatic / 5 min) while you are testing, raise it afterwards.

---

## Which should you pick?

- **Just want a public link tonight, no maintenance:** GitHub Pages.
- **Want it to update every 30 seconds on election night, for free:** Render free
  tier — accept the cold start.
- **Want your own domain and a process you control:** Namecheap VPS + Docker +
  Caddy.
- **Already paying for Namecheap shared hosting:** static export, pointed at a
  subfolder; do not try to run FastAPI there.
