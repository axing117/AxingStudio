import { useCallback, useEffect, useRef, useState } from 'react';
import { rooms, characters } from '@axing/remotion/workshopConfig';
import type { Task, TaskEvent } from '@axing/shared';
import { CharExpression } from './CharExpression';
import { StatusEffect } from './StatusEffect';
import './LiveWorkshop.css';

/* ------------------------------------------------------------------ */
/*  Agent type → 房间映射                                               */
/* ------------------------------------------------------------------ */
const agentRoom: Record<string, string> = {
  oracle: 'strategy',
  forge: 'engineering',
  hermes: 'media',
};

type CharStatus = 'idle' | 'working' | 'success' | 'error';

interface CharState {
  status: CharStatus;
  taskTitle: string;
}

const defaultStates: Record<string, CharState> = {
  strategy: { status: 'idle', taskTitle: '待命中' },
  engineering: { status: 'idle', taskTitle: '待命中' },
  media: { status: 'idle', taskTitle: '待命中' },
};

interface Bubble {
  id: number;
  roomId: string;
  text: string;
  color: string;
}

function getTaskType(event: TaskEvent, tasks: Task[]): string | undefined {
  // task.created/blocked events carry type in data
  if (event.data.type) return event.data.type as string;
  // for other events, look up the task
  if (event.taskId) {
    const task = tasks.find((t) => t.id === event.taskId);
    return task?.type;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/*  主组件                                                              */
/* ------------------------------------------------------------------ */
export function LiveWorkshop({ latestEvent, tasks }: { latestEvent: TaskEvent | null; tasks: Task[] }) {
  const [charStates, setCharStates] = useState<Record<string, CharState>>(defaultStates);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const bubbleIdRef = useRef(0);
  const lastEventIdRef = useRef(-1);

  const showBubble = useCallback((roomId: string, text: string, color: string) => {
    const id = ++bubbleIdRef.current;
    setBubbles((prev) => [...prev.slice(-4), { id, roomId, text, color }]);
    setTimeout(() => setBubbles((prev) => prev.filter((b) => b.id !== id)), 4_000);
  }, []);

  useEffect(() => {
    if (!latestEvent || latestEvent.id === lastEventIdRef.current) return;
    lastEventIdRef.current = latestEvent.id;

    const taskType = getTaskType(latestEvent, tasks);
    const roomId = taskType ? agentRoom[taskType] : undefined;
    if (!roomId) return;

    const data = latestEvent.data;

    switch (latestEvent.type) {
      case 'task.created':
      case 'task.unblocked': {
        const title = String(data.title ?? '新任务');
        setCharStates((prev) => ({
          ...prev,
          [roomId]: { status: 'idle', taskTitle: title },
        }));
        showBubble(roomId, `新任务: ${title}`, '#55f7ed');
        break;
      }
      case 'task.blocked': {
        const title = String(data.title ?? '阻塞');
        setCharStates((prev) => ({
          ...prev,
          [roomId]: { status: 'idle', taskTitle: title },
        }));
        showBubble(roomId, `等待上游: ${title}`, '#d56aff');
        break;
      }
      case 'task.claimed': {
        setCharStates((prev) => ({
          ...prev,
          [roomId]: { ...prev[roomId], status: 'working' },
        }));
        showBubble(roomId, '开始执行...', '#f5a623');
        break;
      }
      case 'task.heartbeat': {
        setCharStates((prev) => ({
          ...prev,
          [roomId]: { ...prev[roomId], status: 'working' },
        }));
        break;
      }
      case 'task.completed': {
        const output = (data.output ?? {}) as Record<string, unknown>;
        const summary = String(output.summary ?? '完成');
        setCharStates((prev) => ({
          ...prev,
          [roomId]: { ...prev[roomId], status: 'success' },
        }));
        showBubble(roomId, summary, '#50ff98');
        setTimeout(() => {
          setCharStates((prev) => ({
            ...prev,
            [roomId]: { ...prev[roomId], status: 'idle' },
          }));
        }, 3_500);
        break;
      }
      case 'task.failed':
      case 'task.retrying': {
        const err = String(data.error ?? '执行失败');
        setCharStates((prev) => ({
          ...prev,
          [roomId]: { ...prev[roomId], status: 'error' },
        }));
        showBubble(roomId, `错误: ${err}`, '#ff4c4c');
        setTimeout(() => {
          setCharStates((prev) => ({
            ...prev,
            [roomId]: { ...prev[roomId], status: 'idle' },
          }));
        }, 4_000);
        break;
      }
    }
  }, [latestEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="live-workshop" style={{ width: 1920, height: 1080 }}>
      <GridBackdrop />
      <div className="workshop-border" />
      {rooms.map((room) => (
        <LiveRoom
          key={room.id}
          room={room}
          roomChars={characters.filter((c) => c.roomId === room.id)}
          charState={charStates[room.id]}
          bubbles={bubbles.filter((b) => b.roomId === room.id)}
        />
      ))}
      <div className="workshop-title">阿星工坊</div>
      <div className="workshop-status">LIVE WORKSHOP / REAL-TIME</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  网格背景                                                             */
/* ------------------------------------------------------------------ */
function GridBackdrop() {
  return <div className="grid-backdrop" />;
}

/* ------------------------------------------------------------------ */
/*  单个房间                                                             */
/* ------------------------------------------------------------------ */
function LiveRoom({
  room,
  roomChars,
  charState,
  bubbles,
}: {
  room: (typeof rooms)[number];
  roomChars: (typeof characters);
  charState?: CharState;
  bubbles: Bubble[];
}) {
  const isActive = charState?.status === 'working';
  const isError = charState?.status === 'error';
  const isSuccess = charState?.status === 'success';

  let roomStatusClass = '';
  if (isError) roomStatusClass = 'room-error';
  else if (isSuccess) roomStatusClass = 'room-success';
  else if (isActive) roomStatusClass = 'room-active';

  return (
    <div
      className={`live-room ${roomStatusClass}`}
      style={{
        left: room.box.x,
        top: room.box.y,
        width: room.box.width,
        height: room.box.height,
      }}
    >
      <img
        alt={room.name}
        className="room-bg"
        src={`/assets/offices/${room.id}.png`}
      />
      <RoomScanLine glow={room.glow} />
      <RoomPulse glow={room.glow} />
      <RoomNameOverlay name={room.name} color={room.color} />
      {roomChars.map((ch, i) => (
        <LiveCharacter
          key={ch.name}
          character={ch}
          index={i}
          room={room}
          charState={charState}
        />
      ))}
      {bubbles.map((b) => (
        <SpeechBubbleView
          key={b.id}
          text={b.text}
          color={b.color}
          x={180}
          y={70}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  房间扫描线 & 脉冲                                                     */
/* ------------------------------------------------------------------ */
function RoomScanLine({ glow }: { glow: string }) {
  return (
    <div
      className="room-scan-line"
      style={{ '--glow': glow } as React.CSSProperties}
    />
  );
}

function RoomPulse({ glow }: { glow: string }) {
  return (
    <div
      className="room-pulse"
      style={{ '--glow': glow } as React.CSSProperties}
    />
  );
}

function RoomNameOverlay({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="room-name"
      style={{
        borderColor: color,
        color,
        textShadow: `0 0 10px ${color}99`,
      }}
    >
      {name}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  角色精灵                                                            */
/* ------------------------------------------------------------------ */
function LiveCharacter({
  character,
  index,
  room,
  charState,
}: {
  character: (typeof characters)[number];
  index: number;
  room: (typeof rooms)[number];
  charState?: CharState;
}) {
  const status = charState?.status ?? 'idle';
  let animClass = 'char-idle';

  if (status === 'working') {
    animClass = `char-${character.action}`;
  } else if (status === 'error') {
    animClass = 'char-error';
  } else if (status === 'success') {
    animClass = 'char-success';
  }

  const spriteName = (() => {
    switch (character.roomId) {
      case 'command': return 'commander';
      case 'strategy': return 'strategist';
      case 'engineering': return 'engineer';
      case 'media': return 'media';
      case 'quality': return 'qa';
      default: return 'storage';
    }
  })();

  return (
    <div
      className={`live-character ${animClass}`}
      style={{
        left: character.x - room.box.x,
        top: character.y - room.box.y,
        zIndex: character.zIndex,
        width: 1254,
        height: 1254,
        animationDelay: `${index * 0.17}s`,
        '--scale': character.scale * 1.55,
      } as React.CSSProperties}
    >
      <div className="char-shadow" />
      <img
        alt={character.name}
        className="char-sprite pixelated"
        src={`/assets/remotion-sprites/${spriteName}.png`}
      />
      <div
        className="char-aura pixelated"
        style={{ '--room-color': room.color } as React.CSSProperties}
      />
      <ActionPixels action={character.action} color={room.color} />
      <CharExpression status={status} scale={character.scale * 1.55} />
      <StatusEffect status={status} taskTitle={charState?.taskTitle} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  不同角色的动作特效像素                                                  */
/* ------------------------------------------------------------------ */
function ActionPixels({ action, color }: { action: string; color: string }) {
  const s = { '--color': color } as React.CSSProperties;

  if (action === 'hologram') {
    return (
      <>
        <span className="ap-bar top" style={s} />
        <span className="ap-ring" style={s} />
      </>
    );
  }
  if (action === 'checking') {
    return (
      <>
        <span className="ap-diamond" style={s} />
        <span className="ap-bar side" style={s} />
      </>
    );
  }
  if (action === 'archiving') {
    return (
      <>
        <span className="ap-bar bottom" style={s} />
        <span className="ap-block" style={s} />
      </>
    );
  }
  return (
    <>
      <span className="ap-hand left" style={s} />
      <span className="ap-hand right" style={s} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  对话气泡                                                             */
/* ------------------------------------------------------------------ */
function SpeechBubbleView({
  text,
  color,
  x,
  y,
}: {
  text: string;
  color: string;
  x: number;
  y: number;
}) {
  return (
    <div
      className="live-bubble"
      style={{
        left: x,
        top: y,
        borderColor: color,
        color: '#eaf8f8',
        textShadow: `0 0 8px ${color}66`,
        boxShadow: `0 0 0 3px rgba(0,0,0,0.72), 0 0 22px ${color}55`,
      }}
    >
      <span className="bubble-text">{text}</span>
      <span
        className="bubble-tail"
        style={{ borderRightColor: color, borderBottomColor: color }}
      />
    </div>
  );
}
