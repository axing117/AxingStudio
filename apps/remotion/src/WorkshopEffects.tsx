import { Easing, interpolate, useCurrentFrame } from 'remotion';
import type { RoomId, WorkshopRoom } from './workshopConfig';

type WorkshopEffectsProps = {
  room: WorkshopRoom;
  index: number;
};

const roomEffects: Record<RoomId, (room: WorkshopRoom, frame: number, index: number) => JSX.Element> = {
  command: commandEffects,
  strategy: strategyEffects,
  engineering: engineeringEffects,
  media: mediaEffects,
  quality: qualityEffects,
  storage: storageEffects,
};

export function WorkshopEffects({ room, index }: WorkshopEffectsProps) {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <RoomScanOverlay room={room} frame={frame} index={index} />
      {roomEffects[room.id](room, frame, index)}
    </div>
  );
}

function RoomScanOverlay({ room, frame, index }: { room: WorkshopRoom; frame: number; index: number }) {
  const sweep = interpolate((frame + index * 11) % 120, [0, 120], [-16, 116], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pulse = interpolate((frame + index * 7) % 84, [0, 42, 84], [0.12, 0.28, 0.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  return (
    <>
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${sweep}%`,
          height: 3,
          background: `linear-gradient(90deg, transparent, rgba(${room.glow}, 0.72), transparent)`,
          boxShadow: `0 0 18px rgba(${room.glow}, 0.4)`,
          opacity: 0.44,
        }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at 50% 70%, rgba(${room.glow}, ${pulse}), transparent 62%)`,
          mixBlendMode: 'screen',
        }}
      />
    </>
  );
}

function commandEffects(room: WorkshopRoom, frame: number) {
  const mapFlash = interpolate(frame % 58, [0, 29, 58], [0.16, 0.42, 0.16], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  return (
    <>
      <PanelGlow room={room} x={166} y={112} w={250} h={142} opacity={mapFlash} />
      <PanelGlow room={room} x={48} y={145} w={112} h={168} opacity={0.26} />
      <Bars x={392} y={188} color={room.color} frame={frame} />
      <ConsoleBreath room={room} x={170} y={330} w={290} h={68} frame={frame} />
    </>
  );
}

function strategyEffects(room: WorkshopRoom, frame: number) {
  const rotate = (frame % 240) * 1.5;
  const hover = Math.sin(frame / 24) * 6;
  return (
    <>
      <span
        style={{
          position: 'absolute',
          left: 310,
          top: 150 + hover,
          width: 136,
          height: 136,
          border: `4px solid ${room.color}`,
          borderRadius: '50%',
          opacity: 0.62,
          boxShadow: `0 0 34px ${room.color}77, inset 0 0 30px ${room.color}55`,
          transform: `rotate(${rotate}deg)`,
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: 110,
          top: 236 + hover * 0.3,
          width: 318,
          height: 74,
          background: `linear-gradient(90deg, transparent, ${room.color}44, transparent)`,
          clipPath: 'polygon(8% 100%, 92% 100%, 74% 0, 26% 0)',
          filter: `drop-shadow(0 0 18px ${room.color}aa)`,
          opacity: 0.54,
        }}
      />
      <PanelGlow room={room} x={204} y={68} w={196} h={96} opacity={0.32} />
    </>
  );
}

function engineeringEffects(room: WorkshopRoom, frame: number) {
  return (
    <>
      <CodeLines color={room.color} x={330} y={110} frame={frame} />
      <ServerLights color={room.color} x={80} y={110} frame={frame} count={10} />
      <WarningLamp color={room.color} x={425} y={56} frame={frame} />
      <PanelGlow room={room} x={310} y={260} w={176} h={72} opacity={0.2} />
    </>
  );
}

function mediaEffects(room: WorkshopRoom, frame: number) {
  return (
    <>
      <Waveform color={room.color} x={78} y={156} frame={frame} />
      <PlayButton color={room.color} x={372} y={190} frame={frame} />
      <CrtLines color={room.color} x={66} y={132} w={430} h={174} frame={frame} />
      <ConsoleBreath room={room} x={160} y={336} w={308} h={72} frame={frame} />
    </>
  );
}

function qualityEffects(room: WorkshopRoom, frame: number) {
  const shieldPulse = interpolate(frame % 80, [0, 40, 80], [0.3, 0.78, 0.3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  return (
    <>
      <span
        style={{
          position: 'absolute',
          left: 96,
          top: 92,
          width: 118,
          height: 142,
          clipPath: 'polygon(50% 0, 88% 18%, 78% 78%, 50% 100%, 22% 78%, 12% 18%)',
          background: `${room.color}55`,
          boxShadow: `0 0 36px ${room.color}`,
          opacity: shieldPulse,
        }}
      />
      <Checklist color={room.color} x={285} y={128} frame={frame} />
      <CursorBlink color={room.color} x={352} y={300} frame={frame} />
    </>
  );
}

function storageEffects(room: WorkshopRoom, frame: number) {
  return (
    <>
      <ServerLights color={room.color} x={80} y={108} frame={frame} count={12} />
      <PanelGlow room={room} x={330} y={146} w={124} h={164} opacity={0.32} />
      <FloorReflect color={room.color} frame={frame} />
      <WarningLamp color={room.color} x={448} y={338} frame={frame} />
    </>
  );
}

function PanelGlow({ room, x, y, w, h, opacity }: { room: WorkshopRoom; x: number; y: number; w: number; h: number; opacity: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        background: `linear-gradient(180deg, rgba(${room.glow}, ${opacity}), rgba(${room.glow}, ${opacity * 0.25}))`,
        boxShadow: `0 0 26px rgba(${room.glow}, ${opacity})`,
        mixBlendMode: 'screen',
      }}
    />
  );
}

function Bars({ x, y, color, frame }: { x: number; y: number; color: string; frame: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, display: 'flex', alignItems: 'flex-end', gap: 8, height: 80 }}>
      {Array.from({ length: 8 }, (_, i) => {
        const h = 22 + Math.sin((frame + i * 11) / 12) * 18 + (i % 3) * 8;
        return <span key={i} style={{ width: 13, height: h, background: color, boxShadow: `0 0 12px ${color}77`, opacity: 0.58 }} />;
      })}
    </div>
  );
}

function ConsoleBreath({ room, x, y, w, h, frame }: { room: WorkshopRoom; x: number; y: number; w: number; h: number; frame: number }) {
  const opacity = interpolate(frame % 90, [0, 45, 90], [0.18, 0.44, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  return <PanelGlow room={room} x={x} y={y} w={w} h={h} opacity={opacity} />;
}

function CodeLines({ color, x, y, frame }: { color: string; x: number; y: number; frame: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 170, height: 122, overflow: 'hidden' }}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: 0,
            top: ((i * 18 + frame * 0.7) % 178) - 42,
            width: 70 + (i % 4) * 26,
            height: 5,
            background: color,
            opacity: 0.22 + (i % 3) * 0.13,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      ))}
    </div>
  );
}

function ServerLights({ color, x, y, frame, count }: { color: string; x: number; y: number; frame: number; count: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: (i % 3) * 22,
            top: Math.floor(i / 3) * 22,
            width: 8,
            height: 8,
            background: color,
            opacity: ((frame + i * 17) % 54) < 24 ? 0.78 : 0.18,
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      ))}
    </div>
  );
}

function WarningLamp({ color, x, y, frame }: { color: string; x: number; y: number; frame: number }) {
  const opacity = interpolate(frame % 50, [0, 25, 50], [0.28, 0.88, 0.28], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  return <span style={{ position: 'absolute', left: x, top: y, width: 38, height: 38, borderRadius: '50%', background: color, opacity, boxShadow: `0 0 28px ${color}` }} />;
}

function Waveform({ color, x, y, frame }: { color: string; x: number; y: number; frame: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: 360, height: 110, overflow: 'hidden' }}>
      {Array.from({ length: 34 }, (_, i) => {
        const h = 14 + Math.abs(Math.sin((frame + i * 6) / 9)) * 76;
        return <span key={i} style={{ position: 'absolute', left: ((i * 14 - frame * 1.4) % 500) - 60, bottom: 8, width: 6, height: h, background: color, opacity: 0.36, boxShadow: `0 0 10px ${color}` }} />;
      })}
    </div>
  );
}

function PlayButton({ color, x, y, frame }: { color: string; x: number; y: number; frame: number }) {
  const scale = 1 + Math.sin(frame / 24) * 0.04;
  return <span style={{ position: 'absolute', left: x, top: y, width: 74, height: 74, background: color, opacity: 0.22, clipPath: 'polygon(24% 12%, 24% 88%, 88% 50%)', transform: `scale(${scale})`, boxShadow: `0 0 30px ${color}` }} />;
}

function CrtLines({ color, x, y, w, h }: { color: string; x: number; y: number; w: number; h: number; frame: number }) {
  return (
    <span
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        background: `repeating-linear-gradient(0deg, transparent 0 7px, ${color}33 7px 9px)`,
        mixBlendMode: 'screen',
        opacity: 0.48,
      }}
    />
  );
}

function Checklist({ color, x, y, frame }: { color: string; x: number; y: number; frame: number }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, display: 'grid', gap: 17 }}>
      {Array.from({ length: 5 }, (_, i) => {
        const active = ((frame + i * 13) % 120) > i * 14;
        return <span key={i} style={{ width: 180, height: 9, background: color, opacity: active ? 0.64 : 0.14, boxShadow: active ? `0 0 10px ${color}` : 'none' }} />;
      })}
    </div>
  );
}

function CursorBlink({ color, x, y, frame }: { color: string; x: number; y: number; frame: number }) {
  return <span style={{ position: 'absolute', left: x, top: y, width: 12, height: 38, background: color, opacity: frame % 28 < 14 ? 0.8 : 0.16, boxShadow: `0 0 10px ${color}` }} />;
}

function FloorReflect({ color, frame }: { color: string; frame: number }) {
  return <span style={{ position: 'absolute', left: ((frame * 2) % 720) - 220, bottom: 58, width: 220, height: 42, background: `linear-gradient(90deg, transparent, ${color}44, transparent)`, filter: 'blur(4px)', transform: 'skewX(-18deg)', opacity: 0.48 }} />;
}
