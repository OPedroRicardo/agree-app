# Agree App

Frontend do **Agree** — cliente de chat estilo Discord, construído em **Next.js (App Router) + TypeScript + Tailwind CSS v4**, conectado de verdade ao [backend do Agree](../agree) (REST + WebSocket).

O visual (glassmorphism, tema escuro "Nocturne") foi importado de um protótipo feito no Claude Design (`Agree.dc.html`) e reimplementado como componentes React reais que conversam com a API, em vez de dados mockados.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS v4** (tokens de design via `@theme` em `src/app/globals.css`)
- **socket.io-client** para o chat em tempo real
- **lucide-react** para ícones

## Pré-requisitos

- Node.js 20+ (validado com Node 24)
- O [backend do Agree](../agree) rodando (Postgres + MongoDB via Docker, `yarn start`) — veja o README dele para subir a infraestrutura, aplicar as migrations e rodar o seed (`yarn mongodb:seed`, cria o usuário `admin@example.com` / `admin123`)

## Configuração do ambiente

```bash
cp .env.example .env.local
```

| Variável                | Descrição                                                             | Default                 |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------ |
| `AGREE_BACKEND_URL`      | URL do backend agree — **só usada no servidor** (rotas `/api/*`), nunca chega ao navegador | `http://localhost:3000`  |
| `NEXT_PUBLIC_CHAT_WS_URL` | URL do WebSocket do chat (`ChatGateway`, porta fixa) — o navegador conecta direto nela | `http://localhost:4040`  |

## Rodando

```bash
npm install
npm run dev
```

O app sobe em **`http://localhost:3001`** (porta fixada em `package.json` porque o backend já usa a `3000`). Faça login com `admin@example.com` / `admin123` (ou os demais usuários gerados pelo seed do backend).

```bash
npm run build
npm run start   # também sobe em 3001
npm run lint
```

## Como a integração com o backend funciona

O backend do Agree (`../agree`) não tem conceito de **canais** dentro de um servidor nem de **DMs**/lista de membros — só existem `POST/GET /server` (MongoDB), `GET /chat/:channelId` e o WebSocket de chat (Postgres via Drizzle). Para manter o front 100% conectado a dados reais (nada mockado), as seguintes decisões foram tomadas:

- **Cada servidor é tratado como um único canal `#geral`** — o `channelId` usado no chat é o próprio `_id` do servidor no MongoDB. Isso funciona sem precisar inventar um schema de canais no backend.
- **Mensagens diretas e lista de membros/status online ficam desabilitadas na UI** ("em breve"), em vez de mockadas — o backend não expõe diretório de usuários nem presença.
- **Criar servidor** (`POST /server`) é real — o botão "+" na barra de servidores abre um formulário que grava no Mongo.
- **Histórico de mensagens** (`GET /chat/:channelId`) e **envio em tempo real** (WebSocket, evento `chat` no namespace `/chat`, porta `4040`) usam a API tal como está.

### Ajustes feitos no backend para viabilizar essa integração

Durante a implementação do front, três problemas foram encontrados no backend e corrigidos lá (não é código deste projeto, mas documentado aqui porque afeta diretamente esta integração):

1. **CORS do WebSocket** (`chat.gateway.ts`) estava fixo em `http://127.0.0.1:5500` — passou a aceitar também `http://localhost:3001` (origem deste app).
2. **`GET /chat/:conversationId` era inutilizável pelo front**: esperava o UUID interno do Postgres (`conversations.id`), que nunca era exposto por nenhum endpoint. Agora a rota aceita o `channelId` do Mongo e resolve a conversa internamente (`ChatService.findAllByChannel`).
3. **Bug real de autenticação no Gateway WS**: o guard global de JWT (`APP_GUARD`) não estava sendo aplicado aos handlers do `ChatGateway` — `@User()` chegava `undefined` e qualquer mensagem enviada quebrava com `Cannot read properties of undefined (reading 'sub')`. Corrigido adicionando `@UseGuards(AuthGuard)` explicitamente no gateway (e registrando `AuthGuard` como provider do `ChatModule`). Sem essa correção, o chat em tempo real não funcionava de jeito nenhum.
4. O gateway também passou a **transmitir a mensagem completa** (id, `senderUsername`, `createdAt`, etc.) em vez de só a string do texto, para o front conseguir renderizar autor e horário sem outra requisição.
5. O `AuthGuard` do WS passa a **aceitar o JWT via cookie** (`agree_token`), além do `Authorization`/`handshake.auth.token` de antes — necessário depois que o front parou de guardar o token em JS (ver abaixo).

Lista completa em [`../CHANGES.md`](../CHANGES.md) (raiz de `guilda/`). `yarn jest` no backend: 50/50 passando.

### Sessão: cookie httpOnly, não localStorage

O JWT deste backend expira em 7 dias (originalmente 60s — aumentado em `auth.module.ts`) e não existe endpoint de refresh. O token **nunca chega a rodar em JavaScript no navegador**:

- `POST /api/auth/login` (Route Handler deste app, não o backend diretamente) troca as credenciais pelo JWT do backend e grava num cookie `httpOnly` (`agree_token`, `sameSite: 'lax'`) — a resposta pro navegador é só `{ok: true}`.
- Toda chamada REST subsequente (`/api/auth/me`, `/api/servers`, `/api/chat/:channelId`) é servida por uma rota `/api/*` deste app (`src/app/api/**/route.ts`), que lê o cookie no servidor e repassa `Authorization: Bearer <token>` pro backend real — o `fetch` do lado do cliente (`src/lib/api.ts`) nunca sabe o valor do token.
- O WebSocket conecta **direto** no `ChatGateway` (não dá pra proxyar um WS por Route Handler do Next), mas como o cookie é `httpOnly` e o `sameSite` é compatível (mesmo "site" `localhost`, portas diferentes), o navegador o anexa sozinho no handshake — o backend passou a ler `agree_token` do header `Cookie` do handshake (ver `../CHANGES.md`).
- Qualquer `401` numa rota `/api/*` ou erro `Unauthorized` do WS chama `expireSession()` (`src/lib/auth-context.tsx`), que limpa o cookie via `/api/auth/logout` e volta pro login com aviso.
- Limitação conhecida: isso depende de front e backend serem "mesmo site" pro navegador (funciona com `localhost:3001`/`localhost:4040`). Em produção com domínios registráveis diferentes, o cookie não seguiria sozinho pro WS — ver `../TODO.md`.

## Estrutura

```
src/
  app/
    layout.tsx           # fontes (Inter + JetBrains Mono), AuthProvider
    page.tsx              # rota "/" protegida — AppShell ou redirect pra /login
    login/page.tsx          # rota "/login" pública — LoginScreen ou redirect pra /
    globals.css               # tokens de design (Nocturne) via @theme do Tailwind v4
    api/
      auth/login/route.ts       # POST — troca credenciais por JWT, grava cookie httpOnly
      auth/me/route.ts            # GET — perfil, lê o cookie
      auth/logout/route.ts          # POST — apaga o cookie
      servers/route.ts                # GET/POST — proxy de /server
      chat/[channelId]/route.ts         # GET — proxy de /chat/:channelId
  components/
    LoginScreen.tsx      # formulário de login
    LoadingScreen.tsx      # placeholder "Carregando…" compartilhado pelas rotas
    AppShell.tsx             # orquestra servidores, mensagens e o socket
    ServerRail.tsx              # coluna de servidores (GET/POST /server)
    ChannelSidebar.tsx             # canal "geral" + rodapé do usuário logado
    ChatArea.tsx                      # histórico + composer + WebSocket
    MembersPanel.tsx                     # placeholder "em breve"
    CreateServerModal.tsx                   # POST /server
    Avatar.tsx                                 # avatar com iniciais (ou foto real, se vier)
  lib/
    api.ts             # cliente fetch para as rotas /api/* deste app (não o backend direto)
    socket.ts             # cliente socket.io para o ChatGateway (cookie automático)
    auth-context.tsx         # estado de sessão (sem token em JS) + expiração
    server-auth.ts               # servidor apenas: ler/gravar/apagar o cookie httpOnly
    types.ts                        # tipos compartilhados com o shape da API
```

## O que NÃO foi verificado manualmente

Este projeto foi validado via `tsc`, `eslint`, `next build` e testes de integração via linha de comando (login → WS → histórico REST, ver notas do backend). **O fluxo completo pela interface no navegador não foi testado manualmente** — antes de considerar pronto, confira:

- Login real pela tela (credenciais corretas e incorretas).
- Envio e recebimento de mensagens em tempo real entre duas abas/usuários diferentes.
- Criar servidor pelo modal e ver ele aparecer na barra lateral.
- Comportamento ao expirar a sessão (token vencido/adulterado, tentar enviar uma mensagem ou navegar).
- Responsividade / layout em telas menores (o protótipo original era desktop-only).
