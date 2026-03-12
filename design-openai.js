// design-openai.js — DALL-E 3 powered design generation
// Uses OpenAI's image API to generate the graphic, then composites text via canvas

import sharp from 'sharp';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const W = 4500, H = 5400;
const CX = W / 2;

// Register Impact font
try {
  GlobalFonts.registerFromPath(path.join(__dirname, 'fonts', 'Impact.ttf'), 'Impact');
} catch (_) {}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ── DALL-E 3 prompt builder ───────────────────────────────────────────────────
function buildDallePrompt(userPrompt) {
  const style = detectStyle(userPrompt);
  const colorHint = detectColorHint(userPrompt);

  return `Professional t-shirt graphic design for: "${userPrompt}".

Style: ${style}. Colors: ${colorHint}.

Requirements:
- CENTERED composition, portrait orientation
- Bold, graphic illustration with strong silhouette — NOT clipart or stock vector
- Layered visual depth: background geometric elements, central focal graphic, decorative details
- Radial burst / starburst rays behind main graphic
- Ring or circular frame around central element
- Small accent details (stars, dots, geometric marks) scattered around
- The bottom 35% should be mostly empty space (for text overlay)
- NO text or lettering anywhere in the image
- White or very light neutral background so design works on t-shirts
- Print-ready, bold, premium streetwear/gaming aesthetic
- Sharp edges, high contrast, suitable for screen printing

Do NOT include any text, words, or letters. The design is purely visual/graphic.`;
}

function detectStyle(prompt) {
  const p = prompt.toLowerCase();
  if (p.match(/neon|glow|cyber|synth|rave/)) return 'cyberpunk neon glow synthwave';
  if (p.match(/retro|arcade|pixel|8.?bit/)) return 'retro arcade pixel art';
  if (p.match(/minimal|clean|simple/)) return 'minimal clean modern';
  if (p.match(/varsity|college|sport/)) return 'varsity collegiate athletic';
  if (p.match(/grunge|distress|vintage|punk/)) return 'grunge distressed vintage';
  if (p.match(/fire|flame|burn/)) return 'bold fire energy streetwear';
  if (p.match(/skull|death|dark/)) return 'dark gothic dramatic';
  return 'bold premium streetwear gaming';
}

function detectColorHint(prompt) {
  const p = prompt.toLowerCase();
  if (p.match(/fire|flame|hot|burn/)) return 'red, orange, amber on dark';
  if (p.match(/ice|frost|cold/)) return 'electric blue, cyan, white on dark';
  if (p.match(/neon|cyber|electric/)) return 'neon green, hot pink, cyan on black';
  if (p.match(/gold|champion|king/)) return 'rich gold, amber, white';
  if (p.match(/blood|skull|death|dark/)) return 'crimson, black, bone white';
  if (p.match(/purple|royal/)) return 'electric purple, gold, white';
  if (p.match(/green|toxic|acid/)) return 'toxic green, lime, black';
  const hash = Math.abs([...prompt].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
  const palettes = [
    'hot red, orange, white on light',
    'electric blue, cyan, white',
    'vivid purple, pink, white',
    'gold, amber, white',
    'lime green, teal, white',
  ];
  return palettes[hash % palettes.length];
}

// ── DALL-E API call ───────────────────────────────────────────────────────────
async function callDalle(prompt) {
  if (!OPENAI_API_KEY) throw new Error('No OpenAI API key configured');

  const dallePrompt = buildDallePrompt(prompt);

  const body = JSON.stringify({
    model: 'dall-e-3',
    prompt: dallePrompt,
    n: 1,
    size: '1024x1792',   // portrait — best for t-shirt designs
    quality: 'hd',
    response_format: 'url',
  });

  const imageUrl = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(`DALL-E API: ${json.error.message}`));
          else resolve(json.data?.[0]?.url);
        } catch (e) {
          reject(new Error('Failed to parse DALL-E response: ' + data.slice(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (!imageUrl) throw new Error('DALL-E returned no image URL');
  return imageUrl;
}

// ── Download image ────────────────────────────────────────────────────────────
async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        downloadImage(res.headers.location).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

// ── Color helpers (for text) ──────────────────────────────────────────────────
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
  const lines = splitText(words, 13);

  let fontSize = 560;
  while (fontSize > 120) {
    ctx.font = `900 ${fontSize}px Impact`;
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (widest <= W * 0.82) break;
    fontSize -= 20;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const textCenterY = H * 0.81;
  const lineHeight = fontSize * 1.18;
  const totalTextH = (lines.length - 1) * lineHeight;
  const startY = textCenterY - totalTextH / 2;

  // Top accent bar
  const barW = Math.min(W * 0.65, 2600);
  const topBarY = startY - fontSize * 0.78;
  const topGrad = ctx.createLinearGradient(CX - barW / 2, 0, CX + barW / 2, 0);
  topGrad.addColorStop(0, 'transparent');
  topGrad.addColorStop(0.2, colors.primary + 'BB');
  topGrad.addColorStop(0.8, colors.accent + 'BB');
  topGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = topGrad;
  ctx.fillRect(CX - barW / 2, topBarY, barW, 14);

  for (let i = 0; i < lines.length; i++) {
    const y = startY + i * lineHeight;
    const line = lines[i];

    // Far drop shadow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.font = `900 ${fontSize}px Impact`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(line, CX + 22, y + 28);
    ctx.restore();

    // Glow
    ctx.save();
    ctx.shadowColor = colors.primary;
    ctx.shadowBlur = 90;
    ctx.globalAlpha = 0.4;
    ctx.font = `900 ${fontSize}px Impact`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.primary;
    ctx.fillText(line, CX, y);
    ctx.restore();

    // Heavy black outline
    ctx.font = `900 ${fontSize}px Impact`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = fontSize * 0.11;
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
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(CX - W * 0.38, y - fontSize * 0.52, W * 0.76, fontSize * 0.26);
    ctx.restore();
  }

  // Bottom accent bar
  const lastY = startY + (lines.length - 1) * lineHeight;
  const botBarY = lastY + fontSize * 0.74;
  const botGrad = ctx.createLinearGradient(CX - barW / 2, 0, CX + barW / 2, 0);
  botGrad.addColorStop(0, 'transparent');
  botGrad.addColorStop(0.2, colors.accent + 'BB');
  botGrad.addColorStop(0.8, colors.primary + 'BB');
  botGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = botGrad;
  ctx.fillRect(CX - barW / 2, botBarY, barW, 14);

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
 * Generate a design using DALL-E 3 for graphics + canvas for text
 * @param {string} prompt - Design prompt
 * @returns {Promise<Buffer>} PNG buffer
 */
export async function generateDesignDALLE(prompt) {
  const colors = getColors(prompt);

  // Generate image via DALL-E 3
  const imageUrl = await callDalle(prompt);

  // Download the generated image
  const imageBuffer = await downloadImage(imageUrl);

  // Scale up to our 4500×5400 canvas, fit in the upper 65% area
  // DALL-E gives 1024×1792 (portrait), scale to fit W×(H*0.65) = 4500×3510
  const graphicPng = await sharp(imageBuffer)
    .resize(W, Math.round(H * 0.7), {
      fit: 'cover',
      position: 'top',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();

  // Create full-canvas image (white background, graphic on top)
  const fullCanvas = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 255 } }
  })
    .composite([{ input: graphicPng, top: 0, left: 0 }])
    .png()
    .toBuffer();

  // Generate text overlay
  const textPng = compositeText(prompt, colors);

  // Composite text over image
  const final = await sharp(fullCanvas)
    .composite([{ input: textPng, blend: 'over' }])
    .png()
    .toBuffer();

  return final;
}
