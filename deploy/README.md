# Stallion Courier — production deployment

## 1. Lock down the VPS

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH
sudo ufw deny 8030/tcp
sudo ufw enable
```

Run Uvicorn on loopback only:

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8030
```

## 2. Configure TLS

Install Caddy, replace the placeholder hostname in `deploy/Caddyfile`, point DNS
at the VPS, and reload Caddy.

## 3. Create users and backend secrets

From the `backend/` directory, run `python scripts/create_user_hash.py` once
for each account. Store the resulting hashes in `STALLION_USERS_JSON`.

Required production environment:

```bash
STALLION_ENV=production
STALLION_SESSION_SECRET=$(openssl rand -hex 32)
STALLION_SESSION_TTL_SECONDS=28800
STALLION_CORS_ORIGINS=https://<your-site>.netlify.app
STALLION_USERS_JSON=[{"username":"crystal","name":"Crystal Williams","role":"admin","password_hash":"<generated-hash>"},{"username":"jason","name":"Jason Maule","role":"broker","password_hash":"<generated-hash>"}]
DATABASE_URL=postgresql+psycopg://stallion:<password>@localhost:5432/stallion
ANTHROPIC_API_KEY=<secret>
```

Roles:

- `clerk`: prepare manifests and send work to review.
- `broker`: approve, reject, submit, and receipt declarations.
- `admin`: broker permissions plus tariff, exemption, and correction changes.

Do not configure `VITE_STALLION_API_KEY`. Authentication is now performed by
server-issued, short-lived sessions; no long-lived secret is bundled into the
frontend.

## 3a. Provision PostgreSQL and migrate

Declarations, clients, courier manifests, and sheets are stored in a
transactional database (Phase 3B) — this removes the lost-update race the old
whole-file JSON store suffered once more than one user is active.

1. Create the database and role, then set `DATABASE_URL` as above. If
   `DATABASE_URL` is left unset the backend falls back to a local SQLite file
   (`backend/data/stallion.db`) — acceptable for a single-box dev setup, not for
   production.
2. On first start the app creates its tables and imports any existing
   `backend/data/*.json` records automatically (idempotent — it records a marker
   under `data/.migrated/` and never re-imports). To run it explicitly instead:

   ```bash
   cd backend && DATABASE_URL=... python scripts/migrate_json_to_db.py
   ```

3. After confirming the data is in the database, the legacy `data/*.json` files
   are no longer read and can be archived out of the deployment.

## 4. Netlify

- Set `VITE_STALLION_API_URL=/api` only if an explicit override is needed.
- Set `STALLION_API_PROXY_TARGET=https://api.stallion.<yourdomain>`.
- Redeploy so the generated redirect points at the TLS API hostname.

## 5. Verify

```bash
curl -s -o /dev/null -w "%{http_code}" https://api.../declarations
# expected: 401

curl -s -X POST https://api.../auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"crystal","password":"<password>"}'
# expected: 200 with a short-lived access_token

curl -m 5 http://<VPS_IP>:8030/health
# expected: connection refused
```

Verify that a clerk receives 403 when attempting a tariff mutation or approving
a declaration, while broker/admin accounts can perform their authorised actions.

## 6. Rotate and disclose

The old IP, port, and shared-key design existed in repository history. Remove the
old `STALLION_API_KEY` and `VITE_STALLION_API_KEY` values from hosting
configuration, rotate any related secrets, and review with JMC what data was live
during the earlier exposure window.
