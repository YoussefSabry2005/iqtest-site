// SVG rendering for visual items. Shared by the static builder and the browser.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export { esc };

function shape(kind, cx, cy, s, fill, pid) {
  const f = fill === 'solid' ? 'currentColor' : fill === 'striped' ? `url(#${pid})` : 'none';
  const common = `fill="${f}" stroke="currentColor" stroke-width="2"`;
  switch (kind) {
    case 'circle': return `<circle cx="${cx}" cy="${cy}" r="${s / 2}" ${common}/>`;
    case 'square': return `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" ${common}/>`;
    case 'triangle': return `<polygon points="${cx},${cy - s / 2} ${cx + s / 2},${cy + s / 2} ${cx - s / 2},${cy + s / 2}" ${common}/>`;
    case 'diamond': return `<polygon points="${cx},${cy - s / 2} ${cx + s / 2},${cy} ${cx},${cy + s / 2} ${cx - s / 2},${cy}" ${common}/>`;
  }
  return '';
}

let uid = 0;
export function tile(cell, size = 72) {
  const pid = `st${++uid}`;
  const n = cell.count;
  const s = n === 1 ? size * 0.42 : n === 2 ? size * 0.32 : size * 0.26;
  const xs = n === 1 ? [size / 2] : n === 2 ? [size * 0.3, size * 0.7] : [size * 0.2, size * 0.5, size * 0.8];
  const label = `${n} ${cell.fill} ${cell.shape}${n > 1 ? 's' : ''}`;
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label)}"><defs><pattern id="${pid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2"/></pattern></defs>${xs.map((x) => shape(cell.shape, x, size / 2, s, cell.fill, pid)).join('')}</svg>`;
}

export function matrixGrid(cells, size = 72) {
  const out = cells.map((c) => `<div class="mx-cell">${tile(c, size)}</div>`);
  out.push(`<div class="mx-cell mx-missing" aria-label="missing tile">?</div>`);
  return `<div class="mx-grid" role="group" aria-label="3 by 3 grid of shapes with the last tile missing">${out.join('')}</div>`;
}

export function poly(cells, unit = 16, label = 'shape') {
  const w = Math.max(...cells.map((c) => c[0])) + 1;
  const h = Math.max(...cells.map((c) => c[1])) + 1;
  const pad = 4;
  const rects = cells.map(([x, y]) => `<rect x="${pad + x * unit}" y="${pad + y * unit}" width="${unit}" height="${unit}" fill="currentColor" stroke="var(--bg, #fff)" stroke-width="1.5"/>`).join('');
  return `<svg viewBox="0 0 ${w * unit + pad * 2} ${h * unit + pad * 2}" width="${w * unit + pad * 2}" height="${h * unit + pad * 2}" role="img" aria-label="${esc(label)}">${rects}</svg>`;
}

// Option label for screen readers / text contexts.
export function optionHtml(item, opt, i) {
  if (item.render === 'matrix') return tile(opt);
  if (item.render === 'shape') return poly(opt, 18, `option ${String.fromCharCode(65 + i)}`);
  return esc(opt);
}

export function stemHtml(item) {
  const lines = item.stem.split('\n').map((l) => `<p>${esc(l)}</p>`).join('');
  if (item.render === 'matrix') return `${lines}${matrixGrid(item.visual.cells)}`;
  if (item.render === 'shape') return `${lines}<div class="target">${poly(item.visual.target, 26, 'original shape')}</div>`;
  return lines;
}
