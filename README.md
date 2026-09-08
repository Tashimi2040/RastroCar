<p align="center">
  <img src="web/public/brand/logo-horizontal.svg" alt="RastroCar" width="320">
</p>

<p align="center"><strong>Plataforma profissional de rastreamento veicular</strong> — multi-cliente, tempo real, mapeamento de rotas, alertas e bloqueio remoto.<br>Pronta para receber rastreadores GT06/Concox, H02/Sinotrack e TK103/Coban. Funciona no computador e no celular (app instalável).</p>

---

## O que o sistema faz

| Área | Recursos |
|---|---|
| **Recepção de rastreadores** | Servidor TCP com detecção automática de protocolo (GT06, H02, TK103) numa única porta. Auto-registro de aparelhos novos pelo IMEI. ACKs, sincronização de hora, heartbeat, alarmes. |
| **Mapa ao vivo** | Todos os veículos com status (movimento, parado, ignição ligada, sem sinal), busca, filtro, seguir veículo, cercas no mapa, popup com velocidade/ignição/bateria/satélites. Atualização por WebSocket. |
| **Mapeamento de rotas** | Detecção automática de viagens (por ignição ou movimento), paradas, distância, duração, velocidades máxima/média, endereços de origem/destino (geocodificação reversa), filtro de saltos de GPS. Trajeto colorido por velocidade, player de reprodução, exportação CSV. |
| **Relatórios** | Resumo diário por veículo (viagens, km, tempo em movimento, velocidade máxima, primeira saída, última chegada) com exportação. |
| **Alertas** | Ignição, excesso de velocidade (limite global ou por veículo), entrada/saída de cerca, sem comunicação, SOS, corte de alimentação, vibração, bateria baixa, violação, colisão, jammer, bloqueio/desbloqueio, resposta de comandos. |
| **Cercas virtuais** | Círculos e polígonos desenhados no mapa, por cliente ou por veículo, com alerta de entrada/saída. |
| **Comandos** | Bloquear/desbloquear motor, solicitar posição, reiniciar, alterar intervalo, comando personalizado. Fila para aparelhos offline e registro da resposta. |
| **Multi-cliente** | Administradores/operadores gerenciam clientes, veículos, rastreadores e usuários. Cada cliente entra com seu login e vê apenas os próprios veículos. Auditoria de ações. |
| **Configuração do rastreador** | Gerador de comandos SMS por modelo e operadora (APN, servidor, intervalo, ignição), com endereço público e porta já preenchidos. Central de ajuda com instalação física, dicas e FAQ. |
| **Mobile / PWA** | Layout responsivo com barra de navegação inferior, instalável na tela inicial (Android e iPhone), ícones e service worker. |

## Arquitetura

```
RastroCar/
├── server/              API + gateway TCP (Node 22, TypeScript, Fastify, SQLite nativo)
│   ├── src/gateway/     protocolos gt06 / h02 / tk103, registro de sessões, servidor TCP
│   ├── src/services/    tracking (ingestão), trips (viagens/paradas), events, commands, geocode, setup (SMS)
│   ├── src/http/        rotas REST (auth, clientes, veículos, rastreadores, posições, viagens, eventos, cercas, comandos, configurações)
│   ├── src/ws/          hub WebSocket (tempo real)
│   └── scripts/         simulador de rastreador
├── web/                 painel (Vite, React, Leaflet) — desktop e celular
├── docs/                marca, protocolos e implantação
├── Dockerfile / docker-compose.yml
└── .env.example
```

Banco de dados: SQLite (arquivo em `data/rastrocar.db`, modo WAL) via `node:sqlite` — sem dependências nativas, backup = copiar um arquivo. Adequado para centenas de rastreadores; migrações versionadas em `server/src/db/migrations.ts`.

## Ambiente de teste publicado

| Serviço | Endereço |
|---|---|
| Painel (Vercel) | https://rastrocar-lynedesktechs-projects.vercel.app |
| Painel + API + WebSocket (Railway) | https://rastrocar-api-production.up.railway.app |
| Gateway TCP dos rastreadores (Railway TCP proxy) | `altaria.proxy.rlwy.net` porta `38366` |

Login inicial: `adm@lynedesk.com` (senha definida na variável `ADMIN_PASSWORD` do Railway; troque no primeiro acesso).

Para o rastreador, use no SMS de servidor o host e a porta do proxy TCP acima (o painel já mostra esses valores em **Rastreadores → Instruções de configuração**). Exemplo GT06: `SERVER,1,altaria.proxy.rlwy.net,38366,0#`.

Fluxo de publicação: cada push no branch gera a imagem `ghcr.io/tashimi2040/rastrocar:latest` pelo GitHub Actions (`.github/workflows/docker-image.yml`); o serviço do Railway roda essa imagem (basta "Redeploy" para pegar a nova versão). A Vercel serve o painel fazendo proxy para o Railway (`vercel.json`); para a Vercel construir o painel diretamente do repositório, conceda ao app GitHub da Vercel acesso ao repositório e importe o projeto com *Root Directory* `web`.

## Rodando localmente

Requisitos: Node.js 22.13+ (usa `node:sqlite`).

```bash
npm install
npm run build          # compila painel e servidor
npm start              # http://localhost:3000  |  TCP rastreadores: 5023
```

Desenvolvimento com recarga automática:

```bash
npm run dev            # servidor em :3000 e painel (Vite) em :5173 com proxy
```

Primeiro acesso: `admin@rastrocar.local` / `admin123` (defina `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env` ou troque a senha após entrar).

### Testar sem rastreador físico

```bash
npm run simulate -- 127.0.0.1 5023 868120212345678 gt06 5
# host porta imei protocolo(gt06|h02|tk103) intervalo_s
```

O simulador faz login, envia heartbeats e percorre uma rota real em São Paulo com velocidade variável e paradas, exercitando viagens, alertas e comandos.

### Testes

```bash
npm test               # decodificadores GT06/H02/TK103, CRC, máquina de estados de viagens
```

## Implantação (produção)

### Docker (recomendado)

```bash
cp .env.example .env   # ajuste JWT_SECRET, ADMIN_PASSWORD, PUBLIC_HOST
docker compose up -d --build
```

Portas: `3000` (painel + API, coloque atrás de um proxy HTTPS como Caddy/Nginx) e `5023` (TCP dos rastreadores — precisa ser exposta diretamente, sem proxy HTTP). Os dados ficam no volume `rastrocar-data`.

### Sem Docker (VPS com Node)

```bash
npm ci && npm run build
NODE_ENV=production PORT=3000 TCP_PORT=5023 npm start   # use pm2/systemd para manter no ar
```

### Checklist de rede

1. IP fixo ou domínio (DNS A) apontando para o servidor. Informe em **Configurações → Endereço público**.
2. Libere a porta TCP `5023` no firewall da VPS e no provedor (security group).
3. HTTPS no painel (necessário para instalar como app no celular): Caddy faz isso automaticamente.
4. Veja `docs/implantacao.md` para exemplos de Caddy, Nginx, systemd e Railway.

## Configurando um rastreador

1. Chip com dados e PIN desligado dentro do aparelho; instalação com 12V, terra e fio de ignição (`docs/rastreadores.md` e a Central de ajuda no painel).
2. No painel: **Rastreadores → Instruções de configuração**, escolha modelo e operadora, copie e envie os SMS.
3. O aparelho aparece automaticamente em **Rastreadores** como *pendente*; clique em **Vincular** e associe ao veículo do cliente.
4. Em **Clientes**, crie o acesso do cliente (e-mail e senha). Ele verá só os veículos dele.

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | 3000 | Porta HTTP (painel + API + WebSocket) |
| `TCP_PORT` | 5023 | Porta TCP dos rastreadores (detecção automática de protocolo) |
| `PUBLIC_TCP_PORT` | = TCP_PORT | Porta pública mostrada nas instruções SMS quando há proxy TCP na frente (Railway) |
| `TCP_PORT_GT06` / `TCP_PORT_H02` / `TCP_PORT_TK103` | 0 | Portas dedicadas opcionais |
| `DATA_DIR` | `./data` | Pasta do banco e do segredo JWT |
| `JWT_SECRET` | gerado | Segredo dos tokens de login |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | admin@rastrocar.local / admin123 | Admin inicial |
| `PUBLIC_HOST` | — | Host público mostrado nas instruções SMS |
| `AUTO_REGISTER_DEVICES` | true | Aceitar IMEIs desconhecidos como pendentes |
| `LOG_LEVEL` | info | debug / info / warn / error |

## API (resumo)

Todas as rotas em `/api`, autenticação `Authorization: Bearer <token>` (obtido em `POST /api/auth/login`). WebSocket em `/ws?token=...` envia `position`, `event`, `device`, `command`, `trip`.

`/auth/*`, `/clients`, `/users`, `/vehicles`, `/devices`, `/devices/:id/setup`, `/positions`, `/positions/latest`, `/trips`, `/trips/:id`, `/trips/summary`, `/stops`, `/events`, `/geofences`, `/commands`, `/settings`, `/setup/instructions`, `/dashboard`, `/geocode/reverse`, `/audit`, `/health`.

## Marca

Identidade visual (logo SVG, cores, tipografia, ilustrações 3D dos veículos) documentada em `docs/marca.md`; arquivos em `web/public/brand` e `web/public/img`.

## Licença

Uso interno da Lynedesk. Todos os direitos reservados.
