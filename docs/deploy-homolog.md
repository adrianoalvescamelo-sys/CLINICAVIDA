# Deploy homolog — Hostinger VPS + Docker + Nginx + Let's Encrypt

Runbook do ambiente **homolog.clinicavida.cloud**.

Stack:
- VPS Hostinger (Ubuntu 22.04+)
- Docker + Docker Compose
- PostgreSQL 16 (container)
- Backend NestJS (container)
- Frontend Vite/React (build estático servido por nginx container)
- Nginx HOST faz SSL terminação (Let's Encrypt) e proxy → container

---

## 1. Provisionar VPS

1. Criar VPS Hostinger Ubuntu 22.04 LTS (mínimo 2 vCPU / 2GB RAM).
2. Apontar DNS A `homolog.clinicavida.cloud` → IP do VPS.
3. SSH como root → criar usuário sudo:
   ```bash
   adduser deploy
   usermod -aG sudo deploy
   rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
   ```
4. Sair, logar como `deploy`.

## 2. Hardening básico

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ufw fail2ban git curl
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
sudo systemctl enable --now fail2ban
```

Desabilitar root SSH e password auth:

```bash
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## 3. Instalar Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# logout/login para aplicar grupo
```

Verificar:

```bash
docker --version          # ≥ 24
docker compose version    # ≥ 2.20
```

## 4. Clonar repositório

```bash
sudo mkdir -p /opt/clinicavida
sudo chown deploy:deploy /opt/clinicavida
cd /opt/clinicavida
git clone <REPO_URL> .
git checkout master
```

## 5. Gerar secrets

```bash
node scripts/gen-secrets.mjs
```

Cole o output em `.env.homolog`:

```bash
cp .env.homolog.example .env.homolog
nano .env.homolog
# Cole os secrets gerados + ajuste:
#   CORS_ORIGIN=https://homolog.clinicavida.cloud
#   N8N_WEBHOOK_URL=<url do n8n>
#   WA_DRY_RUN=true  (deixar true até validar)
```

Garantir permissão restrita:

```bash
chmod 600 .env.homolog
```

## 6. Subir containers

```bash
docker compose --env-file .env.homolog -f docker-compose.homolog.yml up -d --build
```

Verificar:

```bash
docker compose -f docker-compose.homolog.yml ps
docker logs clinicavida-api-homolog --tail 50
docker logs clinicavida-frontend-homolog --tail 20
```

Healthchecks devem estar `healthy` em ~1 min.

## 7. Rodar seed (apenas primeira subida)

```bash
docker exec -it clinicavida-api-homolog \
  npx --workspace backend prisma db seed
```

Lista usuários iniciais via env opcionais `SEED_*_EMAIL` / `SEED_*_PASSWORD` (se omitido, usa defaults). **Trocar senhas após primeiro login.**

## 8. Nginx HOST + Let's Encrypt

Instalar:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Criar `/etc/nginx/sites-available/homolog.clinicavida.cloud`:

```nginx
server {
    listen 80;
    server_name homolog.clinicavida.cloud;

    # Certbot precisa servir .well-known
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name homolog.clinicavida.cloud;

    # Certbot vai injetar ssl_certificate aqui
    ssl_certificate /etc/letsencrypt/live/homolog.clinicavida.cloud/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/homolog.clinicavida.cloud/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 10m;

    # Proxy para o container nginx (porta 8080 do host)
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Habilitar + gerar certificado:

```bash
sudo ln -s /etc/nginx/sites-available/homolog.clinicavida.cloud /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/certbot
sudo nginx -t
sudo systemctl reload nginx

sudo certbot --nginx -d homolog.clinicavida.cloud \
  --non-interactive --agree-tos -m admin@clinicavida.cloud
```

Auto-renew (cron padrão do certbot):

```bash
sudo systemctl list-timers | grep certbot   # já deve estar agendado
```

## 9. Smoke test

```bash
curl -I https://homolog.clinicavida.cloud
# HTTP/2 200

curl https://homolog.clinicavida.cloud/health
# {"status":"ok"}

curl https://homolog.clinicavida.cloud/ready
# {"status":"ok"}
```

Login via navegador: `https://homolog.clinicavida.cloud/login`
Credenciais seed (trocar imediato):
- `admin@clinicavida.local` / `Admin@2026!`

## 10. Validação WhatsApp gradual

1. `WA_DRY_RUN=true` (default) — logs mostram `WhatsApp DRY-RUN — pulando envio HTTP`. Validar fluxo + cron por 24h.
2. Editar `.env.homolog`: `WA_DRY_RUN=false` + verificar `N8N_WEBHOOK_URL` corresponde ao número TESTE.
3. Restart só o api:
   ```bash
   docker compose -f docker-compose.homolog.yml --env-file .env.homolog up -d api
   ```
4. Disparar confirmação manualmente, verificar entrega.
5. Trocar número teste → produção apenas APÓS aprovação PO.

## 11. Logs + monitoring

```bash
# Logs em tempo real
docker compose -f docker-compose.homolog.yml logs -f api

# Auditoria DB
docker exec -it clinicavida-postgres-homolog \
  psql -U clinicavida -d clinicavida \
  -c "SELECT acao, entidade, resultado, data_hora FROM auditoria ORDER BY data_hora DESC LIMIT 20;"
```

## 12. Backup DB (diário, retenção 30d)

Criar `/opt/clinicavida/scripts/backup.sh`:

```bash
#!/bin/bash
set -e
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/clinicavida/backups
mkdir -p "$BACKUP_DIR"
docker exec clinicavida-postgres-homolog \
  pg_dump -U clinicavida clinicavida \
  | gzip > "$BACKUP_DIR/clinicavida_$TS.sql.gz"
# Retenção 30 dias
find "$BACKUP_DIR" -name "clinicavida_*.sql.gz" -mtime +30 -delete
```

Chmod + cron:

```bash
chmod +x /opt/clinicavida/scripts/backup.sh
sudo crontab -e
# Adicionar:
0 3 * * * /opt/clinicavida/scripts/backup.sh >> /var/log/clinicavida-backup.log 2>&1
```

## 13. Atualizações (deploys subsequentes)

```bash
cd /opt/clinicavida
git pull origin master
docker compose --env-file .env.homolog -f docker-compose.homolog.yml up -d --build
# Migrations rodam automaticamente no CMD do api Dockerfile
```

## 14. Rollback

```bash
git checkout <commit-anterior>
docker compose --env-file .env.homolog -f docker-compose.homolog.yml up -d --build
# Se migration foi destrutiva, restaurar backup:
docker exec -i clinicavida-postgres-homolog \
  psql -U clinicavida -d clinicavida < /opt/clinicavida/backups/<arquivo>.sql
```

---

## Checklist Definition of Done — deploy homolog

- [ ] DNS A apontando para VPS
- [ ] Firewall UFW: só 22, 80, 443
- [ ] fail2ban ativo
- [ ] SSH sem root, sem senha
- [ ] `.env.homolog` com secrets fortes, chmod 600, NÃO commitado
- [ ] `docker compose ps` mostra 3 services healthy
- [ ] `https://homolog.clinicavida.cloud/health` → 200
- [ ] Login funciona via UI
- [ ] Auditoria registra ação de login
- [ ] Backup cron agendado
- [ ] Certbot timer ativo (renew auto)
- [ ] WA inicial em DRY_RUN, transição agendada
