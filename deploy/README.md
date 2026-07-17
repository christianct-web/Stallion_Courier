# Stallion Courier — production deployment (post-remediation)

## 1. Lock down the VPS
```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow OpenSSH
sudo ufw deny 8030/tcp
sudo ufw enable
```
Run uvicorn bound to localhost only:
```bash
uvicorn app.main:app --host 127.0.0.1 --port 8030
```

## 2. Install Caddy, apply deploy/Caddyfile (edit the hostname), reload.

## 3. Backend environment (systemd unit or .env)
```bash
STALLION_ENV=production
STALLION_API_KEY=$(openssl rand -hex 32)      # generate once, store safely
STALLION_CORS_ORIGINS=https://<your-site>.netlify.app
STALLION_BROKERS=Jason Maule,Crystal Williams  # authorised reviewer names
```
The API now REFUSES TO START in production without the key and explicit CORS.

## 4. Netlify
- Env var: VITE_STALLION_API_KEY = the same key
- Edit frontend/public/_redirects: replace api.stallion.example.com
- Redeploy the site (env vars bake in at build time).

## 5. Verify
```bash
curl -s -o /dev/null -w "%{http_code}" https://api.../declarations        # 401
curl -s -H "X-API-Key: $KEY" https://api.../declarations | head           # 200
curl -m 5 http://<VPS_IP>:8030/health                                     # refused
```

## 6. Rotate & disclose
The old IP:port were public in the repo history. Treat the previous key
window as exposed: rotate everything, and review with JMC what data was
live during that period.
