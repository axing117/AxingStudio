import { AbsoluteFill, Img, staticFile, useCurrentFrame } from 'remotion';
import { WorkshopCharacter } from './WorkshopCharacter';
import { WorkshopEffects } from './WorkshopEffects';
import { characters, rooms, scene } from './workshopConfig';
import type { WorkshopRoom } from './workshopConfig';

export function AxingWorkshopScene() {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        width: scene.width,
        height: scene.height,
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 50% 50%, rgba(56, 255, 232, 0.08), transparent 36%), linear-gradient(180deg, #071012, #030607 72%)',
        fontFamily: '"Microsoft YaHei UI", "Noto Sans SC", sans-serif',
      }}
    >
      <GridBackdrop frame={frame} />
      <div
        style={{
          position: 'absolute',
          inset: 28,
          border: '2px solid rgba(96, 255, 236, 0.18)',
          boxShadow: 'inset 0 0 60px rgba(80, 255, 230, 0.06), 0 0 48px rgba(0, 0, 0, 0.64)',
          background: 'rgba(3, 8, 10, 0.32)',
        }}
      />
      {rooms.map((room, index) => (
        <WorkshopRoomLayer key={room.id} index={index} room={room} />
      ))}
      <div
        style={{
          position: 'absolute',
          left: 55,
          top: 20,
          color: '#dffefd',
          fontSize: 30,
          fontWeight: 900,
          textShadow: '0 0 16px rgba(85, 247, 237, 0.7)',
        }}
      >
        阿星工坊
      </div>
      <div
        style={{
          position: 'absolute',
          right: 58,
          top: 26,
          color: '#8be7db',
          fontSize: 18,
          fontWeight: 800,
          opacity: 0.86,
        }}
      >
        LIVE WORKSHOP LOOP / 30FPS
      </div>
    </AbsoluteFill>
  );
}

function WorkshopRoomLayer({ room, index }: { room: WorkshopRoom; index: number }) {
  const roomCharacters = characters.filter((character) => character.roomId === room.id);

  return (
    <div
      style={{
        position: 'absolute',
        left: room.box.x,
        top: room.box.y,
        width: room.box.width,
        height: room.box.height,
        overflow: 'hidden',
        border: `4px solid rgba(${room.glow}, 0.38)`,
        background: '#05090b',
        boxShadow: `0 0 24px rgba(${room.glow}, 0.18), inset 0 0 28px rgba(0, 0, 0, 0.52)`,
      }}
    >
      <Img
        alt={room.name}
        src={staticFile(room.asset)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          imageRendering: 'pixelated',
        }}
      />
      <WorkshopEffects index={index} room={room} />
      <RoomName room={room} />
      {roomCharacters.map((character, characterIndex) => (
        <WorkshopCharacter
          character={character}
          index={index + characterIndex}
          key={character.roomId}
          room={room}
        />
      ))}
    </div>
  );
}

function RoomName({ room }: { room: WorkshopRoom }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 22,
        top: 18,
        zIndex: 28,
        padding: '8px 14px',
        border: `3px solid ${room.color}`,
        background: 'rgba(4, 10, 12, 0.76)',
        color: '#f2ffff',
        fontSize: 22,
        fontWeight: 900,
        lineHeight: 1,
        textShadow: `0 0 10px ${room.color}99`,
        boxShadow: `0 0 18px ${room.color}55`,
      }}
    >
      {room.name}
    </div>
  );
}

function GridBackdrop({ frame }: { frame: number }) {
  const offset = frame % 32;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage:
          'linear-gradient(rgba(99,255,236,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,255,236,0.045) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        backgroundPosition: `${-offset}px ${-offset}px`,
        opacity: 0.5,
      }}
    />
  );
}
