# Production deployment

The production stack is four containers on one Linux server:

```
Internet ──443──▶ Caddy (automatic HTTPS) ──▶ Nginx (React app + /api proxy) ──▶ FastAPI (gunicorn) ──▶ MongoDB
```

Only ports 80 and 443 are open. MongoDB is reachable only inside the Docker network. This runs on any VM: AWS EC2 or Lightsail, an Azure VM, DigitalOcean or Hetzner. A 2 vCPU / 4 GB server comfortably handles your first ~50 schools.

## 1. Server setup (Ubuntu 22.04/24.04)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
sudo ufw allow 22,80,443/tcp && sudo ufw enable
```

Point your domain's DNS **A record** (e.g. `app.yourschoolsaas.com`) at the server's IP.

## 2. Configure

```bash
git clone <your repo> /opt/scholaris && cd /opt/scholaris
cp deploy/production.env.example deploy/production.env
nano deploy/production.env
```

Fill in every value. Generate secrets with:
```bash
openssl rand -hex 24   # MONGO_ROOT_PASSWORD (use hex, as some symbols break the connection URL)
openssl rand -hex 32   # JWT_SECRET
```
`SUPERADMIN_PASSWORD` must be at least 12 characters. The backend **refuses to start** in production with a weak JWT secret, missing CORS origin, or demo data turned on.

## 3. Start

```bash
docker compose -f docker-compose.prod.yml --env-file deploy/production.env up -d --build
docker compose -f docker-compose.prod.yml ps          # all should be "healthy"/"running"
curl https://app.yourschoolsaas.com/api/health/ready  # {"status":"ok","database":"ok"}
```

Caddy gets a Let's Encrypt certificate automatically on first request. Then:
- Platform console: `https://<domain>/platform/login`
- Schools sign up at: `https://<domain>/register`

## 4. Backups (do this on day one)

```bash
crontab -e
# add:
30 2 * * * cd /opt/scholaris && ./deploy/backup.sh >> /var/log/scholaris-backup.log 2>&1
```
This writes a nightly compressed archive of the platform database and every school's database to `backups/` and keeps 14 days. **Copy backups off the server** (S3, Azure Blob, Backblaze). A backup that only lives on the same disk isn't a backup. Restore commands are at the top of `deploy/backup.sh`. You can restore a single school without touching the others.

For a managed alternative, point `MONGO_URL` at **MongoDB Atlas** and remove the `mongo` service. Atlas handles backups, point-in-time restore and replication.

## 5. Updating

```bash
cd /opt/scholaris && git pull
docker compose -f docker-compose.prod.yml --env-file deploy/production.env up -d --build
```

## 6. Monitoring

- Logs: `docker compose -f docker-compose.prod.yml logs -f backend`. Every request is logged with a request ID, which also comes back in the `X-Request-ID` response header.
- Uptime: point UptimeRobot (free) or similar at `https://<domain>/api/health/ready`.

## Scaling notes (when you outgrow one server)

- **Login rate limiting** and the **school record cache** are kept in memory per backend process. With `WEB_CONCURRENCY=2`, limits are per worker and a suspension takes effect within ~15 seconds. That's fine on one server. Before running several servers, move both to Redis.
- MongoDB handles thousands of databases in one cluster. Because each school is its own database, you can later move a large school to a dedicated cluster by changing only its `db_name` record.

## Before going live: checklist

- [ ] Real values in `deploy/production.env` (no defaults)
- [ ] Prices in `backend/app/plans.py` set to your real pricing
- [ ] Backups scheduled **and copied off-server**, and one restore tested
- [ ] Uptime monitor on `/api/health/ready`
- [ ] Terms of service and privacy policy pages. You're storing children's data: check India's DPDP Act 2023 obligations for children's personal data and parental consent
- [ ] Password-reset-by-email (currently admins reset passwords in the Users page; there's no "forgot password" email yet)
