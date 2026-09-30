# Presentation

Основа видеопрезентации. Ролики ещё не снимаются.

- [ANALYSIS.md](ANALYSIS.md) — что реально есть в проде
- [STORYBOARD.md](STORYBOARD.md) — один ролик, 3:05, сначала тезис про AI, потом две цепочки

Снимать на `https://qr-code-for-equipment-identification-production.up.railway.app`.

```bash
cd presentation
npm install
npx playwright install chromium
npm run voice
PRESENTATION_EMAIL=... npm run capture
npm run render
```

Готовый файл: `presentation/out/industrial-ai.mp4`. Запись экрана входит в существующую сессию администратора и ничего не сохраняет в журналы.
