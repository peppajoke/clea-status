// design-generator.js — SVG design generator for t-shirt prints
// Generates 4500x5400 transparent-background PNGs via sharp

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 4500, H = 5400;
const CX = W / 2, CY = H / 2;

// Load Impact font as base64 for embedding in SVGs (ensures text renders on any server)
let IMPACT_FONT_B64 = '';
try {
  IMPACT_FONT_B64 = fs.readFileSync(path.join(__dirname, 'impact-font-b64.txt'), 'utf-8').trim();
} catch (e) {
  console.warn('[design-generator] Could not load Impact font base64:', e.message);
}

// ── Color system ──────────────────────────────────────────────────────────────
const COLOR_MAP = {
  red: '#FF2D55', blue: '#0A84FF', green: '#30D158', gold: '#FFD60A',
  pink: '#FF375F', purple: '#BF5AF2', orange: '#FF9F0A', cyan: '#64D2FF',
  neon: '#39FF14', white: '#FFFFFF', black: '#1A1A1A', yellow: '#FFD60A',
  teal: '#40E0D0', magenta: '#FF00FF', crimson: '#DC143C', lime: '#AAFF00',
};

// Complementary palettes: [primary, accent, highlight]
const PALETTES = {
  fire:    ['#FF2D00', '#FF8C00', '#FFD600'],
  ice:     ['#00BFFF', '#E0F7FF', '#FFFFFF'],
  neon:    ['#39FF14', '#FF00FF', '#00FFFF'],
  gold:    ['#FFD60A', '#FFA000', '#FFFFFF'],
  blood:   ['#DC143C', '#8B0000', '#FF6B6B'],
  cyber:   ['#00FFFF', '#FF00FF', '#0A84FF'],
  sunset:  ['#FF6B35', '#F7C948', '#FF2D55'],
  toxic:   ['#39FF14', '#AAFF00', '#00FF88'],
  royal:   ['#BF5AF2', '#FFD60A', '#FFFFFF'],
  stealth: ['#CCCCCC', '#888888', '#FFFFFF'],
};

function detectColor(prompt) {
  const p = prompt.toLowerCase();
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (p.includes(name)) return hex;
  }
  return null;
}

function detectPalette(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('fire') || p.includes('flame') || p.includes('hot') || p.includes('burn')) return PALETTES.fire;
  if (p.includes('ice') || p.includes('frost') || p.includes('cold') || p.includes('freeze')) return PALETTES.ice;
  if (p.includes('neon') || p.includes('glow') || p.includes('rave')) return PALETTES.neon;
  if (p.includes('gold') || p.includes('champion') || p.includes('win') || p.includes('king') || p.includes('queen')) return PALETTES.gold;
  if (p.includes('blood') || p.includes('kill') || p.includes('death') || p.includes('dead')) return PALETTES.blood;
  if (p.includes('cyber') || p.includes('hack') || p.includes('glitch') || p.includes('digital')) return PALETTES.cyber;
  if (p.includes('toxic') || p.includes('poison') || p.includes('acid')) return PALETTES.toxic;
  if (p.includes('royal') || p.includes('crown') || p.includes('throne')) return PALETTES.royal;
  return null;
}

function getColors(prompt) {
  const explicit = detectColor(prompt);
  const palette = detectPalette(prompt);
  if (palette) return { primary: explicit || palette[0], accent: palette[1], highlight: palette[2] };
  const pri = explicit || '#FFFFFF';
  return { primary: pri, accent: pri, highlight: pri };
}

// ── SVG helpers ───────────────────────────────────────────────────────────────
function svgOpen() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
}

function fontStyle() {
  if (!IMPACT_FONT_B64) return '';
  return `<style>
    @font-face {
      font-family: 'Impact';
      src: url('data:font/ttf;base64,${IMPACT_FONT_B64}') format('truetype');
      font-weight: normal;
      font-style: normal;
    }
  </style>`;
}

function defs(primary, accent, highlight) {
  return fontStyle() + `<defs>
    <linearGradient id="grad-v" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="grad-h" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="50%" stop-color="${highlight}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <linearGradient id="grad-d" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${primary}"/>
      <stop offset="100%" stop-color="${accent}"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="30" stdDeviation="40" flood-color="${primary}" flood-opacity="0.4"/>
    </filter>
    <filter id="shadow-hard" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="12" dy="12" stdDeviation="0" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
    <filter id="glow" x="-20%" y="-20%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="60" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glow-strong" x="-30%" y="-30%" width="170%" height="170%">
      <feGaussianBlur stdDeviation="100" result="blur1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="blur2"/>
      <feMerge><feMergeNode in="blur1"/><feMergeNode in="blur2"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="distress" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" seed="42" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="bw"/>
      <feComponentTransfer in="bw" result="thresh">
        <feFuncA type="discrete" tableValues="0 0 0 0 1 1 1 1"/>
      </feComponentTransfer>
      <feComposite in="SourceGraphic" in2="thresh" operator="in"/>
    </filter>
  </defs>`;
}

function escapeXml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Text rendering with effects ──────────────────────────────────────────────
function calcFontSize(text, maxWidth, maxSize) {
  // Rough estimate: each char ~0.6 * fontSize wide
  const charWidth = 0.62;
  const lines = text.split('\n');
  const longestLine = Math.max(...lines.map(l => l.length));
  const fitSize = Math.floor(maxWidth / (longestLine * charWidth));
  return Math.min(fitSize, maxSize);
}

function renderText(text, { y, fontSize, fill, stroke, strokeWidth, filter, fontFamily, letterSpacing, opacity }) {
  const font = fontFamily || 'Impact, Arial Black, sans-serif';
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.15;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;

  return lines.map((line, i) => {
    const ly = startY + i * lineHeight;
    const escaped = escapeXml(line);
    const attrs = [
      `x="${CX}" y="${ly}"`,
      `text-anchor="middle" dominant-baseline="central"`,
      `font-family="${font}"`,
      `font-size="${fontSize}" font-weight="900"`,
      letterSpacing ? `letter-spacing="${letterSpacing}"` : '',
      filter ? `filter="url(#${filter})"` : '',
      opacity ? `opacity="${opacity}"` : '',
    ].filter(Boolean).join(' ');

    let out = '';
    // Stroke/outline layer
    if (stroke && strokeWidth) {
      out += `<text ${attrs} fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round">${escaped}</text>`;
    }
    // Fill layer
    out += `<text ${attrs} fill="${fill}">${escaped}</text>`;
    return out;
  }).join('\n');
}

// ── Design styles ─────────────────────────────────────────────────────────────

function styleBold(text, colors) {
  // Big, punchy text with outline + shadow. The workhorse.
  const words = text.toUpperCase();
  const lines = splitText(words, 12);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.85, 700);

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Subtle accent line behind text
    `<line x1="${CX - 1200}" y1="${CY + fontSize * 0.6}" x2="${CX + 1200}" y2="${CY + fontSize * 0.6}" stroke="${colors.primary}" stroke-width="6" opacity="0.2"/>` +
    renderText(display, {
      y: CY, fontSize,
      fill: 'url(#grad-v)',
      stroke: '#000000', strokeWidth: fontSize * 0.08,
      filter: 'shadow',
      letterSpacing: fontSize * 0.06,
    }) +
    '</svg>';
}

function styleNeon(text, colors) {
  const words = text.toUpperCase();
  const lines = splitText(words, 14);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.8, 600);

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Glow background text (blurred duplicate for neon bloom)
    renderText(display, {
      y: CY, fontSize: fontSize,
      fill: colors.primary,
      filter: 'glow-strong',
      opacity: 0.6,
    }) +
    // Crisp foreground text
    renderText(display, {
      y: CY, fontSize,
      fill: colors.highlight || '#FFFFFF',
      stroke: colors.primary, strokeWidth: fontSize * 0.04,
      letterSpacing: fontSize * 0.04,
    }) +
    '</svg>';
}

function styleDistressed(text, colors) {
  const words = text.toUpperCase();
  const lines = splitText(words, 12);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.85, 700);

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Distressed text
    renderText(display, {
      y: CY, fontSize,
      fill: colors.primary,
      stroke: '#000000', strokeWidth: fontSize * 0.06,
      filter: 'distress',
      letterSpacing: fontSize * 0.04,
    }) +
    '</svg>';
}

function styleVarsity(text, colors) {
  // Collegiate / varsity style — arched text with thick outlines
  const words = text.toUpperCase();
  const lines = splitText(words, 10);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.8, 650);

  // Double outline: dark outer, colored inner
  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Stars/decorative elements
    `<text x="${CX}" y="${CY - fontSize * 0.9}" text-anchor="middle" font-size="200" fill="${colors.accent}" opacity="0.5">★ ★ ★</text>` +
    // Outer stroke
    renderText(display, {
      y: CY, fontSize,
      fill: 'none',
      stroke: '#000000', strokeWidth: fontSize * 0.14,
    }) +
    // Inner stroke (colored)
    renderText(display, {
      y: CY, fontSize,
      fill: 'none',
      stroke: colors.accent, strokeWidth: fontSize * 0.08,
    }) +
    // Fill
    renderText(display, {
      y: CY, fontSize,
      fill: colors.primary,
      letterSpacing: fontSize * 0.05,
    }) +
    // Underline decoration
    `<line x1="${CX - fontSize * 1.5}" y1="${CY + fontSize * 0.7}" x2="${CX + fontSize * 1.5}" y2="${CY + fontSize * 0.7}" stroke="${colors.primary}" stroke-width="20"/>` +
    `<line x1="${CX - fontSize * 1.3}" y1="${CY + fontSize * 0.82}" x2="${CX + fontSize * 1.3}" y2="${CY + fontSize * 0.82}" stroke="${colors.accent}" stroke-width="10"/>` +
    '</svg>';
}

function styleStreet(text, colors) {
  // Streetwear — hard shadow, tight spacing, aggressive
  const words = text.toUpperCase();
  const lines = splitText(words, 10);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.85, 750);

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Hard offset shadow
    renderText(display, {
      y: CY + 20, fontSize,
      fill: colors.accent,
      letterSpacing: fontSize * 0.02,
      fontFamily: 'Impact, Arial Black, sans-serif',
      opacity: 0.35,
      filter: 'shadow-hard',
    }) +
    // Main text with outline
    renderText(display, {
      y: CY, fontSize,
      fill: colors.primary,
      stroke: '#000000', strokeWidth: fontSize * 0.06,
      letterSpacing: fontSize * 0.02,
      fontFamily: 'Impact, Arial Black, sans-serif',
    }) +
    '</svg>';
}

function styleMinimal(text, colors) {
  // Clean, elegant, lots of whitespace
  const words = text.toUpperCase();
  const lines = splitText(words, 20);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.7, 450);

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Thin horizontal rules
    `<line x1="${CX - 600}" y1="${CY - fontSize * 0.8}" x2="${CX + 600}" y2="${CY - fontSize * 0.8}" stroke="${colors.primary}" stroke-width="4" opacity="0.4"/>` +
    renderText(display, {
      y: CY, fontSize,
      fill: colors.primary,
      letterSpacing: fontSize * 0.2,
      fontFamily: 'Impact, Helvetica, sans-serif',
    }) +
    `<line x1="${CX - 600}" y1="${CY + fontSize * 0.8}" x2="${CX + 600}" y2="${CY + fontSize * 0.8}" stroke="${colors.primary}" stroke-width="4" opacity="0.4"/>` +
    '</svg>';
}

function styleRetroArcade(text, colors) {
  // Pixel/arcade vibe — uses the pixel grid but much better
  const words = text.toUpperCase();
  const lines = splitText(words, 12);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.8, 550);

  // Scanline effect
  let scanlines = '';
  for (let y = 0; y < H; y += 12) {
    scanlines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#000" stroke-width="3" opacity="0.15"/>`;
  }

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    scanlines +
    // "INSERT COIN" style subtitle
    `<text x="${CX}" y="${CY - fontSize * 1}" text-anchor="middle" font-family="Impact, sans-serif" font-size="140" fill="${colors.accent}" letter-spacing="40" opacity="0.6">PRESS START</text>` +
    // Main text with pixel-y shadow
    renderText(display, {
      y: CY + 50, fontSize,
      fill: '#000000',
      fontFamily: 'Impact, sans-serif',
    }) +
    renderText(display, {
      y: CY, fontSize,
      fill: colors.primary,
      stroke: colors.accent, strokeWidth: fontSize * 0.03,
      fontFamily: 'Impact, sans-serif',
      letterSpacing: fontSize * 0.08,
    }) +
    // Score-like decoration
    `<text x="${CX}" y="${CY + fontSize * 1.1}" text-anchor="middle" font-family="Impact, sans-serif" font-size="120" fill="${colors.accent}" letter-spacing="20" opacity="0.5">■ ■ ■ ■ ■</text>` +
    '</svg>';
}

function styleWithIcon(text, colors, iconSvg) {
  // Text + icon composition
  const words = text.toUpperCase();
  const lines = splitText(words, 14);
  const display = lines.join('\n');
  const fontSize = calcFontSize(display, W * 0.8, 550);
  const textY = CY + 600;

  return svgOpen() + defs(colors.primary, colors.accent, colors.highlight) +
    // Icon centered in upper portion
    `<g transform="translate(${CX}, ${CY - 500})" filter="url(#shadow)">` +
    iconSvg +
    '</g>' +
    // Text below with outline
    renderText(display, {
      y: textY, fontSize,
      fill: 'url(#grad-v)',
      stroke: '#000000', strokeWidth: fontSize * 0.07,
      letterSpacing: fontSize * 0.04,
    }) +
    '</svg>';
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function iconCrosshair(colors) {
  return `
    <circle cx="0" cy="0" r="700" fill="none" stroke="${colors.primary}" stroke-width="50" opacity="0.3"/>
    <circle cx="0" cy="0" r="500" fill="none" stroke="${colors.primary}" stroke-width="60"/>
    <circle cx="0" cy="0" r="250" fill="none" stroke="${colors.accent}" stroke-width="40"/>
    <circle cx="0" cy="0" r="60" fill="${colors.primary}"/>
    <line x1="-800" y1="0" x2="-300" y2="0" stroke="${colors.primary}" stroke-width="40"/>
    <line x1="300" y1="0" x2="800" y2="0" stroke="${colors.primary}" stroke-width="40"/>
    <line x1="0" y1="-800" x2="0" y2="-300" stroke="${colors.primary}" stroke-width="40"/>
    <line x1="0" y1="300" x2="0" y2="800" stroke="${colors.primary}" stroke-width="40"/>`;
}

function iconSkull(colors) {
  return `
    <g transform="scale(2.2)">
      <path d="M0,-200 C-180,-200 -280,-100 -280,50 C-280,150 -240,220 -160,260 L-160,320 L-80,320 L-60,280 L60,280 L80,320 L160,320 L160,260 C240,220 280,150 280,50 C280,-100 180,-200 0,-200 Z" fill="${colors.primary}" stroke="#000" stroke-width="12"/>
      <ellipse cx="-100" cy="30" rx="55" ry="65" fill="#000"/>
      <ellipse cx="100" cy="30" rx="55" ry="65" fill="#000"/>
      <ellipse cx="-100" cy="30" rx="30" ry="40" fill="${colors.accent}" opacity="0.3"/>
      <ellipse cx="100" cy="30" rx="30" ry="40" fill="${colors.accent}" opacity="0.3"/>
      <path d="M-40,170 L0,200 L40,170" fill="none" stroke="#000" stroke-width="14" stroke-linecap="round"/>
    </g>`;
}

function iconFlame(colors) {
  return `
    <g transform="scale(1.6)">
      <path d="M0,-550 C-50,-480 -200,-300 -280,-100 C-350,80 -300,280 -200,400 C-100,520 -30,580 0,630 C30,580 100,520 200,400 C300,280 350,80 280,-100 C200,-300 50,-480 0,-550 Z" fill="${colors.primary}" opacity="0.9"/>
      <path d="M0,-350 C-30,-300 -150,-180 -180,-30 C-210,100 -160,220 -100,300 C-40,370 -15,400 0,430 C15,400 40,370 100,300 C160,220 210,100 180,-30 C150,-180 30,-300 0,-350 Z" fill="${colors.accent}" opacity="0.85"/>
      <path d="M0,-180 C-15,-150 -80,-70 -90,20 C-100,90 -70,150 -40,200 C-10,230 0,250 0,270 C0,250 10,230 40,200 C70,150 100,90 90,20 C80,-70 15,-150 0,-180 Z" fill="${colors.highlight}"/>
    </g>`;
}

function iconLightning(colors) {
  return `
    <g transform="scale(1.4)">
      <polygon points="-80,-650 -350,50 -50,50 80,650 350,-50 50,-50" fill="${colors.primary}" stroke="${colors.accent}" stroke-width="20" stroke-linejoin="round"/>
      <polygon points="-50,-500 -250,30 -20,30 50,500 250,-30 20,-30" fill="${colors.accent}" opacity="0.3"/>
    </g>`;
}

function iconShield(colors) {
  return `
    <g transform="scale(1.5)">
      <path d="M0,-500 L-400,-300 L-350,250 L0,500 L350,250 L400,-300 Z" fill="none" stroke="${colors.primary}" stroke-width="50" stroke-linejoin="round"/>
      <path d="M0,-350 L-260,-200 L-230,170 L0,350 L230,170 L260,-200 Z" fill="none" stroke="${colors.accent}" stroke-width="20" opacity="0.4"/>
      <path d="M0,-200 L0,200 M-150,0 L150,0" stroke="${colors.primary}" stroke-width="30" stroke-linecap="round"/>
    </g>`;
}

function iconSword(colors) {
  return `
    <g transform="scale(1.6) rotate(-30)">
      <rect x="-18" y="-500" width="36" height="700" fill="${colors.primary}" rx="4"/>
      <polygon points="0,-550 -50,-450 50,-450" fill="${colors.primary}"/>
      <rect x="-120" y="180" width="240" height="40" rx="8" fill="${colors.accent}"/>
      <rect x="-14" y="220" width="28" height="160" rx="6" fill="${colors.primary}"/>
      <circle cx="0" cy="400" r="30" fill="${colors.accent}"/>
    </g>`;
}

function iconController(colors) {
  return `
    <g transform="scale(2)">
      <path d="M-220,-80 C-280,-80 -320,-40 -320,30 L-320,120 C-320,180 -280,220 -220,220 L-120,220 C-80,220 -40,180 -20,140 L20,140 C40,180 80,220 120,220 L220,220 C280,220 320,180 320,120 L320,30 C320,-40 280,-80 220,-80 Z" fill="${colors.primary}" stroke="#000" stroke-width="10"/>
      <rect x="-180" y="-20" width="30" height="90" rx="4" fill="#000" opacity="0.5"/>
      <rect x="-215" y="15" width="100" height="25" rx="4" fill="#000" opacity="0.5"/>
      <circle cx="160" cy="0" r="18" fill="${colors.accent}"/>
      <circle cx="200" cy="40" r="18" fill="${colors.accent}" opacity="0.6"/>
      <circle cx="120" cy="40" r="18" fill="${colors.accent}" opacity="0.6"/>
      <circle cx="160" cy="80" r="18" fill="${colors.accent}" opacity="0.6"/>
    </g>`;
}

// ── Text splitting ────────────────────────────────────────────────────────────
function splitText(text, maxCharsPerLine) {
  const words = text.split(/\s+/);
  if (words.length <= 1) return [text];
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current && (current + ' ' + word).length > maxCharsPerLine) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ── Style detection ───────────────────────────────────────────────────────────
const ICON_KEYWORDS = {
  crosshair: ['crosshair', 'scope', 'target', 'aim', 'headshot', 'sniper'],
  skull: ['skull', 'death', 'dead', 'kill', 'rip', 'bones'],
  flame: ['flame', 'fire', 'hot', 'burn', 'lit'],
  lightning: ['lightning', 'bolt', 'electric', 'power', 'energy', 'thunder', 'shock', 'zap'],
  shield: ['shield', 'defend', 'tank', 'protect', 'guard', 'armor'],
  sword: ['sword', 'blade', 'slash', 'cut', 'sharp', 'weapon'],
  controller: ['controller', 'gaming', 'gamepad', 'joystick', 'console', 'gamer'],
};

const STYLE_KEYWORDS = {
  neon: ['neon', 'glow', 'rave', 'synthwave', 'cyber', 'vaporwave', 'electric'],
  distressed: ['distressed', 'grunge', 'vintage', 'worn', 'old', 'faded', 'weathered'],
  varsity: ['varsity', 'college', 'team', 'collegiate', 'sport', 'athletic', 'league'],
  street: ['street', 'urban', 'hip hop', 'rap', 'hood', 'block', 'gang'],
  minimal: ['minimal', 'clean', 'simple', 'elegant', 'subtle'],
  retro: ['retro', 'arcade', 'pixel', '8-bit', '8bit', 'insert coin', 'press start', 'game over'],
};

function detectIcon(prompt) {
  const p = prompt.toLowerCase();
  for (const [icon, keywords] of Object.entries(ICON_KEYWORDS)) {
    for (const kw of keywords) {
      if (p.includes(kw)) return icon;
    }
  }
  return null;
}

function detectStyle(prompt) {
  const p = prompt.toLowerCase();
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    for (const kw of keywords) {
      if (p.includes(kw)) return style;
    }
  }
  return null;
}

const ICON_BUILDERS = {
  crosshair: iconCrosshair,
  skull: iconSkull,
  flame: iconFlame,
  lightning: iconLightning,
  shield: iconShield,
  sword: iconSword,
  controller: iconController,
};

const STYLE_BUILDERS = {
  neon: styleNeon,
  distressed: styleDistressed,
  varsity: styleVarsity,
  street: styleStreet,
  minimal: styleMinimal,
  retro: styleRetroArcade,
};

// ── Main export ───────────────────────────────────────────────────────────────
export function generateDesignSvg(prompt) {
  const colors = getColors(prompt);
  const icon = detectIcon(prompt);
  const style = detectStyle(prompt);

  // If we have an icon match, use icon+text composition
  if (icon) {
    const iconSvg = ICON_BUILDERS[icon](colors);
    // Still apply a style to the icon layout if possible
    return styleWithIcon(prompt, colors, iconSvg);
  }

  // Apply detected style, or fall back to bold
  const styleFn = style ? STYLE_BUILDERS[style] : styleBold;
  return styleFn(prompt, colors);
}
