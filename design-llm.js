// design-llm.js — LLM-powered design generation via Anthropic API
// Asks Haiku to generate SVG, renders to PNG, composites text via canvas

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
  haiku: 'claude-3-5-haiku-20241022',
  sonnet: 'claude-3-7-sonnet-20250219',
  opus: 'claude-3-5-sonnet-20241022',
};

const SYSTEM_PROMPT = `You are a professional t-shirt graphic designer. Generate SVG markup for print-on-demand designs.

RULES:
- Canvas: 4500x5400 pixels (standard t-shirt print area, portrait orientation)
- Background: TRANSPARENT (no background rect). The design prints on fabric.
- Use ONLY SVG elements: rect, circle, ellipse, line, polyline, polygon, path, g, defs, linearGradient, radialGradient, filter, use, clipPath
- DO NOT use <text> elements. Text will be composited separately.
- DO NOT use <image>, <foreignObject>, xlink:href, or external resources
- Focus on GRAPHIC ELEMENTS: icons, patterns, shapes, borders, effects, decorations
- Design should occupy the CENTER of the canvas with good margins (at least 500px on each side)
- The graphic should fill roughly the top 60% of the canvas (text goes in the bottom 40%)
- Use bold, vibrant colors suitable for print
- Include drop shadows, gradients, and visual depth where appropriate
- Make designs that look PREMIUM, not clipart
- Keep SVG clean and valid

RESPOND WITH ONLY THE SVG MARKUP. No explanation, no markdown code fences, just raw SVG starting with <svg and ending with </svg>.`;

async function callLLM(prompt, model = 'haiku') {
  if (!ANTHROPIC_API_KEY) throw new Error('No Anthropic API key');

  const modelId = MODEL_MAP[model] || MODEL_MAP.haiku;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Design a t-shirt graphic for: "${prompt}"

The design should be bold, eye-catching, and suitable for a gaming/streetwear audience. Think about what would actually sell on a t-shirt — not just an icon, but a composed design with visual impact. Include decorative elements, borders, effects, or patterns that make it feel like a real product.

Remember: NO <text> elements. Generate only the graphic/visual elements. Text will be added separately.`
      }],
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

  // Ensure dimensions
  if (!svg.includes('width="4500"')) {
    svg = svg.replace(/<svg/, '<svg width="4500" height="5400" viewBox="0 0 4500 5400"');
  }

  return svg;
}

function compositeText(pngBuffer, text, colors) {
  // Create a canvas, draw the rendered SVG as background, then add text
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // We'll composite text onto the PNG using sharp instead
  // Create a text-only canvas
  ctx.clearRect(0, 0, W, H);

  const words = text.toUpperCase();
  const lines = splitText(words, 14);
  const maxSize = 550;
  let fontSize = maxSize;

  // Size text to fit
  while (fontSize > 120) {
    ctx.font = `900 ${fontSize}px Impact`;
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (widest <= W * 0.85) break;
    fontSize -= 20;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Position text in bottom 35% of canvas
  const textCenterY = H * 0.78;
  const lineHeight = fontSize * 1.15;
  const startY = textCenterY - ((lines.length - 1) * lineHeight) / 2;

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    const line = lines[i];

    // Black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = fontSize * 0.08;
    ctx.lineJoin = 'round';
    ctx.strokeText(line, CX, y);

    // Color fill (use primary color or gradient)
    if (colors) {
      const grad = ctx.createLinearGradient(0, y - fontSize/2, 0, y + fontSize/2);
      grad.addColorStop(0, colors.primary || '#FFFFFF');
      grad.addColorStop(1, colors.accent || colors.primary || '#FFFFFF');
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.fillText(line, CX, y);
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

// Color detection (reused from template system)
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

/**
 * Generate a design using LLM for graphics + canvas for text
 * @param {string} prompt - Design prompt
 * @param {string} model - Brain level: 'haiku', 'sonnet', 'opus'
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generateDesignLLM(prompt, model = 'haiku') {
  // Get colors for text
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
  const textPng = compositeText(null, prompt, colors);

  // Composite: graphic on bottom, text on top
  const final = await sharp(graphicPng)
    .composite([{ input: textPng, blend: 'over' }])
    .png()
    .toBuffer();

  return final;
}
