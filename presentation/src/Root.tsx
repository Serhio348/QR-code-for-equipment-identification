import React from 'react';
import { Composition } from 'remotion';
import { PROFESSIONAL_FILM_SECONDS, ProfessionalFilm } from './ProfessionalFilm';
import { SHORT_FILM_SECONDS, ShortFilm } from './ShortFilm';
import { fps, seconds } from './theme';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="IndustrialAI"
        component={ProfessionalFilm}
        durationInFrames={seconds(PROFESSIONAL_FILM_SECONDS)}
        fps={fps}
        width={1920}
        height={1080}
      />
      <Composition
        id="IndustrialAIShort"
        component={ShortFilm}
        durationInFrames={seconds(SHORT_FILM_SECONDS)}
        fps={fps}
        width={1920}
        height={1080}
      />
    </>
  );
};
