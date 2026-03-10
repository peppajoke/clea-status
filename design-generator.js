// design-generator.js — T-shirt design generator using @napi-rs/canvas
// Renders text + graphics to 4500x5400 transparent-background PNGs
// Uses canvas for text (guaranteed font rendering) instead of SVG <text>

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 4500, H = 5400;
const CX = W / 2, CY = H / 2;

// Register Impact font
GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Impact.ttf'), 'Impact');

// ── Color system ──────────────────────────────────────────────────────────────
const COLOR_MAP = {
  red: '#FF2D55', blue: '#0A84FF', green: '#30D158', gold: '#FFD60A',
  pink: '#FF375F', purple: '#BF5AF2', orange: '#FF9F0A', cyan: '#64D2FF',
  neon: '#39FF14', white: '#FFFFFF', black: '#1A1A1A', yellow: '#FFD60A',
  teal: '#40E0D0', magenta: '#FF00FF', crimson: '#DC143C', lime: '#AAFF00',
};

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

// Default palette rotation so plain prompts get interesting colors
const DEFAULT_PALETTES = [
  ['#FF2D55', '#FF6B35', '#FFFFFF'],   // hot red → orange
  ['#0A84FF', '#64D2FF', '#FFFFFF'],   // electric blue → cyan
  ['#BF5AF2', '#FF375F', '#FFFFFF'],   // purple → pink
  ['#FFD60A', '#FF9F0A', '#FFFFFF'],   // gold → amber
  ['#30D158', '#64D2FF', '#FFFFFF'],   // green → teal
  ['#FF2D55', '#BF5AF2', '#FFFFFF'],   // red → purple
];

function getColors(prompt) {
  const explicit = detectColor(prompt);
  const palette = detectPalette(prompt);
  if (palette) return { primary: explicit || palette[0], accent: palette[1], highlight: palette[2] };
  if (explicit) return { primary: explicit, accent: explicit, highlight: '#FFFFFF' };
  // Hash prompt to pick a consistent default palette
  const hash = Math.abs([...prompt].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
  const def = DEFAULT_PALETTES[hash % DEFAULT_PALETTES.length];
  return { primary: def[0], accent: def[1], highlight: def[2] };
}

// ── Canvas helpers ────────────────────────────────────────────────────────────
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

function calcFontSize(ctx, lines, maxWidth, maxSize, minSize = 120) {
  let size = maxSize;
  while (size > minSize) {
    ctx.font = `900 ${size}px Impact`;
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (widest <= maxWidth) break;
    size -= 20;
  }
  return size;
}

function drawText(ctx, text, x, y, { fontSize, fill, stroke, strokeWidth, letterSpacing }) {
  ctx.font = `900 ${fontSize}px Impact`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (letterSpacing && letterSpacing > 0) {
    // Draw with letter spacing manually
    const chars = [...text];
    const totalWidth = chars.reduce((sum, ch) => sum + ctx.measureText(ch).width + letterSpacing, -letterSpacing);
    let cx = x - totalWidth / 2;
    ctx.textAlign = 'left';
    for (const ch of chars) {
      const w = ctx.measureText(ch).width;
      if (stroke && strokeWidth) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(ch, cx, y);
      }
      ctx.fillStyle = fill;
      ctx.fillText(ch, cx, y);
      cx += w + letterSpacing;
    }
    ctx.textAlign = 'center';
  } else {
    if (stroke && strokeWidth) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }
}

function drawMultiline(ctx, lines, centerY, opts) {
  const lineHeight = opts.fontSize * 1.15;
  const startY = centerY - ((lines.length - 1) * lineHeight) / 2;
  for (let i = 0; i < lines.length; i++) {
    drawText(ctx, lines[i], CX, startY + i * lineHeight, opts);
  }
}

// ── Gradient helpers ──────────────────────────────────────────────────────────
function vertGradient(ctx, y1, y2, color1, color2) {
  const g = ctx.createLinearGradient(0, y1, 0, y2);
  g.addColorStop(0, color1);
  g.addColorStop(1, color2);
  return g;
}

// ── Icon drawing ──────────────────────────────────────────────────────────────
function drawCrosshair(ctx, cx, cy, colors, scale = 1) {
  const s = scale;
  ctx.save();
  ctx.translate(cx, cy);

  // Outer ring
  ctx.beginPath(); ctx.arc(0, 0, 700*s, 0, Math.PI*2);
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 50*s; ctx.globalAlpha = 0.3; ctx.stroke();
  ctx.globalAlpha = 1;

  // Main ring
  ctx.beginPath(); ctx.arc(0, 0, 500*s, 0, Math.PI*2);
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 60*s; ctx.stroke();

  // Inner ring
  ctx.beginPath(); ctx.arc(0, 0, 250*s, 0, Math.PI*2);
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 40*s; ctx.stroke();

  // Center dot
  ctx.beginPath(); ctx.arc(0, 0, 60*s, 0, Math.PI*2);
  ctx.fillStyle = colors.primary; ctx.fill();

  // Crosshairs
  ctx.lineWidth = 40*s; ctx.strokeStyle = colors.primary;
  for (const [x1, y1, x2, y2] of [[-800*s, 0, -300*s, 0], [300*s, 0, 800*s, 0], [0, -800*s, 0, -300*s], [0, 300*s, 0, 800*s]]) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}

function drawSkull(ctx, cx, cy, colors, scale = 1) {
  const s = scale * 2.2;
  ctx.save();
  ctx.translate(cx, cy);

  // Head
  ctx.beginPath();
  ctx.moveTo(0, -200*s);
  ctx.bezierCurveTo(-180*s, -200*s, -280*s, -100*s, -280*s, 50*s);
  ctx.bezierCurveTo(-280*s, 150*s, -240*s, 220*s, -160*s, 260*s);
  ctx.lineTo(-160*s, 320*s); ctx.lineTo(-80*s, 320*s); ctx.lineTo(-60*s, 280*s);
  ctx.lineTo(60*s, 280*s); ctx.lineTo(80*s, 320*s); ctx.lineTo(160*s, 320*s);
  ctx.lineTo(160*s, 260*s);
  ctx.bezierCurveTo(240*s, 220*s, 280*s, 150*s, 280*s, 50*s);
  ctx.bezierCurveTo(280*s, -100*s, 180*s, -200*s, 0, -200*s);
  ctx.closePath();
  ctx.fillStyle = colors.primary; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 12*s; ctx.stroke();

  // Eyes
  for (const ex of [-100*s, 100*s]) {
    ctx.beginPath(); ctx.ellipse(ex, 30*s, 55*s, 65*s, 0, 0, Math.PI*2);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex, 30*s, 30*s, 40*s, 0, 0, Math.PI*2);
    ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.3; ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Nose
  ctx.beginPath(); ctx.moveTo(-40*s, 170*s); ctx.lineTo(0, 200*s); ctx.lineTo(40*s, 170*s);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 14*s; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

function drawFlame(ctx, cx, cy, colors, scale = 1) {
  const s = scale * 1.6;
  ctx.save();
  ctx.translate(cx, cy);

  // Outer flame
  ctx.beginPath();
  ctx.moveTo(0, -550*s);
  ctx.bezierCurveTo(-50*s, -480*s, -200*s, -300*s, -280*s, -100*s);
  ctx.bezierCurveTo(-350*s, 80*s, -300*s, 280*s, -200*s, 400*s);
  ctx.bezierCurveTo(-100*s, 520*s, -30*s, 580*s, 0, 630*s);
  ctx.bezierCurveTo(30*s, 580*s, 100*s, 520*s, 200*s, 400*s);
  ctx.bezierCurveTo(300*s, 280*s, 350*s, 80*s, 280*s, -100*s);
  ctx.bezierCurveTo(200*s, -300*s, 50*s, -480*s, 0, -550*s);
  ctx.closePath();
  ctx.fillStyle = colors.primary; ctx.globalAlpha = 0.9; ctx.fill();
  ctx.globalAlpha = 1;

  // Middle flame
  ctx.beginPath();
  ctx.moveTo(0, -350*s);
  ctx.bezierCurveTo(-30*s, -300*s, -150*s, -180*s, -180*s, -30*s);
  ctx.bezierCurveTo(-210*s, 100*s, -160*s, 220*s, -100*s, 300*s);
  ctx.bezierCurveTo(-40*s, 370*s, -15*s, 400*s, 0, 430*s);
  ctx.bezierCurveTo(15*s, 400*s, 40*s, 370*s, 100*s, 300*s);
  ctx.bezierCurveTo(160*s, 220*s, 210*s, 100*s, 180*s, -30*s);
  ctx.bezierCurveTo(150*s, -180*s, 30*s, -300*s, 0, -350*s);
  ctx.closePath();
  ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.85; ctx.fill();
  ctx.globalAlpha = 1;

  // Inner flame
  ctx.beginPath();
  ctx.moveTo(0, -180*s);
  ctx.bezierCurveTo(-15*s, -150*s, -80*s, -70*s, -90*s, 20*s);
  ctx.bezierCurveTo(-100*s, 90*s, -70*s, 150*s, -40*s, 200*s);
  ctx.bezierCurveTo(-10*s, 230*s, 0, 250*s, 0, 270*s);
  ctx.bezierCurveTo(0, 250*s, 10*s, 230*s, 40*s, 200*s);
  ctx.bezierCurveTo(70*s, 150*s, 100*s, 90*s, 90*s, 20*s);
  ctx.bezierCurveTo(80*s, -70*s, 15*s, -150*s, 0, -180*s);
  ctx.closePath();
  ctx.fillStyle = colors.highlight; ctx.fill();
  ctx.restore();
}

function drawLightning(ctx, cx, cy, colors, scale = 1) {
  const s = scale * 1.4;
  ctx.save();
  ctx.translate(cx, cy);
  const pts = [[-80*s,-650*s], [-350*s,50*s], [-50*s,50*s], [80*s,650*s], [350*s,-50*s], [50*s,-50*s]];
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.fillStyle = colors.primary; ctx.fill();
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 20*s; ctx.lineJoin = 'round'; ctx.stroke();

  // Inner highlight
  const inner = [[-50*s,-500*s], [-250*s,30*s], [-20*s,30*s], [50*s,500*s], [250*s,-30*s], [20*s,-30*s]];
  ctx.beginPath(); ctx.moveTo(inner[0][0], inner[0][1]);
  for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
  ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.3; ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawShield(ctx, cx, cy, colors, scale = 1) {
  const s = scale * 1.5;
  ctx.save();
  ctx.translate(cx, cy);
  const pts = [[0,-500*s], [-400*s,-300*s], [-350*s,250*s], [0,500*s], [350*s,250*s], [400*s,-300*s]];
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 50*s; ctx.lineJoin = 'round'; ctx.stroke();

  const inner = [[0,-350*s], [-260*s,-200*s], [-230*s,170*s], [0,350*s], [230*s,170*s], [260*s,-200*s]];
  ctx.beginPath(); ctx.moveTo(inner[0][0], inner[0][1]);
  for (let i = 1; i < inner.length; i++) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 20*s; ctx.globalAlpha = 0.4; ctx.stroke();
  ctx.globalAlpha = 1;

  // Cross
  ctx.lineWidth = 30*s; ctx.strokeStyle = colors.primary; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -200*s); ctx.lineTo(0, 200*s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-150*s, 0); ctx.lineTo(150*s, 0); ctx.stroke();
  ctx.restore();
}

function drawSword(ctx, cx, cy, colors, scale = 1) {
  const s = scale * 1.6;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 6);

  // Blade
  ctx.fillStyle = colors.primary;
  ctx.fillRect(-18*s, -500*s, 36*s, 700*s);

  // Point
  ctx.beginPath(); ctx.moveTo(0, -550*s); ctx.lineTo(-50*s, -450*s); ctx.lineTo(50*s, -450*s); ctx.closePath();
  ctx.fill();

  // Guard
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(-120*s, 180*s, 240*s, 40*s, 8*s);
  ctx.fill();

  // Grip
  ctx.fillStyle = colors.primary;
  ctx.fillRect(-14*s, 220*s, 28*s, 160*s);

  // Pommel
  ctx.beginPath(); ctx.arc(0, 400*s, 30*s, 0, Math.PI*2);
  ctx.fillStyle = colors.accent; ctx.fill();
  ctx.restore();
}

function drawController(ctx, cx, cy, colors, scale = 1) {
  const s = scale * 2;
  ctx.save();
  ctx.translate(cx, cy);

  // Body
  ctx.beginPath();
  ctx.moveTo(-220*s, -80*s);
  ctx.bezierCurveTo(-280*s, -80*s, -320*s, -40*s, -320*s, 30*s);
  ctx.lineTo(-320*s, 120*s);
  ctx.bezierCurveTo(-320*s, 180*s, -280*s, 220*s, -220*s, 220*s);
  ctx.lineTo(-120*s, 220*s);
  ctx.bezierCurveTo(-80*s, 220*s, -40*s, 180*s, -20*s, 140*s);
  ctx.lineTo(20*s, 140*s);
  ctx.bezierCurveTo(40*s, 180*s, 80*s, 220*s, 120*s, 220*s);
  ctx.lineTo(220*s, 220*s);
  ctx.bezierCurveTo(280*s, 220*s, 320*s, 180*s, 320*s, 120*s);
  ctx.lineTo(320*s, 30*s);
  ctx.bezierCurveTo(320*s, -40*s, 280*s, -80*s, 220*s, -80*s);
  ctx.closePath();
  ctx.fillStyle = colors.primary; ctx.fill();
  ctx.strokeStyle = '#000'; ctx.lineWidth = 10*s; ctx.stroke();

  // D-pad
  ctx.fillStyle = '#000'; ctx.globalAlpha = 0.5;
  ctx.fillRect(-180*s, -20*s, 30*s, 90*s);
  ctx.fillRect(-215*s, 15*s, 100*s, 25*s);
  ctx.globalAlpha = 1;

  // Buttons
  const btns = [[160*s, 0], [200*s, 40*s], [120*s, 40*s], [160*s, 80*s]];
  for (let i = 0; i < btns.length; i++) {
    ctx.beginPath(); ctx.arc(btns[i][0], btns[i][1], 18*s, 0, Math.PI*2);
    ctx.fillStyle = colors.accent; ctx.globalAlpha = i === 0 ? 1 : 0.6; ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Icon registry ─────────────────────────────────────────────────────────────
const ICON_KEYWORDS = {
  crosshair: ['crosshair', 'scope', 'target', 'aim', 'headshot', 'sniper'],
  skull: ['skull', 'death', 'dead', 'kill', 'rip', 'bones', 'wasted'],
  flame: ['flame', 'fire', 'hot', 'burn', 'lit'],
  lightning: ['lightning', 'bolt', 'electric', 'power', 'energy', 'thunder', 'shock', 'zap'],
  shield: ['shield', 'defend', 'tank', 'protect', 'guard', 'armor'],
  sword: ['sword', 'blade', 'slash', 'cut', 'weapon'],
  controller: ['controller', 'gaming', 'gamepad', 'joystick', 'console', 'gamer'],
};

const ICON_DRAWERS = {
  crosshair: drawCrosshair,
  skull: drawSkull,
  flame: drawFlame,
  lightning: drawLightning,
  shield: drawShield,
  sword: drawSword,
  controller: drawController,
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

// ── Style detection ───────────────────────────────────────────────────────────
const STYLE_KEYWORDS = {
  neon: ['neon', 'glow', 'rave', 'synthwave', 'cyber', 'vaporwave', 'electric'],
  distressed: ['distressed', 'grunge', 'vintage', 'worn', 'old', 'faded', 'weathered'],
  varsity: ['varsity', 'college', 'team', 'collegiate', 'sport', 'athletic', 'league'],
  street: ['street', 'urban', 'hip hop', 'hood', 'block'],
  minimal: ['minimal', 'clean', 'simple', 'elegant', 'subtle'],
  retro: ['retro', 'arcade', 'pixel', '8-bit', '8bit', 'insert coin', 'press start', 'game over'],
};

function detectStyle(prompt) {
  const p = prompt.toLowerCase();
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    for (const kw of keywords) {
      if (p.includes(kw)) return style;
    }
  }
  return null;
}

// ── Design styles ─────────────────────────────────────────────────────────────

function styleBold(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 12);
  const fontSize = calcFontSize(ctx, lines, W * 0.85, 700);
  const spacing = fontSize * 0.06;

  // Drop shadow
  ctx.save();
  ctx.shadowColor = colors.primary;
  ctx.shadowBlur = 80;
  ctx.shadowOffsetY = 30;
  drawMultiline(ctx, lines, CY, {
    fontSize, fill: colors.primary, stroke: '#000', strokeWidth: fontSize * 0.08, letterSpacing: spacing
  });
  ctx.restore();

  // Main text with gradient
  const grad = vertGradient(ctx, CY - fontSize, CY + fontSize, colors.primary, colors.accent);
  drawMultiline(ctx, lines, CY, {
    fontSize, fill: grad, stroke: '#000', strokeWidth: fontSize * 0.08, letterSpacing: spacing
  });

  // Accent line
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(CX - 1200, CY + fontSize * 0.7); ctx.lineTo(CX + 1200, CY + fontSize * 0.7); ctx.stroke();
  ctx.globalAlpha = 1;
}

function styleNeon(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 14);
  const fontSize = calcFontSize(ctx, lines, W * 0.8, 600);

  // Glow layers (multiple blurred passes)
  for (let i = 3; i >= 0; i--) {
    ctx.save();
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = 60 + i * 40;
    ctx.globalAlpha = 0.15 + i * 0.05;
    drawMultiline(ctx, lines, CY, { fontSize, fill: colors.primary });
    ctx.restore();
  }

  // Crisp text on top
  drawMultiline(ctx, lines, CY, {
    fontSize, fill: colors.highlight || '#FFFFFF',
    stroke: colors.primary, strokeWidth: fontSize * 0.04,
    letterSpacing: fontSize * 0.04
  });
}

function styleDistressed(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 12);
  const fontSize = calcFontSize(ctx, lines, W * 0.85, 700);

  // Draw text
  drawMultiline(ctx, lines, CY, {
    fontSize, fill: colors.primary,
    stroke: '#000', strokeWidth: fontSize * 0.06,
    letterSpacing: fontSize * 0.04
  });

  // Distress overlay — random rectangles that "erase" parts
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const seed = [...text].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  for (let i = 0; i < 200; i++) {
    const x = Math.abs((seed * (i + 1) * 7) % W);
    const y = Math.abs((seed * (i + 1) * 13) % H);
    const w = 20 + Math.abs((seed * (i + 1) * 3) % 80);
    const h = 10 + Math.abs((seed * (i + 1) * 11) % 30);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function styleVarsity(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 10);
  const fontSize = calcFontSize(ctx, lines, W * 0.8, 650);

  // Stars decoration
  ctx.font = `200px Impact`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.5;
  ctx.fillText('★  ★  ★', CX, CY - fontSize * 0.9);
  ctx.globalAlpha = 1;

  // Triple outline: outer dark, middle colored, inner fill
  drawMultiline(ctx, lines, CY, { fontSize, fill: 'transparent', stroke: '#000', strokeWidth: fontSize * 0.14 });
  drawMultiline(ctx, lines, CY, { fontSize, fill: 'transparent', stroke: colors.accent, strokeWidth: fontSize * 0.08 });
  drawMultiline(ctx, lines, CY, { fontSize, fill: colors.primary, letterSpacing: fontSize * 0.05 });

  // Underline decorations
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(CX - fontSize * 1.5, CY + fontSize * 0.7); ctx.lineTo(CX + fontSize * 1.5, CY + fontSize * 0.7); ctx.stroke();
  ctx.strokeStyle = colors.accent; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(CX - fontSize * 1.3, CY + fontSize * 0.82); ctx.lineTo(CX + fontSize * 1.3, CY + fontSize * 0.82); ctx.stroke();
}

function styleStreet(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 10);
  const fontSize = calcFontSize(ctx, lines, W * 0.85, 750);

  // Hard offset shadow
  ctx.save();
  ctx.globalAlpha = 0.35;
  drawMultiline(ctx, lines, CY + 24, { fontSize, fill: colors.accent, letterSpacing: fontSize * 0.02 });
  ctx.restore();

  // Second shadow layer
  drawMultiline(ctx, lines, CY + 12, { fontSize, fill: '#000', stroke: '#000', strokeWidth: fontSize * 0.02 });

  // Main text
  drawMultiline(ctx, lines, CY, {
    fontSize, fill: colors.primary,
    stroke: '#000', strokeWidth: fontSize * 0.06,
    letterSpacing: fontSize * 0.02
  });
}

function styleMinimal(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 20);
  const fontSize = calcFontSize(ctx, lines, W * 0.7, 450);

  // Top rule
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 4; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(CX - 600, CY - fontSize * 0.8); ctx.lineTo(CX + 600, CY - fontSize * 0.8); ctx.stroke();
  ctx.globalAlpha = 1;

  drawMultiline(ctx, lines, CY, {
    fontSize, fill: colors.primary, letterSpacing: fontSize * 0.2
  });

  // Bottom rule
  ctx.strokeStyle = colors.primary; ctx.lineWidth = 4; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(CX - 600, CY + fontSize * 0.8); ctx.lineTo(CX + 600, CY + fontSize * 0.8); ctx.stroke();
  ctx.globalAlpha = 1;
}

function styleRetro(ctx, text, colors) {
  const lines = splitText(text.toUpperCase(), 12);
  const fontSize = calcFontSize(ctx, lines, W * 0.8, 550);

  // Scanlines
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.globalAlpha = 0.1;
  for (let y = 0; y < H; y += 16) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // "PRESS START" subtitle
  ctx.font = `140px Impact`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.6;
  ctx.letterSpacing = '40px';
  ctx.fillText('PRESS START', CX, CY - fontSize);
  ctx.globalAlpha = 1;

  // Shadow
  drawMultiline(ctx, lines, CY + 50, { fontSize, fill: '#000' });

  // Main text
  drawMultiline(ctx, lines, CY, {
    fontSize, fill: colors.primary,
    stroke: colors.accent, strokeWidth: fontSize * 0.03,
    letterSpacing: fontSize * 0.08
  });

  // Score dots
  ctx.font = `120px Impact`;
  ctx.fillStyle = colors.accent; ctx.globalAlpha = 0.5;
  ctx.fillText('■  ■  ■  ■  ■', CX, CY + fontSize * 1.1);
  ctx.globalAlpha = 1;
}

// ── Style registry ────────────────────────────────────────────────────────────
const STYLE_FNS = {
  neon: styleNeon,
  distressed: styleDistressed,
  varsity: styleVarsity,
  street: styleStreet,
  minimal: styleMinimal,
  retro: styleRetro,
};

// ── Main export ───────────────────────────────────────────────────────────────
export function generateDesign(prompt) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, W, H);

  const colors = getColors(prompt);
  const icon = detectIcon(prompt);
  const style = detectStyle(prompt);

  if (icon) {
    // Icon + text layout — tighter composition
    const drawIcon = ICON_DRAWERS[icon];
    const iconY = CY - 400;
    const textY = CY + 800;

    // Shadow behind icon
    ctx.save();
    ctx.shadowColor = colors.primary; ctx.shadowBlur = 80; ctx.shadowOffsetY = 30;
    drawIcon(ctx, CX, iconY, colors, 1);
    ctx.restore();
    drawIcon(ctx, CX, iconY, colors, 1);

    // Text below icon
    const lines = splitText(prompt.toUpperCase(), 14);
    const fontSize = calcFontSize(ctx, lines, W * 0.8, 500);
    const grad = vertGradient(ctx, textY - fontSize, textY + fontSize, colors.primary, colors.accent);
    drawMultiline(ctx, lines, textY, {
      fontSize, fill: grad,
      stroke: '#000', strokeWidth: fontSize * 0.07,
      letterSpacing: fontSize * 0.04
    });
  } else {
    const styleFn = style ? STYLE_FNS[style] : styleBold;
    styleFn(ctx, prompt, colors);
  }

  return canvas.toBuffer('image/png');
}
