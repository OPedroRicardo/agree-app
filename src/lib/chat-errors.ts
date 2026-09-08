/**
 * Every message the chat WS gateway's `error` event can carry, mapped to
 * PT-BR text safe to show the user. Sourced from `WsGlobalExceptionFilter`
 * (`agree/src/common/filters/ws-exception.filter.ts`), which only unwraps
 * `BadRequestException`/`WsException` — anything else (a raw DB/driver
 * error, for instance) reaches the client as `Internal server error`. Never
 * show a message that isn't in this map verbatim: it may be backend/SQL
 * detail that leaked through `ChatGateway`'s catch-all.
 */
const KNOWN_CHAT_ERRORS: Record<string, string> = {
  // Handled by a silent auto-resubscribe-and-retry in AppShell; only reaches
  // the user if that retry itself failed.
  'Subscribe to this channel before sending messages':
    'Não foi possível reenviar sua mensagem depois de reconectar. Tente enviar de novo.',
  "You are not a member of this channel's server":
    'Você não é mais membro do servidor deste canal.',
  'One or more participants do not exist':
    'Um dos participantes dessa conversa não existe mais.',
};

const MESSAGE_TOO_LONG = 'Mensagem muito longa (máximo de 1024 caracteres).';
const GENERIC_CHAT_ERROR = 'Não foi possível enviar a mensagem. Tente novamente.';

/** Shape of the payload `client.emit('error', ...)` sends — see `WsGlobalExceptionFilter`. */
export type ChatErrorPayload = {
  message?: string;
  errors?: { property: string; constraints?: Record<string, string> }[];
};

/** Translates a chat WS `error` event into PT-BR text safe to show the user. */
export function describeChatError(payload: ChatErrorPayload | undefined): string {
  const message = payload?.message;
  if (!message) return GENERIC_CHAT_ERROR;

  if (message === 'Validation failed') {
    const tooLong = payload?.errors?.some(
      (err) => err.property === 'message' && err.constraints && 'maxLength' in err.constraints,
    );
    return tooLong ? MESSAGE_TOO_LONG : GENERIC_CHAT_ERROR;
  }

  return KNOWN_CHAT_ERRORS[message] ?? GENERIC_CHAT_ERROR;
}
