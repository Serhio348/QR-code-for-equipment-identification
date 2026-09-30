import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { Hold, LowerThird, SceneFade, Screen, ScreenFocus, Stage, Statement, Words } from './components/Stage';
import { seconds, theme } from './theme';

export type Cue = { t: number; dur: number; caption: string };

export type FilmProps = {
  equipmentSeconds: number;
  waterSeconds: number;
  hasEquipment: boolean;
  hasWater: boolean;
  hasVoice: boolean;
  equipmentCues: Cue[];
  waterCues: Cue[];
};

export const OPEN_SECONDS = 16;
const BRIDGE_SECONDS = 10;

const CHAT_FOCUS: ScreenFocus = { x: 1600, y: 640, scale: 2.25 };
const DATE_FOCUS: ScreenFocus = { x: 1600, y: 720, scale: 2.3 };
const OFFER_FOCUS: ScreenFocus = { x: 1580, y: 860, scale: 2.45 };
const WATER_FOCUS: ScreenFocus = { x: 1600, y: 760, scale: 2.2 };

type Shot = {
  file: string;
  from: number;
  to: number;
  caption: string;
  kicker: string;
  voice?: string;
  focus?: ScreenFocus;
  cropTop?: number;
};

/** Useful screens only. Auth spinners between full reloads are left out. */
export const waterShots = (full: number): Shot[] => {
  const end = Math.max(full, 48);
  return [
    {
      file: 'captures/counters.webm',
      from: 12.55,
      to: 18.3,
      caption: 'Счётчики по участкам.',
      kicker: 'Вода',
      cropTop: 68,
    },
    {
      file: 'captures/water.webm',
      from: 23.5,
      to: 27.7,
      caption: 'Потребление за август.',
      kicker: 'Вода',
      voice: '07',
      cropTop: 68,
    },
    {
      file: 'captures/water.webm',
      from: 33.8,
      to: 37.3,
      caption: 'Последний анализ — 26 сентября.',
      kicker: 'Вода',
      cropTop: 68,
    },
    {
      file: 'captures/water.webm',
      from: 43.0,
      to: 45.6,
      caption: 'Норматив железа — до 0,30 мг/л.',
      kicker: 'Вода',
      cropTop: 68,
    },
    {
      file: 'captures/water.webm',
      from: 81.9,
      to: 84.2,
      caption: 'Вопрос по пробе 26 сентября.',
      kicker: 'Вода',
      focus: CHAT_FOCUS,
      cropTop: 68,
    },
    {
      file: 'captures/water.webm',
      from: 90.9,
      to: Math.min(end, 96.15),
      caption: 'Помощник сверяет пробу с нормативом.',
      kicker: 'Вода',
      voice: '08',
      focus: WATER_FOCUS,
      cropTop: 68,
    },
  ];
};

type EquipmentShot = {
  from: number;
  to: number;
  hold?: number;
  caption?: string;
  focus?: ScreenFocus;
  settled?: boolean;
  voice?: string;
  poster?: string;
};

/** Plate, QR, documents, journal, then the maintenance question and the passport answer. Loaders and the long "thinking" gap are left out. */
export const equipmentShots = (full: number): EquipmentShot[] => {
  const end = Math.min(full, 92.45);
  return [
    { from: 11.15, to: 17.35, caption: 'Вся история здесь и сейчас.', voice: '04' },
    { from: 18.55, to: 21.7, caption: 'Документация лежит на установке.' },
    { from: 26.2, to: 26.3, hold: 3.2, caption: 'Журнал обслуживания.', poster: 'captures/journal-hold.png' },
    { from: 58.35, to: 60.6, focus: CHAT_FOCUS, voice: 'zoom' },
    { from: 67.4, to: 71.6, focus: DATE_FOCUS, settled: true },
    { from: 77.35, to: 79.3, focus: CHAT_FOCUS, settled: true },
    { from: 86.4, to: end, focus: OFFER_FOCUS, settled: true },
  ];
};

const equipmentShotSeconds = (shot: EquipmentShot): number => shot.hold ?? Math.max(0, shot.to - shot.from);

export const editedEquipmentSeconds = (full: number): number =>
  Math.max(1, equipmentShots(full).reduce((sum, shot) => sum + equipmentShotSeconds(shot), 0));

export const editedWaterSeconds = (full: number): number =>
  waterShots(full).reduce((sum, shot) => sum + Math.max(0, shot.to - shot.from), 0);

export const graphicSeconds = OPEN_SECONDS + 10 + 8 + BRIDGE_SECONDS + 11;

const voice = (name: string, enabled: boolean): React.ReactNode => {
  if (!enabled) return null;
  return <Audio src={staticFile(`voice/${name}.wav`)} />;
};

export const Film: React.FC<FilmProps> = ({
  equipmentSeconds,
  waterSeconds,
  hasEquipment,
  hasWater,
  hasVoice,
}) => {
  const { fps } = useVideoConfig();
  const eqShots = equipmentShots(92.56);
  const equipmentFrames = hasEquipment
    ? eqShots.reduce((sum, shot) => sum + Math.max(1, Math.round(equipmentShotSeconds(shot) * fps)), 0)
    : Math.max(1, Math.round(equipmentSeconds * fps));
  const shots = waterShots(hasWater ? waterSeconds : 56);
  const waterFrames = hasWater
    ? shots.reduce((sum, shot) => sum + Math.max(1, Math.round((shot.to - shot.from) * fps)), 0)
    : seconds(12 + 14 + 14 + 8 + 32);

  const intro = seconds(OPEN_SECONDS) + seconds(10) + seconds(8);
  const bridge = seconds(BRIDGE_SECONDS);
  const close = seconds(11);
  const equipmentStart = intro;
  const bridgeStart = equipmentStart + equipmentFrames;
  const waterStart = bridgeStart + bridge;
  const closeStart = waterStart + waterFrames;

  let equipmentCursor = 0;
  let waterCursor = 0;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Sequence durationInFrames={seconds(OPEN_SECONDS)} premountFor={fps}>
        <SceneFade durationInFrames={seconds(OPEN_SECONDS)}>
          <Stage>
            <Words items={['Оборудование', 'Документы', 'Эксплуатация', 'Вода\nГаз\nЭлектричество', 'Данные']} />
            {voice('01', hasVoice)}
          </Stage>
        </SceneFade>
      </Sequence>

      <Sequence from={seconds(OPEN_SECONDS)} durationInFrames={seconds(10)}>
        <SceneFade durationInFrames={seconds(10)}>
          <Statement line="Данные сами не принимают решений." />
          {voice('02', hasVoice)}
        </SceneFade>
      </Sequence>

      <Sequence from={seconds(OPEN_SECONDS + 10)} durationInFrames={seconds(8)}>
        <SceneFade durationInFrames={seconds(8)}>
          <Statement kicker="AI" line="Помощник поверх данных предприятия." />
          {voice('03', hasVoice)}
        </SceneFade>
      </Sequence>

      <Sequence from={equipmentStart} durationInFrames={equipmentFrames}>
        <SceneFade durationInFrames={equipmentFrames}>
          {hasEquipment ? (
            <AbsoluteFill>
              {eqShots.map((shot) => {
                const from = equipmentCursor;
                const dur = Math.max(1, Math.round(equipmentShotSeconds(shot) * fps));
                equipmentCursor += dur;
                return (
                  <Sequence key={`${shot.from}-${shot.poster ?? 'video'}`} from={from} durationInFrames={dur}>
                    <SceneFade durationInFrames={dur}>
                      <Screen
                        src={staticFile('captures/equipment.webm')}
                        startFrom={Math.round(shot.from * fps)}
                        endAt={Math.round(shot.to * fps)}
                        durationInFrames={dur}
                        label={shot.focus ? 'Оборудование  ·  помощник' : 'Оборудование  ·  фильтр обезжелезивания'}
                        focus={shot.focus}
                        settled={shot.settled}
                        poster={shot.poster}
                      />
                      {shot.caption ? <LowerThird kicker="Паспорт" text={shot.caption} /> : null}
                      {shot.voice ? voice(shot.voice, hasVoice) : null}
                    </SceneFade>
                  </Sequence>
                );
              })}
            </AbsoluteFill>
          ) : (
            <Hold title="Паспорт, документы, журнал и вопрос к AI" caption="QR открывает цифровой паспорт установки." />
          )}
        </SceneFade>
      </Sequence>

      <Sequence from={bridgeStart} durationInFrames={bridge}>
        <SceneFade durationInFrames={bridge}>
          <Statement kicker="Природный газ и электроэнергия" line="Сейчас ведётся учёт воды." wash={theme.water} />
          {voice('05', hasVoice)}
        </SceneFade>
      </Sequence>

      <Sequence from={waterStart} durationInFrames={waterFrames}>
        {hasWater ? (
          <AbsoluteFill>
            {shots.map((shot) => {
              const from = waterCursor;
              const dur = Math.max(1, Math.round((shot.to - shot.from) * fps));
              waterCursor += dur;
              return (
                <Sequence key={`${shot.file}-${shot.from}`} from={from} durationInFrames={dur}>
                  <SceneFade durationInFrames={dur}>
                    <Screen
                      src={staticFile(shot.file)}
                      startFrom={Math.round(shot.from * fps)}
                      endAt={Math.round(shot.to * fps)}
                      durationInFrames={dur}
                      label="Вода  ·  учёт и качество"
                      cropTop={shot.cropTop}
                      focus={shot.focus}
                    />
                    {shot.focus ? null : <LowerThird kicker={shot.kicker} text={shot.caption} />}
                    {shot.focus ? voice('zoom', hasVoice) : null}
                    {shot.voice ? voice(shot.voice, hasVoice) : null}
                  </SceneFade>
                </Sequence>
              );
            })}
          </AbsoluteFill>
        ) : (
          <Hold title="Показание, потребление, качество, норматив и счёт" caption="AI сверяет пробу, норму и счёт." />
        )}
      </Sequence>

      <Sequence from={closeStart} durationInFrames={close}>
        <SceneFade durationInFrames={close}>
          <Statement line="Оборудование. Вода. Решения по данным." />
          {voice('06', hasVoice)}
        </SceneFade>
      </Sequence>
    </AbsoluteFill>
  );
};

export const plannedEquipmentSeconds = 14 + 12 + 12 + 28;
export const plannedWaterSeconds = 12 + 14 + 14 + 8 + 32;
