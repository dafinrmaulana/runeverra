// Online chat: a button with an unread badge, a bottom sheet, and a short bubble for incoming
// messages. Messages are plain text (React escapes them); nothing is linked or interpreted.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { room } from '../online';
import { Modal, Switch } from './ui';
import { TEAM_NAMES } from '../../engine/index.ts';

const QUICK = ['GG', 'Good luck!', 'Nice move!', 'Rematch?', 'Hurry up?'];

function useRoom() {
  useSyncExternalStore(room.subscribe, room.getVersion);
  return room;
}

export function ChatButton({ className = '' }: { className?: string }) {
  const r = useRoom();
  const [open, setOpen] = useState(false);
  if (!r.canChat) return null;
  const toggle = (on: boolean) => {
    setOpen(on);
    r.setChatOpen(on);
  };
  return (
    <>
      <button
        type="button"
        className={`btn icon-btn chat-btn ${className}`}
        onClick={() => toggle(true)}
        aria-label={`Chat${r.unread ? `, ${r.unread} unread` : ''}`}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
        </svg>
        Chat
        {r.unread > 0 && (
          <span className="chat-badge" aria-hidden="true">
            {r.unread > 9 ? '9+' : r.unread}
          </span>
        )}
      </button>
      <ChatSheet open={open} onClose={() => toggle(false)} />
    </>
  );
}

function ChatSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const r = useRoom();
  const [text, setText] = useState('');
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, r.chat.length]);
  const send = (message: string) => {
    if (message.trim()) {
      r.sendChat(message);
      setText('');
    }
  };
  return (
    <Modal open={open} onClose={onClose} label="Chat" className="chat-card">
      <h3>Chat</h3>
      <ol className="chat-list" ref={list} aria-live="polite">
        {r.chatMuted ? (
          <li className="chat-empty">Chat is muted.</li>
        ) : r.chat.length === 0 ? (
          <li className="chat-empty">No messages yet. Say hi!</li>
        ) : (
          r.chat.map((message, index) => (
            <li key={`${message.ts}-${index}`} className={message.side === r.side ? 'mine' : 'theirs'}>
              <b>{message.side === r.side ? 'You' : TEAM_NAMES[message.side]}</b>
              <span>{message.text}</span>
            </li>
          ))
        )}
      </ol>
      <div className="chat-quick">
        {QUICK.map((phrase) => (
          <button key={phrase} type="button" className="btn tiny" onClick={() => send(phrase)}>
            {phrase}
          </button>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          send(text);
        }}
      >
        <input
          type="text"
          value={text}
          maxLength={200}
          placeholder="Write a message"
          aria-label="Message"
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn primary" type="submit" disabled={!text.trim()}>
          Send
        </button>
      </form>
      {r.chatNotice && (
        <p className="note" role="status">
          {r.chatNotice}
        </p>
      )}
      <p className="note">By chatting you agree to the Terms.</p>
      <Switch
        checked={r.chatMuted}
        onChange={(muted) => r.setChatMuted(muted)}
        label={
          <>
            <b>Mute chat</b>
            <small>Hide messages from your opponent</small>
          </>
        }
      />
      <button className="btn" type="button" onClick={onClose}>
        Close
      </button>
    </Modal>
  );
}

/** The newest message from the opponent for a few seconds, floating over the board; never takes taps. */
export function ChatBubble() {
  const r = useRoom();
  const last = r.chat[r.chat.length - 1];
  const [shown, setShown] = useState<string | null>(null);
  const seen = useRef(last?.ts ?? 0);
  useEffect(() => {
    if (!last || last.ts === seen.current) return;
    seen.current = last.ts;
    if (last.side === r.side || r.chatMuted || r.chatOpen) return;
    setShown(last.text);
    const t = setTimeout(() => setShown(null), 4000);
    return () => clearTimeout(t);
    // Only a new message should pop the bubble, not opening or muting the chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last?.ts]);
  if (!r.canChat || !shown) return null;
  return (
    <div className="chat-bubble" role="status">
      <b>Opponent</b> {shown}
    </div>
  );
}
