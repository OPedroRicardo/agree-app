# Agree App

Frontend do **Agree** — cliente de chat estilo Discord, construído em **Vite + React 19 + TypeScript + Tailwind CSS v4**, empacotável como app desktop via **Tauri**, conectado de verdade ao [backend do Agree](../agree) (REST + WebSocket).

O visual (glassmorphism, tema escuro "Nocturne") foi importado de um protótipo feito no Claude Design (`Agree.dc.html`) e reimplementado como componentes React reais que conversam com a API, em vez de dados mockados.

## Stack

- **Vite 6** + **React 19** + **react-router 7** (client-side, sem SSR)
- **TypeScript**
- **Tailwind CSS v4** (tokens de design via variáveis `--agree-*` em `src/index.css`, editáveis em runtime pela modal de Configurações)
- **socket.io-client** para o chat em tempo real
- **lucide-react** para ícones
- **Tauri 2** para o empacotamento desktop (janela nativa translúcida, ver `src-tauri/`)

## Pré-requisitos

- Node.js 20+
- O [backend do Agree](../agree) rodando (Postgres + MongoDB via Docker, `yarn start`) — veja o README dele para subir a infraestrutura, aplicar as migrations e rodar o seed (cria o usuário `admin@example.com` / `admin123`)
- Para rodar como app desktop: toolchain do Rust + dependências do Tauri ([guia oficial](https://tauri.app/start/prerequisites/))

## Configuração do ambiente

```bash
cp .env.example .env.local
```

`VITE_API_URL` e `VITE_WS_URL` apontam para o backend (padrão `http://localhost:3000` para ambos — o gateway de chat compartilha a porta HTTP do Nest, não tem porta própria).

## Rodando

```bash
npm install
npm run dev        # http://localhost:3001
```

Faça login com `admin@example.com` / `admin123` (ou os demais usuários gerados pelo seed do backend).

```bash
npm run build       # tsc --noEmit && vite build
npm run preview      # serve o build em :3001
npm run lint
```

### Como app desktop (Tauri)

```bash
npm run tauri dev    # janela nativa, hot reload
npm run tauri build   # instalador para a plataforma atual
```

## Como a integração com o backend funciona

- **Sessão via cookie httpOnly, não localStorage.** `POST /auth/login` (direto no backend, sem proxy — `src/lib/api.ts`) grava o JWT num cookie `httpOnly` (`agree_token`); o front nunca lê o token em JS. Toda chamada REST usa `credentials: 'include'`, e o handshake do WebSocket (`src/lib/socket.ts`, `withCredentials: true`) o anexa automaticamente. `AuthProvider` (`src/lib/auth-context.tsx`) resolve a sessão chamando `GET /auth/profile`; um `401` chama `expireSession()`.
- **Backend inalcançável vs. sessão expirada são estados distintos.** `status: 0` num `ApiError` (fetch falhou de verdade, sem resposta) leva a `ReconnectingScreen`, que faz polling de `GET /health` até o backend voltar — diferente de um 401, que é "backend respondeu, sem sessão".
- **Servidores, canais, DMs e histórico são todos reais**, não mockados: `GET/POST /server`, `GET/POST /server/:serverId/channel`, `GET /chat/:channelId`, `GET /users`, `GET /chat/conversations` e `GET /chat/conversations/:conversationId`. Envio em tempo real é via WebSocket (evento `chat` no namespace `/chat`).
- **Lista de membros/presença online** segue como placeholder ("em breve") — o backend não expõe presença.

Detalhes e decisões tomadas no backend para viabilizar essa integração (CORS do WS, autenticação do gateway, etc.) em [`../CHANGES.md`](../CHANGES.md) (raiz de `guilda/`).

## Estrutura

```
src/
  main.tsx                 # bootstrap: aplica tema salvo, monta <App>, AuthProvider
  App.tsx                  # rotas ("/login", "/") + ReconnectingScreen quando offline
  index.css                # tokens de design (Nocturne) via variáveis --agree-*
  pages/
    Login.tsx              # rota pública "/login" — LoginScreen ou redirect pra "/"
    Home.tsx               # rota protegida "/" — AppShell ou redirect pra "/login"
  components/
    LoginScreen.tsx        # formulário de login
    LoadingScreen.tsx      # placeholder "Carregando…"
    ReconnectingScreen.tsx # placeholder de reconexão quando o backend cai
    AppShell.tsx           # orquestra servidores, canais, DMs, mensagens e o socket
    ServerRail.tsx         # coluna de servidores + atalho pra DMs
    ChannelSidebar.tsx     # lista de canais do servidor ativo
    DmSidebar.tsx          # lista de conversas diretas
    ChatArea.tsx           # histórico (com paginação) + composer + WebSocket
    MembersPanel.tsx       # placeholder "em breve" (sem presença no backend)
    CreateServerModal.tsx  # POST /server
    CreateChannelModal.tsx # POST /server/:serverId/channel
    NewDmModal.tsx         # GET /users — picker pra iniciar uma DM
    SettingsModal.tsx      # perfil + editor de tema (cores e CSS custom)
    UserBar.tsx            # rodapé com usuário logado, logout e config
    Avatar.tsx             # avatar com iniciais (ou foto real)
    HoverPlayImage.tsx     # congela GIFs de logo até o hover
  lib/
    api.ts                 # cliente fetch pro backend (cookie httpOnly via credentials: 'include')
    socket.ts              # cliente socket.io pro ChatGateway
    auth-context.tsx       # estado de sessão (loading/unreachable/signed-out/signed-in)
    chat-errors.ts         # traduz erros do WS pra mensagens em PT-BR
    dm.ts                  # label e foto de exibição de uma conversa (a partir do outro participante)
    server-members.ts      # cache compartilhado de GET /server/:id/members (MembersPanel + VoiceStatusBar)
    theme.ts               # overrides de tema (--agree-*) e CSS custom, persistidos em localStorage
    types.ts               # tipos compartilhados com o shape da API
src-tauri/                 # shell desktop Tauri (janela nativa transparente, ver tauri.conf.json)
```
