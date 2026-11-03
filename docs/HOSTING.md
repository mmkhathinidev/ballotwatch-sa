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

**Custom domain (Namecheap DNS)**

1. Add a file `frontend/public/CNAME` containing `elections.yourdomain.co.za`
   (or use Settings → Pages → Custom domain, which creates it for you).
2. At Namecheap → **Domain List → Manage → Advanced DNS**, add:

   | Type | Host | Value | TTL |
   | --- | --- | --- | --- |
   | CNAME | `elections` | `<you>.github.io.` | Automatic |

   For an apex domain use four `A` records instead: `185.199.108.153`,
   `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
3. Back in Pages, tick **Enforce HTTPS** once the certificate is issued
   (usually minutes).

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
