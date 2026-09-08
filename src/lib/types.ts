/** Decoded JWT payload from `GET /auth/profile`. */
export type LoggedUser = {
  sub: string;
  username: string;
};

/** A Mongo `Server` document. Channels are a sub-resource — see {@link AgreeChannel}. */
export type AgreeServer = {
  _id: string;
  name: string;
  description: string;
  logoImg: string;
  bannerImage: string;
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
