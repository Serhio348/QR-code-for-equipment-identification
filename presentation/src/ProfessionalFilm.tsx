import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { LowerThird, SceneFade, Screen, Stage, Words, fontFamily } from './components/Stage';
import { seconds, theme } from './theme';

type Poster = {
  file: string;
  caption: string;
  kicker: string;
  focus?: { x: number; y: number; scale: number };
  cropTop?: number;
  animateFocus?: boolean;
};

type Scene = {
  duration: number;
  voice: string;
  label: string;
  posters: Poster[];
};

export const SCENE_DURATIONS = [20, 20, 19, 16, 19, 19, 16, 40, 16, 18, 18, 25] as const;
export const PROFESSIONAL_FILM_SECONDS = SCENE_DURATIONS.reduce((sum, duration) => sum + duration, 0);

const scenes: Scene[] = [
  {
    duration: SCENE_DURATIONS[1],
    voice: '02',
    label: 'Единое рабочее пространство',
    posters: [
      {
        file: 'captures/menu.png',
        kicker: 'Приложение',
        caption: 'Оборудование и вода — в одном рабочем пространстве.',
        focus: { x: 960, y: 540, scale: 1.35 },
        animateFocus: true,
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[2],
    voice: '03',
    label: 'Цифровой реестр предприятия',
    posters: [
      {
        file: 'captures/catalog.png',
        kicker: 'Оборудование',
        caption: 'Карточки установок, состояние и история обслуживания.',
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[3],
    voice: '04',
    label: 'Цифровой паспорт установки',
    posters: [
      {
        file: 'captures/equipment-card.png',
        kicker: 'Карточка',
        caption: 'Конкретная установка и её эксплуатационные данные.',
      },
      {
        file: 'captures/qr.png',
        kicker: 'QR-код',
        caption: 'Вся история здесь и сейчас.',
      },
      {
        file: 'captures/documentation.png',
        kicker: 'Документы',
        caption: 'Техническая документация связана с установкой.',
      },
      {
        file: 'captures/maintenance-log.png',
        kicker: 'Журнал',
        caption: 'Работы и обслуживание сохраняются в истории.',
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[4],
    voice: '05',
    label: 'AI работает с журналом установки',
    posters: [
      {
        file: 'captures/maintenance-question.png',
        kicker: 'Запрос специалиста',
        caption: 'Когда проводилось последнее обслуживание?',
        focus: { x: 1550, y: 760, scale: 2.6 },
        animateFocus: true,
      },
      {
        file: 'captures/maintenance-answer.png',
        kicker: 'AI-консультант',
        caption: 'Ответ по реальному журналу: последнее обслуживание — 27 июля 2026.',
        focus: { x: 1550, y: 710, scale: 2.6 },
        animateFocus: true,
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[5],
    voice: '06',
    label: 'AI читает техническую документацию',
    posters: [
      {
        file: 'captures/monthly-maintenance-question.png',
        kicker: 'Запрос специалиста',
        caption: 'Какие работы выполняются ежемесячно?',
        focus: { x: 1550, y: 760, scale: 2.6 },
        animateFocus: true,
      },
      {
        file: 'captures/monthly-maintenance-answer.png',
        kicker: 'Документация',
        caption: 'Ежемесячные работы — из документа конкретной установки.',
        focus: { x: 1550, y: 710, scale: 2.6 },
        animateFocus: true,
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[6],
    voice: '07',
    label: 'Учёт воды по участкам',
    posters: [
      {
        file: 'captures/counters.png',
        kicker: 'Вода',
        caption: 'Все группы счётчиков и выбранная скважина.',
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[7],
    voice: '08',
    label: 'Водный баланс',
    posters: [
      {
        file: 'captures/water-balance.png',
        kicker: 'Август 2026',
        caption: 'Реальная картина потребления и расчётных потерь.',
        cropTop: 105,
        focus: { x: 630, y: 510, scale: 1.55 },
      },
      {
        file: 'captures/water-production-september-29.png',
        kicker: '29 сентября · Производство',
        caption: 'Расход по времени и производственным потокам.',
        cropTop: 105,
        focus: { x: 1350, y: 510, scale: 1.7 },
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[8],
    voice: '09',
    label: 'Контроль качества воды',
    posters: [
      {
        file: 'captures/water-quality-journal.png',
        kicker: 'Лаборатория',
        caption: 'Пробы, точки отбора и статус анализа.',
        cropTop: 105,
      },
      {
        file: 'captures/water-iron-norm.png',
        kicker: 'Норматив',
        caption: 'Железо — не более 0,30 мг/л.',
      },
    ],
  },
  {
    duration: SCENE_DURATIONS[9],
    voice: '10',
    label: 'AI сопоставляет пробу с нормативом',
    posters: [
      {
        file: 'captures/water-question.png',
        kicker: 'Запрос специалиста',
        caption: 'Есть ли отклонения в пробе от 26 сентября?',
        focus: { x: 1550, y: 760, scale: 2.6 },
      },
      {
        file: 'captures/water-answer.png',
        kicker: 'AI-консультант',
        caption: 'Железо — в норме. Жёсткость — предупреждение.',
        focus: { x: 1550, y: 825, scale: 2.6 },
      },
    ],
  },
];

const narration = (name: string): React.ReactNode => <Audio src={staticFile(`voice/${name}.wav`)} />;

const PosterScene: React.FC<{ scene: Scene }> = ({ scene }) => {
  const { fps } = useVideoConfig();
  const totalFrames = seconds(scene.duration);
  const slotFrames = Math.floor(totalFrames / scene.posters.length);

  return (
    <AbsoluteFill>
      {scene.posters.map((poster, index) => {
        const from = index * slotFrames;
        const duration = index === scene.posters.length - 1 ? totalFrames - from : slotFrames;
        return (
          <Sequence key={poster.file} from={from} durationInFrames={duration}>
            <SceneFade durationInFrames={duration}>
              <Screen
                src={staticFile('captures/equipment.webm')}
                startFrom={0}
                endAt={duration}
                durationInFrames={duration}
                label={scene.label}
                poster={poster.file}
                focus={poster.focus}
                settled={!poster.animateFocus}
                cropTop={poster.cropTop}
              />
              <LowerThird kicker={poster.kicker} text={poster.caption} />
            </SceneFade>
          </Sequence>
        );
      })}
      {narration(scene.voice)}
    </AbsoluteFill>
  );
};

export const DashboardTour: React.FC<{ duration: number; voiceName?: string }> = ({ duration, voiceName = '08' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const totalFrames = seconds(duration);
  const fit = 1824 / 1920;
  const cropTop = 105;
  const full = { scale: fit, x: 0, y: -cropTop * fit };
  const balanceScale = fit * 1.55;
  const balance = {
    scale: balanceScale,
    x: 1824 / 2 - 630 * balanceScale,
    y: 960 / 2 - 510 * balanceScale,
  };
  const productionScale = fit * 1.7;
  const production = {
    scale: productionScale,
    x: 1824 / 2 - 1350 * productionScale,
    y: 960 / 2 - 510 * productionScale,
  };
  const overviewEnd = Math.round(Math.min(4, duration * 0.12) * fps);
  const balanceZoomEnd = overviewEnd + Math.round(1.2 * fps);
  const balanceEnd = Math.round(duration * 0.46 * fps);
  const resetEnd = Math.round(duration * 0.52 * fps);
  const secondOverviewEnd = Math.round(duration * 0.57 * fps);
  const productionZoomEnd = secondOverviewEnd + Math.round(1.2 * fps);
  const times = [0, overviewEnd, balanceZoomEnd, balanceEnd, resetEnd, secondOverviewEnd, productionZoomEnd, totalFrames];
  const cameraOptions = {
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
    easing: Easing.inOut(Easing.cubic),
  };
  const scale = interpolate(
    frame,
    times,
    [full.scale, full.scale, balance.scale, balance.scale, full.scale, full.scale, production.scale, production.scale],
    cameraOptions,
  );
  const translateX = interpolate(
    frame,
    times,
    [full.x, full.x, balance.x, balance.x, full.x, full.x, production.x, production.x],
    cameraOptions,
  );
  const translateY = interpolate(
    frame,
    times,
    [full.y, full.y, balance.y, balance.y, full.y, full.y, production.y, production.y],
    cameraOptions,
  );

  return (
    <AbsoluteFill style={{ fontFamily, background: theme.bg }}>
      <div
        style={{
          position: 'absolute',
          left: 56,
          top: 44,
          color: theme.muted,
          fontSize: 16,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}
      >
        Вода · дашборд и производственные потоки
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
        <Img
          src={staticFile('captures/water-production-september-29.png')}
          style={{
            position: 'absolute',
            width: 1920,
            height: 1080,
            left: 0,
            top: 0,
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
            transformOrigin: '0 0',
          }}
        />
      </div>

      <Sequence durationInFrames={overviewEnd}>
        <LowerThird kicker="Дашборд воды" text="Баланс месяца и детализация производства." />
      </Sequence>
      <Sequence from={overviewEnd} durationInFrames={resetEnd - overviewEnd}>
        <LowerThird kicker="Август 2026" text="Реальная картина потребления и расчётных потерь." />
      </Sequence>
      <Sequence from={resetEnd} durationInFrames={secondOverviewEnd - resetEnd}>
        <LowerThird kicker="Детализация" text="От общего баланса — к конкретному процессу." />
      </Sequence>
      <Sequence from={secondOverviewEnd} durationInFrames={totalFrames - secondOverviewEnd}>
        <LowerThird kicker="29 сентября · Производство" text="Расход по времени и производственным потокам." />
      </Sequence>
      {narration(voiceName)}
    </AbsoluteFill>
  );
};

const FeatureSummary: React.FC = () => (
  <Stage>
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px', fontFamily }}>
      <div style={{ color: theme.accent, fontSize: 22, letterSpacing: '0.28em', textTransform: 'uppercase' }}>
        Возможности AI
      </div>
      <div style={{ marginTop: 30, fontSize: 72, fontWeight: 600, letterSpacing: '-0.04em' }}>
        Помощник работает поверх данных приложения
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, marginTop: 54 }}>
        {[
          ['01', 'История и документы', 'Журнал, паспорт и инструкции конкретной установки.'],
          ['02', 'Диагностика', 'Помощь по симптомам и фотографиям оборудования.'],
          ['03', 'Рабочие документы', 'Графики ТО, акты и отчёты — после подтверждения.'],
        ].map(([number, title, text]) => (
          <div
            key={number}
            style={{
              minHeight: 230,
              padding: '30px 32px',
              border: `1px solid ${theme.line}`,
              background: theme.bgRaised,
              borderRadius: 16,
            }}
          >
            <div style={{ color: theme.accent, fontSize: 18, letterSpacing: '0.2em' }}>{number}</div>
            <div style={{ marginTop: 28, fontSize: 32, fontWeight: 600 }}>{title}</div>
            <div style={{ marginTop: 16, color: theme.muted, fontSize: 23, lineHeight: 1.45 }}>{text}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  </Stage>
);

const ResultSummary: React.FC = () => (
  <Stage wash={theme.water}>
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px', fontFamily }}>
      <div style={{ color: theme.water, fontSize: 22, letterSpacing: '0.28em', textTransform: 'uppercase' }}>
        Результат внедрения
      </div>
      <div style={{ marginTop: 30, maxWidth: 1480, fontSize: 75, fontWeight: 600, lineHeight: 1.12, letterSpacing: '-0.045em' }}>
        Единое рабочее пространство для оборудования, ресурсов и решений по данным
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 48, color: theme.muted, fontSize: 25 }}>
        {['QR ведёт к установке', 'История хранится в приложении', 'AI находит и сопоставляет данные'].map((text) => (
          <div key={text} style={{ padding: '18px 24px', border: `1px solid ${theme.line}`, borderRadius: 999 }}>
            {text}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  </Stage>
);

export const ProfessionalFilm: React.FC = () => {
  let cursor = seconds(SCENE_DURATIONS[0]);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Sequence durationInFrames={seconds(SCENE_DURATIONS[0])}>
        <SceneFade durationInFrames={seconds(SCENE_DURATIONS[0])}>
          <Stage>
            <Words
              items={['Оборудование', 'Документы', 'Эксплуатация', 'Вода\nГаз\nЭлектричество', 'Данные']}
              durationInFrames={seconds(SCENE_DURATIONS[0])}
              finalLeadCaption="Сами не принимают решений"
              finalCaption="Объект → история → решение"
            />
            {narration('01')}
          </Stage>
        </SceneFade>
      </Sequence>

      {scenes.map((scene) => {
        const from = cursor;
        cursor += seconds(scene.duration);
        return (
          <Sequence key={scene.voice} from={from} durationInFrames={seconds(scene.duration)}>
            {scene.voice === '08' ? (
              <SceneFade durationInFrames={seconds(scene.duration)}>
                <DashboardTour duration={scene.duration} />
              </SceneFade>
            ) : (
              <PosterScene scene={scene} />
            )}
          </Sequence>
        );
      })}

      <Sequence from={cursor} durationInFrames={seconds(SCENE_DURATIONS[10])}>
        <SceneFade durationInFrames={seconds(SCENE_DURATIONS[10])}>
          <FeatureSummary />
          {narration('11')}
        </SceneFade>
      </Sequence>

      <Sequence
        from={cursor + seconds(SCENE_DURATIONS[10])}
        durationInFrames={seconds(SCENE_DURATIONS[11])}
      >
        <SceneFade durationInFrames={seconds(SCENE_DURATIONS[11])}>
          <ResultSummary />
          {narration('12')}
        </SceneFade>
      </Sequence>
    </AbsoluteFill>
  );
};
