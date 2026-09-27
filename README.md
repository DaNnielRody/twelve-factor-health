# twelve-factor-health

Serviço HTTP mínimo, com um endpoint `/health`, construído desde o primeiro commit segundo a metodologia [Twelve-Factor App](https://12factor.net/pt_br/).
É o laboratório #4 de Arch4 (Computação em Nuvem I, Jala University).

| | |
|---|---|
| **Linguagem / runtime** | JavaScript (ESM) em Node.js 24 LTS |
| **Framework** | [Fastify 5](https://fastify.dev) (logger pino embutido) |
| **Serviço de apoio** | Redis 8 (opcional, via `REDIS_URL`) |
| **Empacotamento** | Dockerfile multi-stage + Docker Compose |
| **Deploy público** | Túnel Zero Trust da Cloudflare + Workers VPC → `https://twelve-factor-health.danielrody.workers.dev` |
| **Licença** | MIT |

## Início rápido

```bash
# 1. Host, sem Docker (Node 24)
npm ci
cp .env.example .env          # opcional: todos os valores têm padrão
npm start                     # ou: scripts/start.sh
curl -s localhost:3000/health

# 2. Containers: duas réplicas sem estado + Redis
docker compose up -d --build
curl -s localhost:8081/health
curl -s localhost:8081/api/hits; curl -s localhost:8082/api/hits   # contador compartilhado

# 3. Publicar pela Cloudflare (precisa de TUNNEL_TOKEN no .env)
docker compose --profile tunnel up -d
curl -s https://twelve-factor-health.danielrody.workers.dev/health
#    ...ou um URL descartável *.trycloudflare.com, sem conta:
docker compose --profile quick-tunnel up -d && docker compose logs quick-tunnel | grep trycloudflare
```

Resposta de `/health`:

```json
{"status":"ok","service":"twelve-factor-health","release":"<sha do commit>","instance":"web1",
 "uptimeSeconds":38,"timestamp":"2026-09-27T13:36:07.560Z","checks":{"redis":"up"}}
```

## Endpoints

| Rota | Função |
|---|---|
| `GET /health` | *Readiness*: `200 ok`; `503 degraded` se o Redis configurado estiver fora; `503 draining` durante o desligamento |
| `GET /health/live` | *Liveness*: nunca depende de serviços de apoio |
| `GET /api/hits` | Incrementa um contador **no Redis** (prova de processo sem estado); `503` se `REDIS_URL` não estiver definido |
| `GET /api/work?ms=2000` | Requisição lenta simulada, usada na demonstração de desligamento gracioso |
| `GET /` | Identificação do serviço e lista de rotas |

## Variáveis de ambiente

Todas lidas em um único lugar, [`src/config.js`](src/config.js), validadas na partida (valor inválido → saída `78`). Modelo em [`.env.example`](.env.example).

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3000` (`8080` na imagem) | Porta de escuta |
| `HOST` | `0.0.0.0` | Interface de escuta |
| `LOG_LEVEL` | `info` | `fatal` `error` `warn` `info` `debug` `trace` `silent` |
| `SERVICE_NAME` | `twelve-factor-health` | Campo `service` em cada linha de log |
| `REDIS_URL` | *(vazio)* | Serviço de apoio; vazio = modo desanexado |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Prazo para drenar requisições após SIGTERM |
| `RELEASE_VERSION` | `dev` | Identidade do release, injetada no build |
| `NODE_ENV` | `development` | Informativo |
| `TUNNEL_TOKEN` | *(vazio)* | Só para o perfil `tunnel` do Compose. **Segredo** |

`.env` serve apenas ao desenvolvimento local e está no `.gitignore`. Variáveis reais do ambiente sempre prevalecem sobre ele (`node --env-file-if-exists`).

## Scripts de build, release e execução

| Etapa | Comando | O que faz |
|---|---|---|
| Build | `scripts/build.sh` | `npm ci` + testes + `docker build`, imagem marcada com o hash do commit |
| Release | `scripts/release.sh [imagem] [env-file]` | Roda `admin.js check` com a imagem **e** a configuração, marca `vAAAAMMDDhhmmss-<sha>` e registra em `releases.log` |
| Run (host) | `scripts/start.sh` / `scripts/start.sh -d` | Primeiro plano, ou segundo plano com PID em `.run/` |
| Stop (host) | `scripts/stop.sh` | Envia SIGTERM e espera a drenagem (SIGKILL só após 15 s) |
| Run (containers) | `docker compose up -d` / `docker compose down` | Compose envia SIGTERM e espera `stop_grace_period: 15s` |
| Testes | `npm test` | `node:test` com `fastify.inject`, sem dependências de desenvolvimento |
| Demo SIGTERM | `scripts/demo-sigterm.sh` | Requisição de 3 s em andamento + SIGTERM → termina com 200, processo sai com 0 |
| Tarefas admin | `npm run admin:check` · `admin:config` · `admin:reset-hits` | Mesmo código, mesma config (em container: `docker compose exec web1 node bin/admin.js check`) |

## Mapeamento dos Doze Fatores

| # | Fator | Onde está | Como |
|---|---|---|---|
| I | Base de código | Este repositório; [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Um repositório, uma aplicação, vários deploys (host, compose, túnel) a partir do mesmo commit |
| II | Dependências | [`package.json`](package.json), [`package-lock.json`](package-lock.json), [`.nvmrc`](.nvmrc), [`Dockerfile`](Dockerfile) | Versões exatas (`--save-exact`), `engines.node`, `npm ci --omit=dev`; nada depende de pacotes do sistema |
| III | Configuração | [`src/config.js`](src/config.js), [`.env.example`](.env.example) | Único leitor de `process.env`, validação e objeto congelado; nenhum arquivo de config por ambiente |
| IV | Serviços de apoio | [`src/redis.js`](src/redis.js), [`compose.yaml`](compose.yaml) | Redis localizado só por `REDIS_URL`; trocar por um Redis gerenciado é mudança de config |
| V | Build, release, run | [`scripts/build.sh`](scripts/build.sh), [`scripts/release.sh`](scripts/release.sh), [`Procfile`](Procfile), [`Dockerfile`](Dockerfile) | Imagem imutável por commit → release = imagem + config verificada → execução; `RELEASE_VERSION` aparece no `/health` |
| VI | Processos | [`src/app.js`](src/app.js) (`/api/hits`), [`compose.yaml`](compose.yaml) (`read_only: true`) | Nenhum estado em memória ou disco; contador vive no Redis; filesystem do container somente leitura |
| VII | Vinculação de porta | [`src/server.js`](src/server.js), [`src/config.js`](src/config.js) | O processo exporta HTTP sozinho em `$PORT`, sem servidor web externo |
| VIII | Concorrência | [`Procfile`](Procfile), [`compose.yaml`](compose.yaml) (`web1`, `web2`) | Tipos de processo `web` e `release`; escala horizontal replicando `web` |
| IX | Descartabilidade | [`src/server.js`](src/server.js) (`shutdown`), [`scripts/demo-sigterm.sh`](scripts/demo-sigterm.sh), [`scripts/stop.sh`](scripts/stop.sh) | Partida em < 1 s; SIGTERM → `/health` 503, fecha o listener, drena, fecha Redis, sai 0; timeout força saída 1 |
| X | Paridade dev/prod | [`Dockerfile`](Dockerfile), [`compose.yaml`](compose.yaml), [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Mesma imagem e mesmo Redis 8 em dev, CI e deploy público |
| XI | Logs | [`src/app.js`](src/app.js) (opções do logger) | Uma linha JSON por evento no stdout, com `reqId`, `release`, `host`, `responseTime`; sem arquivos nem rotação |
| XII | Processos administrativos | [`bin/admin.js`](bin/admin.js), `npm run admin:*` | Tarefas pontuais no mesmo código e release, lendo a mesma `loadConfig()` |

**Adiado ou parcial, e por quê**

- **X — paridade:** o modo host (`npm start`) roda fora de container; é conveniência de desenvolvimento, e o caminho recomendado é o Compose, idêntico ao deploy.
- **V — release:** `releases.log` é um registro local. Numa plataforma real o registro de releases e o rollback são responsabilidade dela (registry de imagens + orquestrador).
- **Segredos:** `TUNNEL_TOKEN` fica num `.env` local. O próximo passo seria um cofre de segredos (Docker secrets, Vault, secrets do provedor).
- **Observabilidade além de logs:** não há métricas (`/metrics`) nem tracing distribuído. `x-request-id` é propagado e registrado, o que prepara o terreno.

## Estrutura

```
.
├── src/            config.js · app.js · redis.js · server.js
├── bin/admin.js    tarefas administrativas pontuais
├── scripts/        build · release · start · stop · demo-sigterm
├── test/           node:test
├── deploy/cloudflare/  Worker de borda + wrangler.jsonc (binding VPC Service)
├── docs/AI-COLLABORATION.md   prompts e decisões com o agente de IA
├── Dockerfile · compose.yaml · Procfile · .env.example · .nvmrc
└── .github/workflows/ci.yml
```

## Arquitetura do deploy

```
navegador ──HTTPS──▶ twelve-factor-health.danielrody.workers.dev   (Worker, deploy/cloudflare/worker.js)
                         │ binding env.APP  (Workers VPC Service "twelve-factor-health-web1")
                         ▼
               túnel Zero Trust "twelve-factor-health"   (só saída; nenhuma porta aberta no host)
                         ▼
          cloudflared ──▶ web1 172.30.0.11:8080 ──▶ redis:6379   (rede do Compose)
```

A conta Cloudflare não tem zona DNS própria. Um túnel nomeado precisa de um hostname para ter ingress público, então a borda é um Worker em `workers.dev` que alcança a origem pelo túnel com um binding **Workers VPC**. A origem continua inacessível pela internet, exceto através desse binding.

O VPC Service aponta para o **IP fixo** de `web1` (sub-rede `172.30.0.0/24` no `compose.yaml`), não para o nome `web1`. O DNS interno do Docker responde com TTL de 600 s e a borda guarda a resolução; ao recriar os containers os IPs trocaram e o tráfego público caiu em silêncio no `web2`. Com endereço fixo, recriar containers (fator IX) não muda o destino.

## Colaboração com IA

O registro completo de prompts, iterações e decisões está em [`docs/AI-COLLABORATION.md`](docs/AI-COLLABORATION.md).

## Licença

[MIT](LICENSE)
