/** Decoded JWT payload from `GET /auth/profile`. */
export type LoggedUser = {
  sub: string;
  username: string;
};

/** A Mongo `Server` document. No channel sub-resource — `_id` doubles as the chat `channelId`. */
export type AgreeServer = {
  _id: string;
  name: string;
  description: string;
  logoImg: string;
  bannerImage: string;
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
