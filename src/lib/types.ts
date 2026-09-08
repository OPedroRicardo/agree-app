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
  /** Always `""` today — the backend never populates it (see TODO.md). */
  senderAvatarUrl: string;
  content: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
};

/** Um participante de um canal de voz — ver `docs/voice-client.md`. */
export type VoiceParticipant = {
  socketId: string;
  userId: string;
  username: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
};

export type VoiceIceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/** Ack de `voice:join`. */
export type VoiceJoinAck = {
  channelId: string;
  selfId: string;
  socketId: string;
  topology: 'mesh' | 'sfu';
  participants: VoiceParticipant[];
  iceServers: VoiceIceServer[];
  bitrate: { audio: { maxBitrate: number } };
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
