import { useCallback, useEffect, useRef, useState } from 'react';
import './ChatPanel.css';

interface ChatMessage {
  id: number;
  from: 'user' | 'command' | 'oracle' | 'forge' | 'hermes' | 'system';
  text: string;
  taskIds?: string[];
  streaming?: boolean;
}

interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

async function *readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<SSEEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n');
        let event = 'message';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            event = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6);
          }
        }
        if (dataStr) {
          try {
            yield { event, data: JSON.parse(dataStr) };
          } catch {
            // skip malformed
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const msgIdRef = useRef(0);
  const streamTextRef = useRef('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMsg = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    const id = ++msgIdRef.current;
    setMessages((prev) => [...prev, { ...msg, id }]);
    return id;
  }, []);

  const updateMsg = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setSending(true);

    const roomMatch = text.match(/@(oracle|forge|hermes)/i);
    const room = roomMatch ? roomMatch[1].toLowerCase() : 'command';
    const roomNames: Record<string, string> = { command: '指挥中心', oracle: '策略室', forge: '工程室', hermes: '媒体室' };

    addMsg({ from: 'user', text });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, targetRoom: room, mode: 'chat' }),
      });

      if (!response.ok || !response.body) {
        addMsg({ from: 'system', text: `请求失败 (${response.status})` });
        setSending(false);
        return;
      }

      streamTextRef.current = '';
      const agentMsgId = addMsg({ from: room as ChatMessage['from'], text: '', streaming: true });

      for await (const ev of readSSE(response.body)) {
        switch (ev.event) {
          case 'text': {
            const delta = String(ev.data.delta || '');
            streamTextRef.current += delta + '\n';
            updateMsg(agentMsgId, { text: streamTextRef.current, streaming: true });
            break;
          }
          case 'task.created': {
            const tid = String(ev.data.taskId || '');
            const ttype = String(ev.data.type || '');
            const ttitle = String(ev.data.title || '');
            const troom = roomNames[ttype] || ttype;
            addMsg({ from: 'system', text: `任务已创建 → ${troom}：${ttitle}`, taskIds: [tid] });
            break;
          }
          case 'done': {
            const summary = String(ev.data.summary || '');
            updateMsg(agentMsgId, { streaming: false });
            if (summary && summary !== '对话完成') {
              addMsg({ from: 'system', text: summary });
            }
            break;
          }
          case 'error': {
            updateMsg(agentMsgId, { text: `错误: ${ev.data.error}`, streaming: false });
            break;
          }
        }
      }
    } catch (err) {
      addMsg({ from: 'system', text: `连接失败: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setSending(false);
    }
  }, [input, sending, addMsg, updateMsg]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send],
  );

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h3>指挥中心对话</h3>
        <span className="room-hint">@oracle / @forge / @hermes</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 && (
          <div className="chat-msg system">
            输入消息与工作室对话。使用 @oracle / @forge / @hermes 指定工作室。
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-msg ${msg.from === 'user' ? 'user' : msg.from === 'system' ? 'system' : 'agent'}${msg.streaming ? ' streaming' : ''}`}
          >
            {(msg.from !== 'user' && msg.from !== 'system') && (
              <div className="msg-room">{msg.from}</div>
            )}
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {msg.text}
              {msg.streaming && <span className="cursor" />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息... (@oracle / @forge / @hermes)"
          disabled={sending}
        />
        <button onClick={send} disabled={sending || !input.trim()}>
          {sending ? '···' : '发送'}
        </button>
      </div>
    </div>
  );
}
