import { memo, useMemo, useState } from 'react';
import { isEmojiOnly, tokenize, type EmojiToken } from '@/lib/emoji';
import type { AgreeCustomEmoji } from '@/lib/types';

/**
 * Texto de uma mensagem com emojis unicode trocados pela imagem do Twemoji e
 * `:nome:` trocado pelo emoji custom do servidor. `memo` porque a lista
 * inteira re-renderiza a cada mensagem nova e tokenizar 50 mensagens de novo
 * é trabalho à toa.
 */
export const MessageContent = memo(function MessageContent({
  text,
  customEmojis,
}: {
  text: string;
  customEmojis: AgreeCustomEmoji[];
}) {
  const tokens = useMemo(() => tokenize(text, customEmojis), [text, customEmojis]);
  const jumbo = useMemo(() => isEmojiOnly(tokens), [tokens]);

  return (
    <div className="wrap-break-word text-[14px] leading-relaxed">
      {tokens.map((token, i) =>
        token.type === 'text' ? (
          <span key={i}>{token.value}</span>
        ) : (
          <EmojiImage key={i} token={token} size={jumbo ? 'jumbo' : 'inline'} />
        ),
      )}
    </div>
  );
});

/**
 * Um emoji como `<img>` de tamanho fixo (em `em`, acompanha a fonte) para não
 * deslocar o layout enquanto carrega — o scroll-para-o-fim do `ChatArea`
 * depende da altura estável. Se a imagem falhar (offline, CDN fora, URL de
 * custom quebrada), volta pro caractere ou pro `:nome:` literal.
 */
export function EmojiImage({
  token,
  size = 'inline',
}: {
  token: Exclude<EmojiToken, { type: 'text' }>;
  /** `inline` acompanha a fonte do texto; `jumbo` é a mensagem só de emojis; número é px fixo (picker, listas). */
  size?: 'inline' | 'jumbo' | number;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = token.type === 'emoji' ? token.char : `:${token.name}:`;

  if (failed) return <span>{fallback}</span>;

  const sizeClass =
    size === 'inline' ? 'h-[1.375em] w-[1.375em] align-[-0.3em]' : size === 'jumbo' ? 'mx-0.5 h-[3em] w-[3em] align-middle' : 'align-middle';
  return (
    <img
      src={token.url}
      alt={fallback}
      title={fallback}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`inline-block object-contain ${sizeClass}`}
      style={typeof size === 'number' ? { width: size, height: size } : undefined}
    />
  );
}
