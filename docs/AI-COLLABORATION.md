# Colaboração com o agente de IA

Agente: **Claude Code** (modelo Claude Opus 5.5), em sessão de terminal com acesso ao shell, ao Docker, ao `gh` e a um servidor MCP da Cloudflare.
Data: 27 de setembro de 2026.

## Prompts principais

| # | Prompt (resumo) | Resultado |
|---|---|---|
| P1 | Enunciado completo do laboratório #4 (fundamentos, entregáveis e rubrica), mais: *"use os outros laboratórios como referência de formato na documentação (skills mdpdf e a que roda o Playwright e pega as telas)"* | O agente leu os relatórios dos labs 1–3 para copiar a estrutura (capa, índice analítico, entregáveis numerados, apêndices, `mdpdf.toml`) e propôs a stack antes de escrever código |
| P2 | *(interrupção)* rejeitei um comando longo que criava todos os scripts **e** já rodava a demo de SIGTERM, e conectei o MCP da Cloudflare: *"Conectei o mcp da cloudflare, pode continuar"* | O agente recriou os arquivos, deixou o Quick Tunnel como plano B e passou a criar um **túnel Zero Trust nomeado** pela API |
| P3 | *"Depois coloque o repositório aqui"* + comandos `git remote` do GitLab da turma | O repositório ganhou dois remotes: GitHub (público, `old-origin`) e GitLab (entrega, `origin`) |

## Decisões e iterações

1. **Node.js 24 + Fastify, e não Express.** Fastify já traz o pino (logs JSON), `return503OnClosing` e `forceCloseConnections`, que cobrem os fatores IX e XI sem bibliotecas extras. Resultado: **duas** dependências de runtime (`fastify`, `ioredis`), nenhuma de desenvolvimento.
2. **Sem `dotenv`.** O Node 24 lê `.env` sozinho (`--env-file-if-exists`), e variáveis reais têm precedência. É uma dependência a menos, e o `.env` fica claramente restrito ao desenvolvimento.
3. **Redis como serviço de apoio real.** Um `/health` sozinho não prova o fator VI. O contador `/api/hits` no Redis, servido alternadamente por `web1` e `web2`, prova que nenhum estado vive no processo. Sem `REDIS_URL` a rota devolve 503: o agente propôs **não** ter fallback em memória, justamente porque ele funcionaria por acaso numa réplica e falharia em duas.
4. **`/health` (readiness) separado de `/health/live` (liveness).** Liveness nunca depende do Redis, senão uma queda do Redis faria o orquestrador reiniciar processos saudáveis em cascata.
5. **Filesystem read-only no Compose.** Com `read_only: true`, uma escrita local acidental quebra na hora, em vez de funcionar em silêncio numa réplica só.
6. **Correções encontradas ao executar, não ao escrever:**
   - `node --test test/` tratava o diretório como arquivo e falhava; passou a ser `node --test test/*.test.js`.
   - Os logs saíam com `level: 30` e timestamp em epoch; mudaram para `level: "info"` e ISO-8601, legíveis por humanos e por agregadores.
   - A demo de SIGTERM imprimia duas linhas quando a conexão era recusada; foi reescrita com `if`.
   - A mensagem `config valid` aparecia mesmo quando o Redis estava fora; virou `config loaded`, seguida do erro.
7. **Cloudflare sem zona DNS.** A conta não tem domínio, então um túnel nomeado não teria hostname público. Em vez de voltar ao Quick Tunnel (URL efêmero, sem conta), o agente consultou a documentação pelo MCP e montou: túnel remoto `twelve-factor-health` → **VPC Service** (`web1:8080`, DNS resolvido pelo túnel) → Worker em `danielrody.workers.dev` com binding `vpc_service`. Tudo feito pela API: criação do túnel, token, VPC Service, subdomínio `workers.dev`, upload do Worker.
8. **Token do túnel.** Foi obtido pela API e gravado **apenas** no `.env` local (gitignored, permissão 600). O Compose falha com mensagem clara se ele faltar (`${TUNNEL_TOKEN:?...}`).

## O que eu mudei ou recusei

- Recusei a execução "tudo de uma vez" (P2): prefiro ver os arquivos criados antes de rodar scripts que sobem processos.
- Troquei o plano de deploy de Quick Tunnel para túnel Zero Trust nomeado, conectando a conta Cloudflare.
- Defini o destino final da entrega (GitLab da turma).

## Próximos passos para conformidade total

- Registry de imagens e releases imutáveis gerenciados pela plataforma (fator V), em vez de `releases.log`.
- Segredos num cofre, não num `.env` (fator III).
- Hospedar a origem numa VM ou num PaaS permanente, para o URL público não depender da minha máquina ligada (fator X).
- Métricas Prometheus e tracing OpenTelemetry, complementando os logs (fator XI).
