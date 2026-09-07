# Implantação em produção

## 1. Servidor

Qualquer VPS Linux com 1 vCPU / 1 GB atende dezenas de rastreadores. Recomendado: Ubuntu 22.04+, Docker.

```bash
git clone <repo> rastrocar && cd rastrocar
cp .env.example .env
# edite: JWT_SECRET (openssl rand -hex 48), ADMIN_PASSWORD, PUBLIC_HOST
docker compose up -d --build
docker compose logs -f
```

Backup: copie o volume (`docker run --rm -v rastrocar_rastrocar-data:/d -v $PWD:/b alpine tar czf /b/backup.tgz /d`).

## 2. HTTPS para o painel (Caddy)

`/etc/caddy/Caddyfile`:
```
rastreio.seudominio.com.br {
    reverse_proxy localhost:3000
}
```
O Caddy emite o certificado automaticamente. O WebSocket (`/ws`) passa pelo mesmo proxy. HTTPS é obrigatório para o app instalável (PWA) no celular.

Nginx equivalente:
```
server {
  server_name rastreio.seudominio.com.br;
  location / { proxy_pass http://127.0.0.1:3000; proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
}
```

## 3. Porta dos rastreadores

A porta `5023/tcp` deve ficar **exposta diretamente** (não passa por proxy HTTP). Libere no firewall:
```bash
ufw allow 5023/tcp
```
E no painel do provedor (security group). Teste de fora: `nc -vz SEU_IP 5023`.

## 4. Sem Docker (systemd)

```bash
npm ci && npm run build
sudo tee /etc/systemd/system/rastrocar.service > /dev/null <<'UNIT'
[Unit]
Description=RastroCar
After=network.target
[Service]
WorkingDirectory=/opt/rastrocar
EnvironmentFile=/opt/rastrocar/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --no-warnings=ExperimentalWarning server/dist/index.js
Restart=always
User=rastrocar
[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl enable --now rastrocar
```

## 5. Railway / plataformas com proxy TCP

O serviço precisa de um **TCP proxy** para a porta 5023 (Railway: "TCP Proxy" nas configurações do serviço). Use o host/porta gerados pelo proxy como `PUBLIC_HOST` e `tcp_port` em Configurações. Monte um volume em `/app/data`.

## 6. Após subir

1. Entre com o admin e troque a senha.
2. Configurações → Endereço público = domínio/IP; salve.
3. Cadastre o cliente, o veículo e envie os SMS ao rastreador (Rastreadores → Instruções).
4. Quando o aparelho aparecer como pendente, vincule ao veículo.
5. Crie o acesso do cliente e envie login/senha. Oriente a instalar o app no celular (Ajuda → Instalar no celular).
