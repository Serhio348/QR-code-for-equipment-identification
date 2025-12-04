/**
 * Скрипт для генерации базовых иконок PWA
 * Требует: npm install sharp
 * Запуск: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// Создаем простую SVG иконку
const createSVGIcon = (size) => {
  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#667eea"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">QR</text>
</svg>`;
};

// Размеры иконок
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Создаем папку icons если её нет
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Генерируем SVG иконки
console.log('Генерация SVG иконок...');
sizes.forEach(size => {
  const svg = createSVGIcon(size);
  const svgPath = path.join(iconsDir, `icon-${size}x${size}.svg`);
  fs.writeFileSync(svgPath, svg);
  console.log(`✓ Создан ${svgPath}`);
});

console.log('\n⚠ ВНИМАНИЕ: Созданы только SVG иконки.');
console.log('Для полноценной работы PWA нужны PNG иконки.');
console.log('\nВарианты получения PNG иконок:');
console.log('1. Используйте онлайн-генератор: https://realfavicongenerator.net/');
console.log('2. Используйте PWA Builder: https://www.pwabuilder.com/imageGenerator');
console.log('3. Конвертируйте SVG в PNG используя ImageMagick или другой инструмент');
console.log('\nПосле получения PNG иконок, поместите их в папку public/icons/');

