const fs = require('fs');
const path = require('path');

// SVG templates
const mainIconSVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22C55E"/>
      <stop offset="100%" style="stop-color:#16A34A"/>
    </linearGradient>
    <linearGradient id="shineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:rgba(255,255,255,0.2)"/>
      <stop offset="50%" style="stop-color:rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="1024" height="1024" rx="224" fill="url(#bgGradient)"/>
  
  <!-- Subtle shine overlay -->
  <rect width="1024" height="1024" rx="224" fill="url(#shineGradient)"/>
  
  <!-- SpendLog text -->
  <text x="512" y="560" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="130" font-weight="700" fill="white" letter-spacing="-2">spendlog</text>
  
  <!-- Subtle bottom line accent -->
  <rect x="312" y="600" width="400" height="5" rx="2.5" fill="rgba(255,255,255,0.35)"/>
</svg>`;

const faviconSVG = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22C55E"/>
      <stop offset="100%" style="stop-color:#16A34A"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#bgGradient)"/>
  <text x="32" y="38" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="700" fill="white">spend</text>
  <text x="32" y="50" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="700" fill="white">log</text>
</svg>`;

const androidForegroundSVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- SpendLog text - smaller for adaptive icon safe zone -->
  <text x="512" y="540" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="100" font-weight="700" fill="white" letter-spacing="-1">spendlog</text>
  
  <!-- Subtle bottom line accent -->
  <rect x="362" y="575" width="300" height="4" rx="2" fill="rgba(255,255,255,0.35)"/>
</svg>`;

const androidBackgroundSVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#22C55E"/>
      <stop offset="100%" style="stop-color:#16A34A"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bgGradient)"/>
</svg>`;

const androidMonochromeSVG = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- SpendLog text - smaller for adaptive icon safe zone -->
  <text x="512" y="540" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="100" font-weight="700" fill="white" letter-spacing="-1">spendlog</text>
</svg>`;

const splashIconSVG = `<svg width="400" height="400" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <!-- SpendLog text -->
  <text x="200" y="215" text-anchor="middle" font-family="system-ui, -apple-system, BlinkMacSystemFont, sans-serif" font-size="52" font-weight="700" fill="#22C55E" letter-spacing="-1">spendlog</text>
  
  <!-- Bottom accent -->
  <rect x="120" y="240" width="160" height="3" rx="1.5" fill="rgba(34,197,94,0.35)"/>
</svg>`;

async function generateIcons() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.log('sharp not installed. Installing...');
    const { execSync } = require('child_process');
    execSync('npm install sharp --save-dev', { stdio: 'inherit' });
    sharp = require('sharp');
  }

  const assetsDir = path.join(__dirname, '..', 'assets', 'images');

  const icons = [
    { svg: mainIconSVG, name: 'icon.png', size: 1024 },
    { svg: faviconSVG, name: 'favicon.png', size: 64 },
    { svg: androidForegroundSVG, name: 'android-icon-foreground.png', size: 1024 },
    { svg: androidBackgroundSVG, name: 'android-icon-background.png', size: 1024 },
    { svg: androidMonochromeSVG, name: 'android-icon-monochrome.png', size: 1024 },
    { svg: splashIconSVG, name: 'splash-icon.png', size: 400 },
  ];

  for (const icon of icons) {
    const outputPath = path.join(assetsDir, icon.name);
    await sharp(Buffer.from(icon.svg))
      .resize(icon.size, icon.size)
      .png()
      .toFile(outputPath);
    console.log(`✓ Generated ${icon.name}`);
  }

  console.log('\n✅ All icons generated successfully!');
}

generateIcons().catch(console.error);
