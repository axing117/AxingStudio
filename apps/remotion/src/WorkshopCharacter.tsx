import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { SpeechBubble } from './SpeechBubble';
import type { CharacterAnchor, WorkshopRoom } from './workshopConfig';

type WorkshopCharacterProps = {
  character: CharacterAnchor;
  index: number;
  room: WorkshopRoom;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function WorkshopCharacter({ character, index, room }: WorkshopCharacterProps) {
  const frame = useCurrentFrame();
  const localX = character.x - room.box.x;
  const localY = character.y - room.box.y;
  const idleCycle = 54 + index * 4;
  const handCycle = 24 + (index % 3) * 3;
  const blinkCycle = 112 + index * 11;
  const localIdle = (frame + index * 13) % idleCycle;
  const localHands = (frame + index * 7) % handCycle;
  const localBlink = (frame + index * 19) % blinkCycle;

  const bob = interpolate(localIdle, [0, idleCycle / 2, idleCycle], [0, -2.4, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const handMove = interpolate(localHands, [0, handCycle / 2, handCycle], [-2, 2, -2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const blinkGlow = localBlink < 5
    ? interpolate(localBlink, [0, 2, 5], [0, 0.42, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    : 0;
  const sway =
    character.action === 'hologram'
      ? Math.sin(((frame + index * 13) / 62) * Math.PI * 2) * 0.8
      : character.action === 'archiving'
        ? Math.sin((frame / 58) * Math.PI * 2) * -0.6
        : 0;
  const headNod =
    character.action === 'coding' || character.action === 'editing'
      ? Math.sin((frame / 34) * Math.PI * 2) * 1.2
      : character.action === 'typing'
        ? Math.sin((frame / 44) * Math.PI * 2) * 0.8
        : 0;
  const lightPulse = interpolate((frame + index * 9) % 64, [0, 32, 64], [0.12, 0.32, 0.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });

  const bubbleX = clamp(
    localX + (character.bubbleOffsetX ?? 0),
    92,
    room.box.width - 92,
  );
  const bubbleY = clamp(
    localY - 164 + (character.bubbleOffsetY ?? 0),
    40,
    room.box.height - 184,
  );

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: localX,
          top: localY,
          zIndex: character.zIndex,
          width: 1254,
          height: 1254,
          overflow: 'visible',
          transform: `translate(-50%, -100%) translateY(${bob}px) scale(${character.scale}) rotate(${sway}deg)`,
          transformOrigin: 'bottom center',
          imageRendering: 'pixelated',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 420,
            bottom: -18,
            width: 410,
            height: 54,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.46)',
            filter: 'blur(3px)',
            transform: `scaleX(${1 - Math.abs(bob) * 0.018})`,
          }}
        />
        <Img
          alt={character.name}
          src={staticFile(character.sprite)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: 1,
            imageRendering: 'pixelated',
            transform: `translateY(${headNod}px)`,
            transformOrigin: 'bottom center',
            filter: `drop-shadow(0 18px 10px rgba(0,0,0,0.62)) drop-shadow(0 0 22px ${room.color}55)`,
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: 470,
            top: 375,
            width: 315,
            height: 170,
            borderRadius: 90,
            background: `radial-gradient(ellipse, ${room.color}55, transparent 66%)`,
            opacity: lightPulse + blinkGlow,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
        <ActionPixels action={character.action} color={room.color} handMove={handMove} frame={frame + index * 17} />
      </div>
      <SpeechBubble
        align={character.bubbleAlign}
        color={room.color}
        cycleFrames={150 + index * 6}
        delayFrames={index * 23}
        maxWidth={220}
        phrases={character.phrases}
        x={bubbleX}
        y={bubbleY}
      />
    </>
  );
}

function ActionPixels({
  action,
  color,
  handMove,
  frame,
}: {
  action: CharacterAnchor['action'];
  color: string;
  handMove: number;
  frame: number;
}) {
  const glowOpacity = 0.38 + Math.sin(frame / 12) * 0.14;
  const common = {
    position: 'absolute' as const,
    display: 'block',
    background: color,
    boxShadow: `0 0 34px ${color}99`,
    imageRendering: 'pixelated' as const,
    pointerEvents: 'none' as const,
  };

  if (action === 'hologram') {
    return (
      <>
        <span style={{ ...common, left: 810, top: 585, width: 160, height: 14, opacity: glowOpacity, transform: `translateY(${handMove * 4}px)` }} />
        <span style={{ ...common, left: 910, top: 460, width: 90, height: 90, borderRadius: '50%', opacity: 0.16 + glowOpacity * 0.34, transform: `scale(${0.9 + Math.sin(frame / 18) * 0.12})` }} />
      </>
    );
  }

  if (action === 'checking') {
    return (
      <>
        <span style={{ ...common, left: 825, top: 585, width: 118, height: 118, opacity: 0.12 + glowOpacity * 0.28, transform: `translateY(${handMove * 2}px) rotate(45deg)` }} />
        <span style={{ ...common, left: 883, top: 545, width: 18, height: 142, opacity: glowOpacity }} />
      </>
    );
  }

  if (action === 'archiving') {
    return (
      <>
        <span style={{ ...common, left: 290, top: 760, width: 168, height: 18, opacity: 0.48, transform: `translateY(${handMove * 2}px)` }} />
        <span style={{ ...common, left: 320, top: 670, width: 108, height: 74, opacity: 0.18 + glowOpacity * 0.2 }} />
      </>
    );
  }

  return (
    <>
      <span style={{ ...common, left: 300, top: 740, width: 124, height: 16, opacity: glowOpacity, transform: `translateX(${handMove * 4}px)` }} />
      <span style={{ ...common, left: 830, top: 740, width: 124, height: 16, opacity: glowOpacity, transform: `translateX(${-handMove * 4}px)` }} />
    </>
  );
}
