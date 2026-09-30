import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { loadFont } from '@remotion/google-fonts/Manrope';
import { theme } from '../theme';

const loaded = loadFont('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['cyrillic', 'latin'],
});

export const fontFamily = `${loaded.fontFamily}, Segoe UI, sans-serif`;

export const Stage: React.FC<{ children: React.ReactNode; wash?: string }> = ({ children, wash = theme.accent }) => {
  return (
    <AbsoluteFill style={{ background: theme.bg, color: theme.ink, fontFamily, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 520px at 18% 0%, ${wash}33, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: 'radial-gradient(700px 480px at 100% 100%, rgba(126,184,178,0.16), transparent 65%)',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const SceneFade: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const fade = 10;
  const opacity = interpolate(
    frame,
    [0, fade, Math.max(fade + 1, durationInFrames - fade), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const shift = interpolate(
    frame,
    [0, fade, Math.max(fade + 1, durationInFrames - fade), durationInFrames],
    [18, 0, 0, -10],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const scale = interpolate(
    frame,
    [0, fade, Math.max(fade + 1, durationInFrames - fade), durationInFrames],
    [0.992, 1, 1, 1.003],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  return <AbsoluteFill style={{ opacity, transform: `translateY(${shift}px) scale(${scale})` }}>{children}</AbsoluteFill>;
};

const Rule: React.FC<{ width: number }> = ({ width }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [6, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div
      style={{
        width,
        height: 2,
        background: theme.accent,
        transform: `scaleX(${scale})`,
        transformOrigin: 'left center',
        marginTop: 22,
      }}
    />
  );
};

export const Words: React.FC<{
  items: string[];
  durationInFrames?: number;
  finalLeadCaption?: string;
  finalCaption?: string;
}> = ({
  items,
  durationInFrames,
  finalLeadCaption,
  finalCaption,
}) => {
  const frame = useCurrentFrame();
  const slot = durationInFrames
    ? Math.max(48, Math.min(72, Math.round(durationInFrames * 0.095)))
    : 72;
  const index = Math.min(items.length - 1, Math.floor(Math.max(0, frame - 14) / slot));
  const local = frame - 14 - index * slot;
  const last = index === items.length - 1;
  const captionSwitch = slot * 2;
  const visibleFinalCaption = finalLeadCaption && local < captionSwitch ? finalLeadCaption : finalCaption;
  const lines = items[index].split('\n');
  const opacity = interpolate(local, [0, 10, slot - 12, slot], [0, 1, 1, last ? 1 : 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const shift = interpolate(local, [0, 14], [28, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const finalCaptionOpacity = last
    ? interpolate(
        local,
        [8, 22, captionSwitch - 14, captionSwitch, captionSwitch + 14],
        [0, 1, 1, 0, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
      )
    : 0;
  const finalScale = last
    ? interpolate(local, [0, slot], [1, 1.035], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : 1;
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px' }}>
      <div style={{ color: theme.accent, fontSize: 22, letterSpacing: '0.28em', textTransform: 'uppercase' }}>
        Промышленный контур
      </div>
      <Rule width={180} />
      <div
        style={{
          marginTop: 36,
          opacity,
          fontSize: lines.length > 1 ? 72 : 108,
          fontWeight: 600,
          letterSpacing: '-0.045em',
          lineHeight: 1.08,
          transform: `translateY(${shift}px) scale(${finalScale})`,
          transformOrigin: 'left center',
        }}
      >
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
      {finalCaption ? (
        <div
          style={{
            minHeight: 36,
            marginTop: 26,
            color: theme.ink,
            fontSize: 26,
            letterSpacing: '0.08em',
            opacity: finalCaptionOpacity,
          }}
        >
          {visibleFinalCaption}
        </div>
      ) : null}
      <div style={{ marginTop: 28, color: theme.muted, fontSize: 22, letterSpacing: '0.18em' }}>
        {String(index + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
      </div>
    </AbsoluteFill>
  );
};

export const Statement: React.FC<{ line: string; kicker?: string; wash?: string }> = ({ line, kicker, wash }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.8 } });
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const shift = interpolate(enter, [0, 1], [36, 0]);
  return (
    <Stage wash={wash}>
      <AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px' }}>
        {kicker ? (
          <div style={{ color: wash ?? theme.accent, fontSize: 22, letterSpacing: '0.28em', textTransform: 'uppercase', opacity }}>
            {kicker}
          </div>
        ) : null}
        <div
          style={{
            opacity,
            transform: `translateY(${shift}px)`,
            marginTop: kicker ? 28 : 0,
            fontSize: 78,
            fontWeight: 600,
            letterSpacing: '-0.04em',
            lineHeight: 1.12,
            maxWidth: 1500,
            whiteSpace: 'pre-line',
          }}
        >
          {line}
        </div>
        <Rule width={220} />
      </AbsoluteFill>
    </Stage>
  );
};

export const LowerThird: React.FC<{ kicker: string; text: string }> = ({ kicker, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 18, mass: 0.65 } });
  const shift = interpolate(enter, [0, 1], [48, 0]);
  return (
    <div
      style={{
        position: 'absolute',
        left: 72,
        right: 72,
        bottom: 48,
        zIndex: 10,
        transform: `translateY(${shift}px)`,
        opacity: enter,
        display: 'flex',
        alignItems: 'stretch',
        fontFamily,
      }}
    >
      <div style={{ width: 6, background: theme.accent }} />
      <div
        style={{
          background: 'rgba(16, 21, 18, 0.88)',
          border: `1px solid ${theme.line}`,
          borderLeft: 'none',
          padding: '16px 26px 18px',
          maxWidth: 980,
        }}
      >
        <div style={{ color: theme.accent, fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{kicker}</div>
        <div style={{ marginTop: 6, fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: theme.ink }}>{text}</div>
      </div>
    </div>
  );
};

const FRAME = { w: 1824, h: 960 };
const FIT = FRAME.w / 1920;

export type ScreenFocus = { x: number; y: number; scale: number };

export const Screen: React.FC<{
  src: string;
  startFrom: number;
  endAt: number;
  label: string;
  durationInFrames: number;
  cropTop?: number;
  focus?: ScreenFocus;
  /** Start already zoomed, without the push-in. */
  settled?: boolean;
  poster?: string;
}> = ({ src, startFrom, endAt, label, durationInFrames, cropTop = 0, focus, settled = false, poster }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drift = interpolate(frame, [0, Math.max(1, durationInFrames)], [1, 1.02], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const push = !focus
    ? 0
    : settled
      ? 1
      : Math.min(1, Math.max(0, spring({ frame: frame - 6, fps, config: { damping: 18, mass: 0.75 } })));
  const baseScale = FIT * (focus ? 1 : drift);
  const endScale = focus ? FIT * focus.scale : baseScale;
  const scaleNow = interpolate(push, [0, 1], [baseScale, endScale]);
  const tx = focus ? interpolate(push, [0, 1], [0, FRAME.w / 2 - focus.x * endScale]) : 0;
  const ty = focus
    ? interpolate(push, [0, 1], [-cropTop * FIT, FRAME.h / 2 - focus.y * endScale])
    : -cropTop * FIT;
  return (
    <AbsoluteFill style={{ fontFamily, background: theme.bg }}>
      <AbsoluteFill style={{ background: 'radial-gradient(900px 500px at 50% 40%, rgba(215,161,94,0.08), transparent 70%)' }} />
      <div
        style={{
          position: 'absolute',
          left: 56,
          right: 56,
          top: 44,
          color: theme.muted,
          fontSize: 16,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 48,
          right: 48,
          top: 84,
          bottom: 36,
          overflow: 'hidden',
          borderRadius: 18,
          border: `1px solid ${theme.line}`,
          boxShadow: '0 30px 80px rgba(0,0,0,0.45), inset 0 0 80px rgba(0,0,0,0.25)',
          background: '#0c100e',
        }}
      >
        {poster ? (
          <Img
            src={staticFile(poster)}
            style={{
              position: 'absolute',
              width: 1920,
              height: 1080,
              left: 0,
              top: 0,
              transform: `translate(${tx}px, ${ty}px) scale(${scaleNow})`,
              transformOrigin: '0 0',
            }}
          />
        ) : (
          <OffthreadVideo
            src={src}
            startFrom={startFrom}
            endAt={endAt}
            style={{
              position: 'absolute',
              width: 1920,
              height: 1080,
              left: 0,
              top: 0,
              transform: `translate(${tx}px, ${ty}px) scale(${scaleNow})`,
              transformOrigin: '0 0',
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};

export const Hold: React.FC<{ title: string; caption: string }> = ({ title, caption }) => {
  return <Statement kicker={caption} line={title} />;
};
