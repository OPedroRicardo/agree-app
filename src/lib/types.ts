/** `GET /auth/profile` response — the JWT payload (`sub`/`username`) plus `profileImageUrl`, looked up fresh from Mongo on every call since it's never re-embedded in the token. */
export type LoggedUser = {
  sub: string;
  username: string;
  profileImageUrl: string | null;
};

/** A Mongo `Server` document. Channels are a sub-resource — see {@link AgreeChannel}. `ownerId` is absent on servers seeded before that field existed — treat a missing/mismatched `ownerId` as "not the owner", never as "owner unknown, allow it". */
export type AgreeServer = {
  _id: string;
  name: string;
  description: string;
  logoImg: string;
  bannerImage: string;
  ownerId?: string;
};

/** A channel embedded in a `Server` document. `_id` is the chat `channelId` used by the WS gateway and `/chat/:channelId`. */
export type AgreeChannel = {
  _id: string;
  name: string;
  type: 'text' | 'voice';
};

/** A Postgres `messages` row. */
export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderUsername: string;
  /** The sender's `profileImageUrl` as of when the message was sent; `""` when they had none (and on every message sent before the backend populated it). */
  senderAvatarUrl: string;
  content: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
};

/** De onde vem uma track publicada no SFU — também é o nome dela lá (`trackName === source`). */
export type VoiceTrackSource = 'mic' | 'camera' | 'screen' | 'screen-audio';

/** Camadas de simulcast, da melhor pra pior. */
export type SimulcastRid = 'f' | 'h' | 'q';

/** Perfil de screenshare: nitidez (texto/código) ou fluidez (vídeo/jogo) — cada um tem sua ladder. */
export type VoiceContentHint = 'detail' | 'motion';

/** Uma track que um participante publica no SFU. */
export type VoiceTrack = {
  trackName: VoiceTrackSource;
  source: VoiceTrackSource;
  kind: 'audio' | 'video';
  /** Só no `screen`. */
  contentHint?: VoiceContentHint;
  /** Camadas oferecidas, melhor primeiro. `[]` no áudio. */
  rids: SimulcastRid[];
};

/** Um participante de um canal de voz — ver `docs/voice-client.md`. */
export type VoiceParticipant = {
  socketId: string;
  userId: string;
  username: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
  /** O que ele publica no SFU; sempre `[]` no mesh. */
  tracks: VoiceTrack[];
};

export type VoiceIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type VoiceTopology = 'mesh' | 'sfu';

/** Uma camada de simulcast, já no formato de `sendEncodings`. */
export type SimulcastEncoding = {
  rid: SimulcastRid;
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
};

/** Constraints de captura + as camadas a codificar a partir dela (relativas ao capturado). */
export type SimulcastProfile = {
  capture: { width: number; height: number; frameRate: number };
  encodings: SimulcastEncoding[];
};

export type VideoProfileName = 'camera' | 'screenDetail' | 'screenMotion';

/** Política de vídeo do servidor: o publish é recusado se a offer fugir dela. */
export type VoiceVideoPolicy = {
  codecs: string[];
  profiles: Record<VideoProfileName, SimulcastProfile>;
};

/** Ack de `voice:join`. */
export type VoiceJoinAck = {
  channelId: string;
  selfId: string;
  socketId: string;
  topology: VoiceTopology;
  participants: VoiceParticipant[];
  iceServers: VoiceIceServer[];
  bitrate: { audio: { maxBitrate: number } };
  /** `null` = backend sem SFU: sem vídeo, e a sala enche no limite do mesh. */
  video: VoiceVideoPolicy | null;
};

/** A Mongo `User`, as exposed by `GET /users` — public fields only. */
export type AgreeUser = {
  id: string;
  username: string;
  profileImageUrl: string | null;
};

/** One participant of a `AgreeConversation`, hydrated from Mongo by the backend. */
export type ConversationParticipant = {
  id: string;
  username: string | null;
  profileImageUrl: string | null;
};

/** A Postgres `conversations` row of type `dm`/`group`, as returned by `GET /chat/conversations`. */
export type AgreeConversation = {
  id: string;
  type: 'dm' | 'group';
  participants: ConversationParticipant[];
  createdAt: string | null;
  lastMessageAt: string | null;
};
