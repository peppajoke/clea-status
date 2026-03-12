// design-llm.js — LLM-powered design generation via Anthropic API
// Asks Claude to generate rich SVG graphics, composites text via canvas

import sharp from 'sharp';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 4500, H = 5400;
const CX = W / 2;

// Register Impact font
try {
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Impact.ttf'), 'Impact');
} catch (_) {}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Model mapping from brain names to API model strings
const MODEL_MAP = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-5',
  opus: 'claude-sonnet-4-5',
};

const SYSTEM_PROMPT = `You are an expert t-shirt graphic designer specializing in gaming, streetwear, and pop culture apparel. You create bold, layered SVG compositions for premium print-on-demand designs.

## CANVAS SPECS
- Size: 4500×5400px portrait
- Background: TRANSPARENT — prints on fabric (expect dark shirts, white shirts)
- Graphic zone: top 60% of canvas (roughly y=0 to y=3200). Text added separately below.
- Safe margins: 400px on all sides minimum

## MANDATORY DESIGN PRINCIPLES

### 1. LAYERED COMPOSITION (required — at least 4 layers)
Every design must have visual depth through multiple layers:
- **Back layer**: Large geometric shapes, radial burst/starburst, faint tiling pattern (opacity 0.08–0.18). Examples: hexagon grid, concentric rings, dot array, radiating lines.
- **Shadow layer**: Offset duplicate of main graphic at 30% opacity, slightly enlarged and shifted (+40px, +50px).
- **Main graphic**: Primary focal icon — bold, filled with gradients, sized to fill ~1200–1600px tall.
- **Glow/aura layer**: Blurred duplicate behind main graphic (use feGaussianBlur in filter, opacity 0.5–0.8).
- **Detail layer**: Decorative overlays ON TOP of graphic — highlights, inner glow patches, texture marks.

### 2. GEOMETRIC FRAMING (required — pick at least one)
Surround the main graphic with structural framing:
- **Ring/arc frame**: Partial or full circle/ring centered on graphic (stroke-width 30–60px, gap at bottom for text)
- **Badge shape**: Hexagon, diamond, or shield outline framing the graphic
- **Starburst**: 8–16 rays radiating outward from behind the main graphic
- **Banner bars**: Horizontal rule bars above/below the graphic area
- **Corner marks**: Small geometric accents (chevrons, triangles, squares) at four corners

### 3. GRADIENT FILLS (required on ALL major shapes)
Never use flat solid fills on primary shapes. Use:
- Linear gradients (top→bottom or diagonal) for main graphic shapes
- Radial gradients for glow/background elements
- Multi-stop gradients (3+ stops) on complex shapes
- Ensure contrast: dark to bright, not same-hue to same-hue

### 4. TEXTURE & DETAIL
- Add 15–30 small accent elements: stars (★), dots, small diamonds, triangles
- Include at least one repeating micro-pattern in the background (dots grid, line hatching, hex cells)
- Add highlight slashes across main graphic (white fill, 10–15% opacity, diagonal rectangle)
- Include a drop shadow on the main graphic using SVG filter

### 5. COLOR STRATEGY
- Use 2–3 strong brand colors + black + white
- Primary color: vibrant (saturated, not muddy)
- Accent color: contrasting or analogous
- All elements must be readable on BOTH dark and light fabric
- Avoid: flat grey, pastels on dark bg, colors too similar to each other

## SVG RULES
- Use ONLY native SVG elements: rect, circle, ellipse, line, polyline, polygon, path, g, defs, linearGradient, radialGradient, filter, feGaussianBlur, feDropShadow, feComposite, feMerge, use, clipPath, symbol
- NO <text> elements — text is composited separately in a different step
- NO <image> elements, NO xlink:href to external URLs, NO foreignObject
- All gradients and filters must be defined in <defs> with unique IDs
- Use transform="translate(...) rotate(...) scale(...)" for positioning
- Paths must be valid SVG path data (M, L, C, Q, Z etc.)
- Group related elements with <g id="..."> for organization
- Self-close empty elements: <circle ... />

## COMPOSITION LAYOUT for 4500×5400
- Graphic center: approximately (2250, 1600) — upper-center of canvas
- Graphic extent: icon fills roughly x=600–3800, y=200–3000
- Background elements: full canvas (0,0)→(4500,5400)
- Framing elements: centered around (2250,1600), radius 1400–1800px
- Leave y=3000→5400 mostly clear (text zone)

## RESPONSE FORMAT
Respond with ONLY the raw SVG markup. Start with <svg and end with </svg>.
No explanation. No markdown code fences. No comments outside SVG.
The SVG must be complete, valid, and render without errors.`;

async function callLLM(prompt, model = 'haiku') {
  if (!ANTHROPIC_API_KEY) throw new Error('No Anthropic API key');

  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku;

  const userMessage = buildUserPrompt(prompt);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${err}`);
  }

  const data = await response.json();
  let svg = data.content?.[0]?.text || '';

  // Clean up: strip markdown fences if present
  svg = svg.replace(/^```(?:svg|xml)?\n?/i, '').replace(/\n?```$/i, '').trim();

  // Validate it's SVG
  if (!svg.startsWith('<svg')) throw new Error('LLM did not return valid SVG');

  // Sanitize duplicate attributes
  svg = svg.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z][a-zA-Z0-9-]*(?::[a-zA-Z][a-zA-Z0-9-]*)?="[^"]*")*)\s*\/?>/g, (match, tag, attrs) => {
    if (!attrs) return match;
    const seen = new Set();
    const cleanAttrs = attrs.replace(/\s+([a-zA-Z][a-zA-Z0-9-]*(?::[a-zA-Z][a-zA-Z0-9-]*)?)="[^"]*"/g, (attrMatch, attrName) => {
      if (seen.has(attrName)) return '';
      seen.add(attrName);
      return attrMatch;
    });
    const selfClose = match.endsWith('/>') ? '/>' : '>';
    return `<${tag}${cleanAttrs}${selfClose}`;
  });

  // Ensure correct dimensions
  if (svg.includes('width=')) {
    svg = svg.replace(/width="[^"]*"/, 'width="4500"');
  } else {
    svg = svg.replace(/<svg/, '<svg width="4500"');
  }
  if (svg.includes('height=')) {
    svg = svg.replace(/height="[^"]*"/, 'height="5400"');
  } else {
    svg = svg.replace(/<svg/, '<svg height="5400"');
  }
  if (!svg.includes('viewBox')) {
    svg = svg.replace(/<svg/, '<svg viewBox="0 0 4500 5400"');
  } else {
    svg = svg.replace(/viewBox="[^"]*"/, 'viewBox="0 0 4500 5400"');
  }

  return svg;
}

function buildUserPrompt(prompt) {
  const style = detectDesignStyle(prompt);
  const colorHint = detectColorHint(prompt);
  const iconHint = detectIconHint(prompt);

  return `Create a PREMIUM t-shirt graphic for: "${prompt}"

## Required composition:
- **Style**: ${style}
- **Colors**: ${colorHint}
- **Main graphic**: ${iconHint}

## Mandatory elements checklist:
1. ✅ Background layer: ${style === 'retro' ? 'pixel grid / scanline pattern' : style === 'neon' ? 'radial glow burst + dot grid' : 'geometric burst rays OR hex pattern'} (opacity 0.08–0.15, full canvas)
2. ✅ Drop shadow under main graphic (feDropShadow or offset duplicate at 30% opacity)
3. ✅ Main graphic: ${iconHint} with GRADIENT fills (not flat color)
4. ✅ Framing element: ${style === 'minimal' ? 'clean thin ring' : 'bold ring OR starburst rays'} centered behind/around main graphic
5. ✅ Highlight overlay: diagonal white slash across main graphic (opacity 0.1–0.15)
6. ✅ Accent details: 8–16 small stars/dots/diamonds scattered around composition
7. ✅ Banner bars: two horizontal rule bars flanking graphic, ~100px tall, primary color with gradient

## Text zone:
Leave y=3000→5400 CLEAR — the word "${prompt.toUpperCase()}" will be composited here separately.

## Quality bar:
This design should look like it costs $35, not $5. Layer everything. Add depth. Make it bold and cohesive.`;
}

function detectDesignStyle(prompt) {
  const p = prompt.toLowerCase();
  if (p.match(/neon|glow|cyber|synth|rave|vaporwave|electric/)) return 'neon';
  if (p.match(/retro|arcade|pixel|8.?bit|game over|press start|insert coin/)) return 'retro';
  if (p.match(/minimal|clean|simple|elegant|mono/)) return 'minimal';
  if (p.match(/varsity|college|sport|athletic|league|team/)) return 'varsity';
  if (p.match(/street|urban|graffiti|hood|block/)) return 'street';
  if (p.match(/grunge|distress|vintage|worn|faded|punk/)) return 'distressed';
  return 'bold';
}

function detectColorHint(prompt) {
  const p = prompt.toLowerCase();
  if (p.match(/fire|flame|hot|burn|lava/)) return 'crimson red #FF2D00, ember orange #FF8C00, white highlight';
  if (p.match(/ice|frost|cold|freeze|crystal/)) return 'electric blue #00BFFF, pale cyan #E0F7FF, white';
  if (p.match(/neon|glow|cyber|electric/)) return 'neon green #39FF14, hot magenta #FF00FF, deep black';
  if (p.match(/gold|champion|king|queen|crown/)) return 'rich gold #FFD60A, amber #FF9500, white';
  if (p.match(/blood|death|kill|skull|dark/)) return 'crimson #DC143C, near-black #1A0000, bone white';
  if (p.match(/purple|royal|throne|mystic/)) return 'electric purple #BF5AF2, gold #FFD60A, white';
  if (p.match(/green|toxic|acid|poison/)) return 'toxic green #39FF14, lime #AAFF00, black';
  if (p.match(/blue|ocean|wave|aqua/)) return 'electric blue #0A84FF, cyan #64D2FF, white';
  // Derive from keywords in prompt
  const hash = Math.abs([...prompt].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
  const palettes = [
    'hot red #FF2D55, orange #FF6B35, white',
    'electric blue #0A84FF, cyan #64D2FF, white',
    'vivid purple #BF5AF2, pink #FF375F, white',
    'gold #FFD60A, amber #FF9F0A, white',
    'lime green #30D158, teal #64D2FF, white',
  ];
  return palettes[hash % palettes.length];
}

function detectIconHint(prompt) {
  const p = prompt.toLowerCase();
  if (p.match(/skull|death|dead|kill|rip|bones/)) return 'stylized skull with glowing eye sockets and ornate bone structure';
  if (p.match(/fire|flame|burn|lit/)) return 'bold flame with layered inner/outer fire tongues';
  if (p.match(/lightning|bolt|electric|thunder|zap/)) return 'jagged lightning bolt with energy discharge radiating outward';
  if (p.match(/shield|defend|tank|armor|guard/)) return 'heraldic shield with inner emblem, bold outline';
  if (p.match(/sword|blade|slash|weapon/)) return 'sword or crossed swords with detailed hilt and blade sheen';
  if (p.match(/dragon|beast|creature|monster/)) return 'fierce dragon head with scales, horns, and fire breath';
  if (p.match(/crown|king|queen|royal|throne/)) return 'ornate crown with jewel highlights and radiating gold beams';
  if (p.match(/wolf|bear|lion|eagle|fox|hawk/)) {
    const animal = p.match(/wolf|bear|lion|eagle|fox|hawk/)[0];
    return `fierce ${animal} head/bust in profile with bold stylization`;
  }
  if (p.match(/crosshair|scope|aim|sniper|headshot/)) return 'tactical crosshair scope with concentric rings and precision marks';
  if (p.match(/controller|gamepad|gamer|console/)) return 'sleek gaming controller with button highlights and analog sticks';
  if (p.match(/star|galaxy|space|cosmic|universe/)) return 'radiant star cluster or cosmic nebula with light rays';
  if (p.match(/diamond|gem|crystal|jewel/)) return 'faceted diamond with light refraction lines and sparkles';
  // Generic fallback: use the main noun from the prompt
  const words = prompt.split(/\s+/).filter(w => w.length > 3);
  const keyword = words[words.length - 1] || words[0] || 'bold emblem';
  return `dramatic, stylized ${keyword} graphic with strong silhouette and layered detail`;
}

// ── Color detection (for text compositing) ────────────────────────────────────
const COLOR_MAP = {
  red: '#FF2D55', blue: '#0A84FF', green: '#30D158', gold: '#FFD60A',
  pink: '#FF375F', purple: '#BF5AF2', orange: '#FF9F0A', cyan: '#64D2FF',
  neon: '#39FF14', white: '#FFFFFF', yellow: '#FFD60A',
};

const PALETTES = {
  fire: ['#FF2D00', '#FF8C00'], ice: ['#00BFFF', '#E0F7FF'],
  neon: ['#39FF14', '#FF00FF'], gold: ['#FFD60A', '#FFA000'],
  blood: ['#DC143C', '#8B0000'], cyber: ['#00FFFF', '#FF00FF'],
  toxic: ['#39FF14', '#AAFF00'], royal: ['#BF5AF2', '#FFD60A'],
};

const DEFAULT_PALETTES = [
  ['#FF2D55', '#FF6B35'], ['#0A84FF', '#64D2FF'], ['#BF5AF2', '#FF375F'],
  ['#FFD60A', '#FF9F0A'], ['#30D158', '#64D2FF'], ['#FF2D55', '#BF5AF2'],
];

function getColors(prompt) {
  const p = prompt.toLowerCase();
  let primary = null;
  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (p.includes(name)) { primary = hex; break; }
  }
  for (const [name, pal] of Object.entries(PALETTES)) {
    if (p.includes(name)) return { primary: primary || pal[0], accent: pal[1] };
  }
  if (primary) return { primary, accent: primary };
  const hash = Math.abs([...prompt].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
  const def = DEFAULT_PALETTES[hash % DEFAULT_PALETTES.length];
  return { primary: def[0], accent: def[1] };
}

// ── Text compositing ──────────────────────────────────────────────────────────
function compositeText(text, colors) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const words = text.toUpperCase();
  const lines = splitText(words, 14);

  // Size text to fit
  let fontSize = 580;
  while (fontSize > 120) {
    ctx.font = `900 ${fontSize}px Impact`;
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (widest <= W * 0.82) break;
    fontSize -= 20;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Text center: lower portion of canvas
  const textCenterY = H * 0.80;
  const lineHeight = fontSize * 1.18;
  const totalTextH = (lines.length - 1) * lineHeight;
  const startY = textCenterY - totalTextH / 2;

  // Optional: accent bar above text
  if (lines.length > 0) {
    const barY = startY - fontSize * 0.75;
    const barW = Math.min(W * 0.6, 2400);
    ctx.save();
    const barGrad = ctx.createLinearGradient(CX - barW / 2, 0, CX + barW / 2, 0);
    barGrad.addColorStop(0, 'transparent');
    barGrad.addColorStop(0.2, colors.primary + 'CC');
    barGrad.addColorStop(0.8, colors.accent + 'CC');
    barGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = barGrad;
    ctx.fillRect(CX - barW / 2, barY, barW, 12);
    ctx.restore();
  }

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    const line = lines[i];

    // Far shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.fillText(line, CX + 18, y + 22);
    ctx.restore();

    // Glow layer
    ctx.save();
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = 60;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = colors.primary;
    ctx.fillText(line, CX, y);
    ctx.restore();

    // Heavy black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = fontSize * 0.10;
    ctx.lineJoin = 'round';
    ctx.strokeText(line, CX, y);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, y - fontSize * 0.55, 0, y + fontSize * 0.55);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.3, colors.primary);
    grad.addColorStop(1, colors.accent);
    ctx.fillStyle = grad;
    ctx.fillText(line, CX, y);

    // Highlight slash
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(CX - W * 0.4, y - fontSize * 0.52, W * 0.8, fontSize * 0.25);
    ctx.restore();
  }

  // Accent bar below text
  if (lines.length > 0) {
    const lastY = startY + (lines.length - 1) * lineHeight;
    const barY = lastY + fontSize * 0.72;
    const barW = Math.min(W * 0.6, 2400);
    ctx.save();
    const barGrad = ctx.createLinearGradient(CX - barW / 2, 0, CX + barW / 2, 0);
    barGrad.addColorStop(0, 'transparent');
    barGrad.addColorStop(0.2, colors.accent + 'CC');
    barGrad.addColorStop(0.8, colors.primary + 'CC');
    barGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = barGrad;
    ctx.fillRect(CX - barW / 2, barY, barW, 12);
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}

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

/**
 * Generate a design using LLM for graphics + canvas for text
 * @param {string} prompt - Design prompt
 * @param {string} model - Brain level: 'haiku', 'sonnet', 'opus'
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generateDesignLLM(prompt, model = 'haiku') {
  const colors = getColors(prompt);

  // Ask LLM to generate SVG graphics
  const svg = await callLLM(prompt, model);

  // Render SVG to PNG via sharp
  const svgBuffer = Buffer.from(svg);
  const graphicPng = await sharp(svgBuffer)
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Generate text overlay
  const textPng = compositeText(prompt, colors);

  // Composite: graphic on bottom, text on top
  const final = await sharp(graphicPng)
    .composite([{ input: textPng, blend: 'over' }])
    .png()
    .toBuffer();

  return final;
}
