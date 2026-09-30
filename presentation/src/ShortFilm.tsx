import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from 'remotion';
import { DashboardTour } from './ProfessionalFilm';
import { LowerThird, SceneFade, Screen, Stage, Words, fontFamily } from './components/Stage';
import { seconds, theme } from './theme';

type ShortShot = {
  file: string;
  kicker: string;
  caption: string;
  focus?: { x: number; y: number; scale: number };
  animateFocus?: boolean;
  cropTop?: number;
};

type ShortScene = {
  duration: number;
  voice: string;
  label: string;
  shots: ShortShot[];
};

export const SHORT_DURATIONS = [14, 16, 17, 20, 12, 21, 18, 19] as const;
export const SHORT_FILM_SECONDS = SHORT_DURATIONS.reduce((sum, value) => sum + value, 0);

const voice = (name: string): React.ReactNode => <Audio src={staticFile(`voice/${name}.wav`)} />;

const scenes: ShortScene[] = [
  {
    duration: SHORT_DURATIONS[1],
    voice: 's02',
    label: 'Приложение предприятия',
    shots: [
      {
        file: 'captures/menu.png',
        kicker: 'Единое пространство',
        caption: 'Оборудование и вода — два связанных рабочих контура.',
        focus: { x: 960, y: 540, scale: 1.35 },
        animateFocus: true,
      },
      {
        file: 'captures/catalog.png',
        kicker: 'Цифровой реестр',
        caption: 'Установки, состояние и история обслуживания.',
      },
    ],
  },
  {
    duration: SHORT_DURATIONS[2],
    voice: 's03',
    label: 'Цифровой паспорт установки',
    shots: [
      {
        file: 'captures/equipment-card.png',
        kicker: 'Карточка',
        caption: 'Характеристики конкретной установки.',
      },
      {
        file: 'captures/qr.png',
        kicker: 'QR-код',
        caption: 'Вся история здесь и сейчас.',
      },
      {
        file: 'captures/documentation.png',
        kicker: 'Документы',
        caption: 'Паспорт и инструкции связаны с объектом.',
      },
      {
        file: 'captures/maintenance-log.png',
        kicker: 'Журнал',
        caption: 'Выполненные работы сохраняются в истории.',
      },
    ],
  },
  {
    duration: SHORT_DURATIONS[3],
    voice: 's04',
    label: 'AI работает с данными установки',
    shots: [
      {
        file: 'captures/maintenance-question.png',
        kicker: 'Запрос специалиста',
        caption: 'Когда проводилось последнее обслуживание?',
        focus: { x: 1550, y: 760, scale: 2.6 },
        animateFocus: true,
      },
      {
        file: 'captures/maintenance-answer.png',
        kicker: 'Журнал',
        caption: 'Последнее обслуживание — 27 июля 2026.',
        focus: { x: 1550, y: 710, scale: 2.6 },
        animateFocus: true,
      },
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
        caption: 'Ответ извлечён из документа установки.',
        focus: { x: 1550, y: 710, scale: 2.6 },
        animateFocus: true,
      },
    ],
  },
  {
    duration: SHORT_DURATIONS[4],
    voice: 's05',
    label: 'Учёт воды по участкам',
    shots: [
      {
        file: 'captures/counters.png',
        kicker: 'Счётчики воды',
        caption: 'Все группы и выбранная точка учёта — скважина.',
      },
    ],
  },
  {
    duration: SHORT_DURATIONS[6],
    voice: 's07',
    label: 'Качество воды и нормативы',
    shots: [
      {
        file: 'captures/water-quality-journal.png',
        kicker: 'Лабораторный журнал',
        caption: 'Реальные пробы, точки отбора и статусы.',
        cropTop: 105,
      },
      {
        file: 'captures/water-iron-norm.png',
        kicker: 'Норматив',
        caption: 'Железо — не более 0,30 мг/л.',
      },
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

const ShotSequence: React.FC<{ scene: ShortScene }> = ({ scene }) => {
  const { fps } = useVideoConfig();
  const total = seconds(scene.duration);
  const slot = Math.floor(total / scene.shots.length);

  return (
    <AbsoluteFill>
      {scene.shots.map((shot, index) => {
        const from = index * slot;
        const duration = index === scene.shots.length - 1 ? total - from : slot;
        return (
          <Sequence key={shot.file} from={from} durationInFrames={duration}>
            <SceneFade durationInFrames={duration}>
              <Screen
                src={staticFile('captures/equipment.webm')}
                startFrom={0}
                endAt={duration}
                durationInFrames={duration}
                label={scene.label}
                poster={shot.file}
                focus={shot.focus}
                settled={!shot.animateFocus}
                cropTop={shot.cropTop}
              />
              <LowerThird kicker={shot.kicker} text={shot.caption} />
            </SceneFade>
          </Sequence>
        );
      })}
      {voice(scene.voice)}
    </AbsoluteFill>
  );
};

const ShortResult: React.FC = () => (
  <Stage wash={theme.water}>
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 150px', fontFamily }}>
      <div style={{ color: theme.water, fontSize: 22, letterSpacing: '0.28em', textTransform: 'uppercase' }}>
        Результат внедрения
      </div>
      <div style={{ marginTop: 30, maxWidth: 1450, fontSize: 76, fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.045em' }}>
        Данные предприятия становятся рабочим инструментом
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 50, color: theme.muted, fontSize: 25 }}>
        {['QR ведёт к объекту', 'Приложение хранит историю', 'AI помогает принять решение'].map((text) => (
          <div key={text} style={{ padding: '18px 24px', border: `1px solid ${theme.line}`, borderRadius: 999 }}>
            {text}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  </Stage>
);

export const ShortFilm: React.FC = () => {
  let cursor = seconds(SHORT_DURATIONS[0]);
  const appScene = scenes[0];
  const equipmentScene = scenes[1];
  const equipmentAiScene = scenes[2];
  const countersScene = scenes[3];
  const qualityScene = scenes[4];

  const place = (scene: ShortScene): React.ReactNode => {
    const from = cursor;
    cursor += seconds(scene.duration);
    return (
      <Sequence key={scene.voice} from={from} durationInFrames={seconds(scene.duration)}>
        <ShotSequence scene={scene} />
      </Sequence>
    );
  };

  const app = place(appScene);
  const equipment = place(equipmentScene);
  const equipmentAi = place(equipmentAiScene);
  const counters = place(countersScene);
  const dashboardFrom = cursor;
  cursor += seconds(SHORT_DURATIONS[5]);
  const quality = place(qualityScene);
  const resultFrom = cursor;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <Sequence durationInFrames={seconds(SHORT_DURATIONS[0])}>
        <SceneFade durationInFrames={seconds(SHORT_DURATIONS[0])}>
          <Stage>
            <Words
              items={['Предприятие', 'Данные', 'Решение']}
              durationInFrames={seconds(SHORT_DURATIONS[0])}
              finalLeadCaption="Данные сами не принимают решений"
              finalCaption="Связать с реальным объектом"
            />
            {voice('s01')}
          </Stage>
        </SceneFade>
      </Sequence>

      {app}
      {equipment}
      {equipmentAi}
      {counters}

      <Sequence from={dashboardFrom} durationInFrames={seconds(SHORT_DURATIONS[5])}>
        <SceneFade durationInFrames={seconds(SHORT_DURATIONS[5])}>
          <DashboardTour duration={SHORT_DURATIONS[5]} voiceName="s06" />
        </SceneFade>
      </Sequence>

      {quality}

      <Sequence from={resultFrom} durationInFrames={seconds(SHORT_DURATIONS[7])}>
        <SceneFade durationInFrames={seconds(SHORT_DURATIONS[7])}>
          <ShortResult />
          {voice('s08')}
        </SceneFade>
      </Sequence>
    </AbsoluteFill>
  );
};
