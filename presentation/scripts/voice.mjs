import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { EdgeTTS } from 'edge-tts-universal';

const voiceName = 'ru-RU-DmitryNeural';
const root = path.resolve(import.meta.dirname, '..');
const lines = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'voice-lines.json'), 'utf8'));
const outDir = path.join(root, 'public', 'voice');
const ffmpeg = path.join(root, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');

fs.mkdirSync(outDir, { recursive: true });

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const synthesize = async (text) => {
  let lastError = new Error('synthesis failed');
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const tts = new EdgeTTS(text, voiceName, { rate: '+5%' });
      return await tts.synthesize();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await pause(1500 * attempt);
    }
  }
  throw lastError;
};

for (const [name, text] of Object.entries(lines)) {
  const result = await synthesize(String(text));
  const mp3 = path.join(outDir, `${name}.mp3`);
  const wav = path.join(outDir, `${name}.wav`);
  fs.writeFileSync(mp3, Buffer.from(await result.audio.arrayBuffer()));
  const converted = spawnSync(ffmpeg, ['-y', '-i', mp3, '-ar', '48000', '-ac', '1', wav], { stdio: 'pipe' });
  fs.rmSync(mp3, { force: true });
  if (converted.status !== 0) {
    process.stderr.write(converted.stderr);
    process.exit(converted.status ?? 1);
  }
  console.log(`voice ${name}`);
}

console.log(`VOICE_OK ${voiceName}`);
