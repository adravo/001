import { FormEvent, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../lib/api';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  isSpeaking: boolean;
  errorMessage: string | null;
  onSend: (text: string) => void;
}

export function ChatPanel({ messages, isLoading, isSpeaking, errorMessage, onSend }: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const listEndRef = useRef<HTMLDivElement>(null);

  const { isSupported, isListening, interimTranscript, start, stop } = useSpeechRecognition((finalText) => {
    onSend(finalText);
  });

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isLoading) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty-hint">
            Ask the trainer a question about your uploaded training material — try the Admin tab to add some first.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.content}
          </div>
        ))}
        {interimTranscript && <div className="chat-bubble chat-bubble--trainee chat-bubble--interim">{interimTranscript}</div>}
        {isLoading && <div className="chat-bubble chat-bubble--assistant chat-bubble--pending">Thinking…</div>}
        <div ref={listEndRef} />
      </div>

      {errorMessage && <div className="chat-error">{errorMessage}</div>}

      <form className="chat-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a training question…"
          disabled={isLoading}
        />
        {isSupported && (
          <button
            type="button"
            className={`mic-button ${isListening ? 'mic-button--active' : ''}`}
            onClick={() => (isListening ? stop() : start())}
            title={isListening ? 'Stop listening' : 'Ask by voice'}
          >
            {isListening ? '● Listening' : '🎙'}
          </button>
        )}
        <button type="submit" disabled={isLoading || !draft.trim()}>
          Send
        </button>
      </form>
      {isSpeaking && <div className="speaking-indicator">Avatar is speaking…</div>}
    </div>
  );
}
