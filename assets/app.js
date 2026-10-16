// Browser app: test runner, practice mode, local scoring, sharing, analytics.
import { estimateAbility, report, recommend } from './irt.js';
import { stemHtml, optionHtml, esc } from './render.js';
import { assembleTest } from './assemble.js';

const CFG = JSON.parse(document.getElementById('cfg')?.textContent || '{}');
const BASE = CFG.basePath || '';

// ---------------------------------------------------------------- analytics (cookieless)
const sid = Math.random().toString(36).slice(2); // per page-load only, never stored
function beacon(event, data = {}) {
  if (!CFG.collectorUrl) return;
  const body = JSON.stringify({ site: 'iq', event, path: location.pathname, ref: document.referrer ? new URL(document.referrer).hostname : '', sid, ...data });
  try {
    if (!navigator.sendBeacon?.(`${CFG.collectorUrl}/a/collect`, new Blob([body], { type: 'text/plain' }))) fetch(`${CFG.collectorUrl}/a/collect`, { method: 'POST', body, keepalive: true, mode: 'no-cors' });
  } catch { /* analytics must never break the page */ }
}
window.addEventListener('error', (e) => beacon('error', { msg: String(e.message).slice(0, 200), src: String(e.filename || '').slice(-80), line: e.lineno }));
beacon('pageview');

const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

async function loadJson(p) {
  const r = await fetch(`${BASE}${p}`, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${p}: ${r.status}`);
  return r.json();
}

// ---------------------------------------------------------------- test runner
async function runTest(root) {
  const [bank, norms] = await Promise.all([loadJson('/data/bank.json'), loadJson('/data/norms.json').catch(() => ({ n: 0 }))]);
  const seen = new Set(store.get('seen', []));
  const items = assembleTest(bank, seen);
  const answers = new Array(items.length).fill(null);
  const times = new Array(items.length).fill(0);
  let i = 0;
  let shownAt = 0;
  const deadline = Date.now() + (CFG.minutes || 25) * 60_000;
  beacon('test_start', { n: items.length });

  const timerEl = document.getElementById('timer');
  const tick = setInterval(() => {
    const left = Math.max(0, deadline - Date.now());
    if (timerEl) timerEl.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;
    if (!left) finish();
  }, 1000);

  function show() {
    shownAt = Date.now();
    const it = items[i];
    root.innerHTML = `
      <div class="q-head"><span>Question ${i + 1} of ${items.length}</span><progress max="${items.length}" value="${i}" aria-label="Progress"></progress></div>
      <div class="q-stem" id="q-stem">${stemHtml(it)}</div>
      <fieldset class="q-options ${it.render !== 'text' ? 'visual' : ''}" aria-labelledby="q-stem">
        <legend class="visually-hidden">Choose an answer</legend>
        ${it.options.map((o, k) => `<label class="opt${answers[i] === k ? ' chosen' : ''}"><input type="radio" name="opt" value="${k}" ${answers[i] === k ? 'checked' : ''}><span class="opt-letter" aria-hidden="true">${String.fromCharCode(65 + k)}</span><span class="opt-body">${optionHtml(it, o, k)}</span></label>`).join('')}
      </fieldset>
      <div class="q-nav">
        <button type="button" class="btn ghost" id="prev" ${i === 0 ? 'disabled' : ''}>Back</button>
        <button type="button" class="btn ghost" id="skip">Skip</button>
        <button type="button" class="btn" id="next" ${answers[i] === null ? 'disabled' : ''}>${i === items.length - 1 ? 'Finish' : 'Next'}</button>
      </div>`;
    root.querySelectorAll('input[name=opt]').forEach((el) => el.addEventListener('change', () => {
      answers[i] = Number(el.value);
      root.querySelectorAll('.opt').forEach((l) => l.classList.toggle('chosen', l.contains(el)));
      root.querySelector('#next').disabled = false;
    }));
    root.querySelector('#prev').onclick = () => move(-1);
    root.querySelector('#skip').onclick = () => move(1, true);
    root.querySelector('#next').onclick = () => move(1);
    root.querySelector('.q-stem').focus?.();
  }
  function move(d, skip = false) {
    times[i] += Date.now() - shownAt;
    if (skip) answers[i] = answers[i] ?? null;
    if (i + d >= items.length) return finish();
    i = Math.max(0, i + d);
    show();
  }
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    clearInterval(tick);
    if (timerEl) timerEl.textContent = 'done';
    if (shownAt) times[i] += Date.now() - shownAt;
    const responses = items.map((it, k) => ({ id: it.id, b: it.difficulty, skill: it.skill, correct: answers[k] === it.answer, answered: answers[k] !== null, ms: times[k] }));
    const { theta, se } = estimateAbility(responses);
    const rep = report(theta, se, norms);
    for (const r of responses) if (r.answered) beacon('item', { item: r.id, c: r.correct ? 1 : 0, ms: Math.min(r.ms, 600000) });
    beacon('test_complete', { theta: Math.round(theta * 100) / 100, correct: responses.filter((r) => r.correct).length });
    store.set('seen', [...new Set([...seen, ...items.map((x) => x.id)])].slice(-400));
    store.set('last', { at: Date.now(), ...rep });
    renderResult(root, { items, answers, responses, theta, rep });
  }
  show();
}

const SKILL_NAMES = CFG.skills || {};

function renderResult(root, { items, answers, responses, theta, rep }) {
  const recs = recommend(responses, theta).slice(0, 2);
  const correct = responses.filter((r) => r.correct).length;
  const band = Math.max(70, Math.min(145, Math.round(rep.index / 5) * 5));
  const shareUrl = `${CFG.baseUrl}/share/${band}/`;
  const shareText = `I scored around ${rep.index} on the ${CFG.brand} reasoning test. Can you beat it?`;
  const bySkill = {};
  for (const r of responses) { bySkill[r.skill] ??= { c: 0, n: 0 }; bySkill[r.skill].n++; if (r.correct) bySkill[r.skill].c++; }
  root.innerHTML = `
    <section class="result">
      <p class="eyebrow">Your result</p>
      <h1 class="score">${rep.index}<small> Reasoning Index</small></h1>
      <p>Likely range <strong>${rep.band[0]}–${rep.band[1]}</strong> (95% confidence) · ${rep.provisional ? 'percentile available once norms are established' : `higher than about <strong>${rep.percentile}%</strong> of ${rep.sample.toLocaleString()} people who took this test`} · ${correct}/${items.length} correct</p>
      ${rep.provisional ? `<p class="notice">Provisional score: we're still collecting results to set the norms (${rep.sample.toLocaleString()} of ${(500).toLocaleString()} needed). Until then, the scale assumes a standard distribution.</p>` : ''}
      <p class="disclaimer">This is a free practice test of reasoning skills, not a clinical or professionally administered IQ test. Scores vary from test to test; treat it as a guide, not a diagnosis. <a href="${BASE}/methodology/">How scoring works</a></p>
      <div class="share">
        <button class="btn" type="button" id="share-btn">Share result</button>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}">Post on X</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}">Facebook</a>
        <a class="btn ghost" target="_blank" rel="noopener" href="https://www.reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareText)}">Reddit</a>
      </div>
      <h2>By skill</h2>
      <ul class="skills">${Object.entries(bySkill).map(([s, v]) => `<li><span>${esc(SKILL_NAMES[s] || s)}</span><meter min="0" max="${v.n}" value="${v.c}">${v.c}/${v.n}</meter><span>${v.c}/${v.n}</span></li>`).join('')}</ul>
      <h2>What to practise next</h2>
      <ul class="recs">${recs.map((r) => `<li><a href="${BASE}/practice/${r.skill}/">${esc(SKILL_NAMES[r.skill] || r.skill)} practice</a> · <a href="${BASE}/guides/${r.skill}/">how to solve these</a> <span class="meta">(${Math.round(r.accuracy * 100)}% correct here)</span></li>`).join('')}</ul>
      <div class="ad-slot" data-slot="result"></div>
      <h2>Review your answers</h2>
      <ol class="review">${items.map((it, k) => `<li class="${answers[k] === it.answer ? 'right' : 'wrong'}"><details><summary>${answers[k] === it.answer ? '✓' : '✗'} ${esc(it.stem.split('\n')[0])}</summary><div class="q-stem">${stemHtml(it)}</div><p>Correct answer: <strong>${String.fromCharCode(65 + it.answer)}</strong>${answers[k] === null ? ' (you skipped this)' : answers[k] !== it.answer ? ` · you chose ${String.fromCharCode(65 + answers[k])}` : ''}</p><div class="q-options mini ${it.render !== 'text' ? 'visual' : ''}">${it.options.map((o, j) => `<div class="opt${j === it.answer ? ' chosen' : ''}"><span class="opt-letter">${String.fromCharCode(65 + j)}</span><span class="opt-body">${optionHtml(it, o, j)}</span></div>`).join('')}</div><p class="expl">${esc(it.explanation)}</p></details></li>`).join('')}</ol>
      <p><a class="btn" href="${BASE}/test/">Take a different test</a></p>
    </section>`;
  root.querySelector('#share-btn').onclick = async () => {
    beacon('share', { band });
    if (navigator.share) { try { await navigator.share({ title: CFG.brand, text: shareText, url: shareUrl }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(`${shareText} ${shareUrl}`);
    root.querySelector('#share-btn').textContent = 'Link copied';
  };
  fillAds();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- practice mode
async function runPractice(root) {
  const skill = root.dataset.skill;
  const bank = (await loadJson('/data/bank.json')).filter((x) => x.skill === skill);
  let order = bank.map((_, k) => k).sort(() => Math.random() - 0.5);
  let k = 0;
  let streak = 0;
  function show() {
    if (k >= order.length) { order = order.sort(() => Math.random() - 0.5); k = 0; }
    const it = bank[order[k]];
    root.innerHTML = `<div class="q-stem" id="p-stem">${stemHtml(it)}</div>
      <div class="q-options ${it.render !== 'text' ? 'visual' : ''}" role="group" aria-labelledby="p-stem">${it.options.map((o, j) => `<button type="button" class="opt" data-k="${j}"><span class="opt-letter" aria-hidden="true">${String.fromCharCode(65 + j)}</span><span class="opt-body">${optionHtml(it, o, j)}</span></button>`).join('')}</div>
      <div id="fb" role="status" aria-live="polite"></div>`;
    root.querySelectorAll('button.opt').forEach((b) => b.onclick = () => {
      const j = Number(b.dataset.k);
      const ok = j === it.answer;
      streak = ok ? streak + 1 : 0;
      beacon('practice', { item: it.id, c: ok ? 1 : 0 });
      root.querySelectorAll('button.opt').forEach((x) => { x.disabled = true; if (Number(x.dataset.k) === it.answer) x.classList.add('chosen'); });
      root.querySelector('#fb').innerHTML = `<p class="${ok ? 'good' : 'bad'}"><strong>${ok ? 'Correct!' : 'Not quite.'}</strong> ${esc(it.explanation)}</p><p class="meta">Streak: ${streak}</p><button class="btn" type="button" id="nx">Next puzzle</button>`;
      root.querySelector('#nx').onclick = () => { k++; show(); };
    });
  }
  show();
}

// ---------------------------------------------------------------- ads (only when configured & approved)
function fillAds() {
  if (!CFG.adsense || !window.adsbygoogle) return;
  document.querySelectorAll('.ad-slot:not(.filled)').forEach((el) => {
    const slot = CFG.adSlots?.[el.dataset.slot];
    if (!slot) return;
    el.classList.add('filled');
    el.innerHTML = `<ins class="adsbygoogle" style="display:block" data-ad-client="${CFG.adsense}" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* ignore */ }
  });
}

// ---------------------------------------------------------------- boot
const t = document.getElementById('test-app');
if (t) runTest(t).catch((e) => { t.innerHTML = '<p class="notice">Sorry, the test failed to load. Please refresh.</p>'; beacon('error', { msg: e.message }); });
const pr = document.getElementById('practice-app');
if (pr) runPractice(pr).catch((e) => beacon('error', { msg: e.message }));
fillAds();
