import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

type SpeechBubbleProps = {
  color: string;
  cycleFrames: number;
  delayFrames: number;
  phrases: string[];
  x: number;
  y: number;
  maxWidth?: number;
  align?: 'left' | 'center' | 'right';
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function SpeechBubble({
  color,
  cycleFrames,
  delayFrames,
  phrases,
  x,
  y,
  maxWidth = 190,
  align = 'center',
}: SpeechBubbleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const shifted = frame + delayFrames;
  const localFrame = shifted % cycleFrames;
  const cycleIndex = Math.floor(shifted / cycleFrames);
  const phrase = phrases[cycleIndex % phrases.length] ?? phrases[0] ?? '';

  const opacityIn = interpolate(localFrame, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const opacityOut = interpolate(localFrame, [cycleFrames - 18, cycleFrames - 4], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const opacity = Math.min(opacityIn, opacityOut);
  const pop = spring({
    frame: Math.max(0, localFrame - 2),
    fps,
    config: {
      damping: 16,
      mass: 0.7,
      stiffness: 150,
    },
  });
  const exitLift = interpolate(localFrame, [cycleFrames - 22, cycleFrames - 4], [0, -6], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });
  const enterLift = interpolate(localFrame, [0, 10], [8, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.sin),
  });

  const translate = align === 'left' ? '0%' : align === 'right' ? '-100%' : '-50%';
  const safeScale = clamp(0.85 + pop * 0.15, 0.85, 1);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        maxWidth,
        padding: '12px 16px',
        border: `3px solid ${color}`,
        background: 'rgba(7, 12, 14, 0.86)',
        boxShadow: `0 0 0 3px rgba(0,0,0,0.72), 0 0 22px ${color}55`,
        color: '#eaf8f8',
        fontFamily: '"Microsoft YaHei UI", "Noto Sans SC", sans-serif',
        fontSize: 24,
        fontWeight: 900,
        lineHeight: 1.1,
        letterSpacing: 0,
        opacity,
        textShadow: `0 0 8px ${color}66`,
        transform: `translate(${translate}, ${enterLift + exitLift}px) scale(${safeScale})`,
        transformOrigin: align === 'left' ? 'left bottom' : align === 'right' ? 'right bottom' : 'center bottom',
        imageRendering: 'pixelated',
        whiteSpace: 'nowrap',
      }}
    >
      {phrase}
      <span
        style={{
          position: 'absolute',
          left: align === 'left' ? 22 : align === 'right' ? 'auto' : '50%',
          right: align === 'right' ? 22 : 'auto',
          bottom: -13,
          width: 18,
          height: 18,
          borderRight: `3px solid ${color}`,
          borderBottom: `3px solid ${color}`,
          background: 'rgba(7, 12, 14, 0.86)',
          transform: align === 'center' ? 'translateX(-50%) rotate(45deg)' : 'rotate(45deg)',
        }}
      />
    </div>
  );
}
