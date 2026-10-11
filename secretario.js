/* ARBITRA · Secretario
   Observa el historial y devuelve hallazgos (con pruebas), preguntas y una línea de fines de semana.
   Sin IA ni servicios externos: reglas explícitas, con umbrales mínimos de datos.
   Principio: describe lo que se repite o cambia; NUNCA atribuye causas. */
(function (root) {
  const DOW = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const DN = { dom: 'domingo', sáb: 'sábado', lun: 'lunes', mar: 'martes', 'mié': 'miércoles', jue: 'jueves', vie: 'viernes' };
  const RANK = { Desarrollo: 0, G2: 1, G1: 2 };
  const parse = d => new Date(d + 'T12:00:00Z'), iso = t => t.toISOString().slice(0, 10);
  const addDays = (d, k) => { const t = parse(d); t.setUTCDate(t.getUTCDate() + k); return iso(t); };
  const dow = d => parse(d).getUTCDay();
  const wkKey = d => { const w = dow(d); return w === 6 ? d : w === 0 ? addDays(d, -1) : null; };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const f1 = x => x.toFixed(1).replace('.', ',');
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const lc = s => String(s || '').toLowerCase();
  const fdm = d => { const t = parse(d); return t.getUTCDate() + '/' + (t.getUTCMonth() + 1); };
  const rel = (me, g) => (me in RANK && g in RANK) ? (RANK[g] === RANK[me] ? 'tu mismo grupo' : RANK[g] > RANK[me] ? 'un grupo superior' : 'un grupo inferior') : null;
  const known = g => g && g !== '?';
  const tok = r => `${DOW[dow(r.date)]}|${r.cat}|${r.role}|${r.format === '3x3' ? '3x3' : ''}`;
  const order = ['atencion', 'patron', 'cambio', 'repeticion', 'logro', 'info'];

  function weekends(records) {
    const wk = {};
    records.filter(r => r.cat && r.role && wkKey(r.date)).forEach(r => { (wk[wkKey(r.date)] = wk[wkKey(r.date)] || []).push(r); });
    const ord = r => ({ 6: 0, 0: 1 }[dow(r.date)] ?? 2);
    Object.keys(wk).forEach(k => wk[k].sort((a, b) => ord(a) - ord(b) || tok(a).localeCompare(tok(b)) || a.date.localeCompare(b.date)));
    return wk;
  }
  const sig = (wk, k) => wk[k].map(tok).join(' + ');
  const runLen = (wk, from) => { let L = 1, k = from; while (wk[addDays(k, -7)] && sig(wk, addDays(k, -7)) === sig(wk, from)) { L++; k = addDays(k, -7); } return L; };

  function describeLine(items, L, me) {
    const first = items[0], d = DOW[dow(first.date)];
    const names = items.map(r => (r.partner || '').trim() || 'compañero sin anotar');
    const groups = items.map(r => known(r.group) ? r.group : null);
    const sameName = new Set(names.map(norm)).size === 1 && names[0] !== 'compañero sin anotar';
    const join = a => a.length === 2 ? a.join(' y ') : a.join(', ');
    let t = `${cap(DN[d])}: ${first.cat} como ${lc(first.role)}, ${sameName ? 'siempre con ' + names[0] : 'con ' + join(names) + ' (personas distintas)'}`;
    if (groups.every(Boolean)) {
      const u = [...new Set(groups)], rr = u.length === 1 ? rel(me, u[0]) : null;
      t += u.length === 1 ? ` · ${u[0]}${rr ? ', ' + rr : ''}` : ` · grupos: ${groups.join(', ')}`;
    } else if (groups.some(Boolean)) t += ' · grupo conocido solo en parte';
    const gen = [...new Set(items.map(r => r.gender).filter(Boolean))];
    if (gen.length > 1) t += ` · género: ${gen.map(g => g === 'F' ? 'femenino' : 'masculino').join(' / ')}`;
    return t + '.';
  }

  function structure(records, me) {
    const wk = weekends(records), keys = Object.keys(wk).sort(), out = [], qs = [];
    if (!keys.length) return { out, qs, timeline: [] };
    const latest = keys.at(-1), L = runLen(wk, latest), prev = addDays(latest, -7);
    const mk = ks => ks.map(k => wk[k]);
    if (L >= 2) {
      const ks = []; for (let i = L - 1; i >= 0; i--) ks.push(addDays(latest, -7 * i));
      const cols = mk(ks), n = cols[0].length, lines = [];
      for (let i = 0; i < n; i++) lines.push(describeLine(cols.map(c => c[i]), L, me));
      const slots = cols[cols.length - 1].map(r => `${cap(DN[DOW[dow(r.date)]])}: ${r.cat} como ${lc(r.role)}`).join('. ') + '.';
      out.push({
        id: `estructura|${sig(wk, latest)}|${L}`, level: L >= 3 ? 'patron' : 'repeticion',
        headline: L === 2 ? 'Tus últimos 2 fines de semana han sido iguales' : `Llevas ${L} fines de semana seguidos con la misma estructura`,
        short: slots, evidence: lines,
        detail: L === 2 ? 'Dos semanas pueden ser casualidad. Si se repite una tercera vez lo marcaré como patrón. No tengo datos para saber el motivo.' : 'Se mantiene en el tiempo. Mis datos no explican el motivo; solo que no es una coincidencia puntual.',
        action: null
      });
      cols.flat().forEach(r => { const nm = (r.partner || '').trim(); if (nm && !r.group) qs.push(nm); });
    } else if (wk[prev]) {
      const R = runLen(wk, prev);
      if (R >= 3) out.push({
        id: `cambio|${sig(wk, prev)}|${latest}`, level: 'cambio', headline: 'Se ha roto una estructura que se repetía',
        short: `Durante ${R} fines de semana: ${wk[prev].map(r => `${DN[DOW[dow(r.date)]]} ${r.cat} (${lc(r.role)})`).join(', ')}. Este fin de semana es distinto.`,
        evidence: [`Nuevo: ${wk[latest].map(r => `${DN[DOW[dow(r.date)]]} ${r.cat} (${lc(r.role)})`).join(', ')}.`],
        detail: 'Un cambio puede ser puntual. Lo seguiré el próximo fin de semana.', action: null
      });
    }
    if (L < 2 && wk[prev]) {
      wk[latest].forEach(r => {
        const t = tok(r); let n = 1, k = prev;
        while (wk[k] && wk[k].some(x => tok(x) === t)) { n++; k = addDays(k, -7); }
        if (n >= 2) {
          const items = []; for (let i = n - 1; i >= 0; i--) items.push(wk[addDays(latest, -7 * i)].find(x => tok(x) === t));
          out.push({
            id: `slot|${t}|${n}`, level: n >= 3 ? 'patron' : 'repeticion',
            headline: `${cap(DN[DOW[dow(r.date)]])} repetido: ${r.cat} como ${lc(r.role)}`,
            short: `${n} fines de semana seguidos.`, evidence: [describeLine(items, n, me)],
            detail: n === 2 ? 'Dos veces no basta para hablar de patrón.' : 'Se mantiene en el tiempo.', action: null
          });
          items.forEach(x => { const nm = (x.partner || '').trim(); if (nm && !x.group) qs.push(nm); });
        }
      });
    }
    const tl = keys.slice().reverse().slice(0, 8).map((k, i, a) => ({
      key: k, items: wk[k].map(r => ({ d: DOW[dow(r.date)], cat: r.cat, role: r.role, partner: (r.partner || '').trim(), group: known(r.group) ? r.group : null })),
      same: i + 1 < a.length && a[i + 1] === addDays(k, -7) && sig(wk, a[i + 1]) === sig(wk, k)
    }));
    return { out, qs, timeline: tl, weekendKeys: keys };
  }

  function forma(games) {
    const g = games.filter(x => x.overall != null).sort((a, b) => b.date.localeCompare(a.date));
    if (g.length < 6) return [];
    const r = g.slice(0, 3).map(x => +x.overall), p = g.slice(3, 8).map(x => +x.overall), d = mean(r) - mean(p);
    if (Math.abs(d) < 1) return [];
    return [{
      id: `forma|${g[0].date}`, level: d > 0 ? 'logro' : 'atencion', headline: d > 0 ? 'Tus últimos partidos van mejor' : 'Tus últimos partidos van peor',
      short: `Últimos 3: ${f1(mean(r))} de media, frente a ${f1(mean(p))} en los ${p.length} anteriores (${d > 0 ? '+' : ''}${f1(d)}).`,
      evidence: [], detail: g.length < 10 ? 'Todavía son pocos partidos: tómalo como una señal, no como una conclusión.' : '', action: null
    }];
  }

  function areas(games, AR) {
    const gs = games.filter(x => x.ratings && Object.keys(x.ratings).length).sort((a, b) => b.date.localeCompare(a.date));
    if (gs.length < 5) return [];
    const res = [];
    AR.forEach(a => {
      const v = gs.map(x => x.ratings[a]).filter(x => x != null && x > 0);
      if (v.length < 5) return;
      const r = v.slice(0, 3), p = v.slice(3, 8), d = mean(r) - mean(p);
      if (Math.abs(d) >= 1.5) res.push({ a, d, r: mean(r), p: mean(p) });
    });
    return res.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 2).map(x => ({
      id: `area|${x.a}|${gs[0].date}`, level: x.d > 0 ? 'logro' : 'atencion', headline: `${x.a}: ${x.d > 0 ? 'sube' : 'baja'}`,
      short: `${f1(x.r)} en los últimos 3 partidos con nota de esa área, frente a ${f1(x.p)} en los anteriores.`, evidence: [], detail: '',
      action: x.d < 0 ? { label: 'Crear objetivo', kind: 'goal', arg: x.a } : null
    }));
  }

  function partnersF(games) {
    const by = {}, all = games.filter(x => x.overall != null && x.partner);
    all.forEach(g => String(g.partner).split(' / ').forEach(p => { const k = norm(p); if (k) (by[k] = by[k] || { n: p.trim(), g: [] }).g.push(g); }));
    const res = [];
    Object.values(by).forEach(o => {
      if (o.g.length < 3) return;
      const ids = new Set(o.g), rest = all.filter(g => !ids.has(g));
      if (rest.length < 3) return;
      const a = mean(o.g.map(x => +x.overall)), b = mean(rest.map(x => +x.overall));
      if (Math.abs(a - b) >= 1) res.push({ n: o.n, a, b, na: o.g.length, nb: rest.length });
    });
    return res.slice(0, 1).map(x => ({
      id: `compa|${x.n}`, level: 'info', headline: `Notas distintas con ${x.n}`,
      short: `Con ${x.n}: ${f1(x.a)} (${x.na} partidos). Con el resto: ${f1(x.b)} (${x.nb}).`, evidence: [], detail: 'Es una comparación descriptiva; no sé qué la explica.', action: null
    }));
  }

  function compromisos(games) {
    const by = {}, sc = r => r === 'si' ? 1 : r === 'medias' ? .5 : 0, out = [];
    games.forEach(g => (g.commitments || []).forEach(c => { if (c.r) { const k = norm(c.t); (by[k] = by[k] || { t: c.t, l: [] }).l.push(sc(c.r)); } }));
    Object.values(by).filter(o => o.l.length >= 2 && mean(o.l) < 0.6).slice(0, 2).forEach(o => out.push({
      id: `compromiso|${norm(o.t)}`, level: 'atencion', headline: 'Un compromiso que no consigues cumplir',
      short: `«${o.t}»: cumplido ${Math.round(mean(o.l) * 100)} % en ${o.l.length} partidos.`, evidence: [], detail: '', action: { label: 'Convertir en aprendizaje', kind: 'learn', arg: o.t }
    }));
    const gs = games.filter(g => g.overall != null && (g.commitments || []).some(c => c.r));
    const full = gs.filter(g => g.commitments.filter(c => c.r).every(c => c.r === 'si')), part = gs.filter(g => !full.includes(g));
    if (full.length >= 2 && part.length >= 2) {
      const a = mean(full.map(g => +g.overall)), b = mean(part.map(g => +g.overall));
      if (Math.abs(a - b) >= .5) out.push({ id: `cumplir|${gs.length}`, level: a > b ? 'logro' : 'info', headline: a > b ? 'Cumplir tus compromisos se nota' : 'Cumplir los compromisos no cambia la nota',
        short: `Cumpliéndolos todos: ${f1(a)} (${full.length} partidos). Sin cumplirlos todos: ${f1(b)} (${part.length}).`, evidence: [], detail: '', action: null });
    }
    return out;
  }

  function testsF(ts) {
    const t = ts.slice().sort((a, b) => a.month.localeCompare(b.month)), out = [];
    if (!t.length) return out;
    const last = t.at(-1);
    if (last.score < last.pass) out.push({ id: `test|${last.month}`, level: 'atencion', headline: 'Último test: NO APTO', short: `${f1(last.score)} sobre ${last.max}; el mínimo era ${last.pass}.`, evidence: [], detail: '', action: null });
    const cnt = {};
    t.slice(-3).forEach(x => (x.missed || []).forEach(m => { const k = norm(m); if (k) (cnt[k] = cnt[k] || { t: m, n: 0 }).n++; }));
    Object.values(cnt).filter(o => o.n >= 2).slice(0, 1).forEach(o => out.push({ id: `testfallo|${norm(o.t)}`, level: 'atencion', headline: 'Un fallo que se repite en los tests', short: `«${o.t}» en ${o.n} de tus últimos tests.`, evidence: [], detail: '', action: { label: 'Convertir en aprendizaje', kind: 'learn', arg: o.t } }));
    if (t.length >= 3) { const d = last.score - mean(t.slice(0, -1).map(x => x.score)); if (d >= 2) out.push({ id: `testsube|${last.month}`, level: 'logro', headline: 'Tu test mejora', short: `${f1(last.score)} frente a ${f1(mean(t.slice(0, -1).map(x => x.score)))} de media en los anteriores.`, evidence: [], detail: '', action: null }); }
    return out;
  }

  function carga(records) {
    const wk = {}; records.filter(r => wkKey(r.date)).forEach(r => { wk[wkKey(r.date)] = 1; });
    const keys = Object.keys(wk).sort(); if (!keys.length) return [];
    let n = 1, k = keys.at(-1); while (wk[addDays(k, -7)]) { n++; k = addDays(k, -7); }
    return n >= 3 ? [{ id: `carga|${n}`, level: 'info', headline: `${n} fines de semana seguidos arbitrando`, short: 'Tenlo en cuenta para planificar descanso y desplazamientos.', evidence: [], detail: '', action: null }] : [];
  }

  function registro(games) {
    const g = games.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    if (g.length < 5) return [];
    const n = g.filter(x => x.ratings && Object.keys(x.ratings).length).length;
    return n < 3 ? [{ id: `registro|${g[0].date}`, level: 'info', headline: 'Faltan notas por área', short: `Solo ${n} de tus últimos 5 partidos las tienen. Sin ellas no puedo decirte en qué mejoras.`, evidence: [], detail: '', action: null }] : [];
  }

  function dinero(m) {
    const out = [];
    (m && m.overdue || []).forEach(o => out.push({ id: `cobro|${o.label}`, level: 'atencion', headline: `El cobro de ${o.label} no consta como recibido`, short: `${o.total} · debía llegar del 1 al 10.`, evidence: [], detail: '', action: { label: 'Ver cobro', kind: 'route', arg: '#/cobro' } }));
    if (m && m.missingFee > 0) out.push({ id: `sinhon|${m.missingFee}`, level: 'info', headline: `${m.missingFee} partido${m.missingFee === 1 ? '' : 's'} sin honorario`, short: 'No cuentan en tus cobros hasta que completes su importe.', evidence: [], detail: '', action: { label: 'Verlos', kind: 'route', arg: '#/games', pre: 'nofee' } });
    return out;
  }

  function analyze(ctx) {
    const s = structure(ctx.records, ctx.me || null), games = ctx.games || [];
    const findings = [].concat(s.out, forma(games), areas(games, ctx.areas || []), compromisos(games), testsF(ctx.tests || []), partnersF(games), carga(ctx.records), registro(games), dinero(ctx.money))
      .sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
    const names = [...new Set(s.qs.map(x => x.trim()))].filter(Boolean);
    const questions = names.slice(0, 3).map(n => ({ id: `grupo|${norm(n)}`, kind: 'grupo', name: n, text: `¿De qué grupo es ${n}?`, options: ['G1', 'G2', 'Desarrollo', 'Otro', 'No sé'] }));
    return { findings, questions, timeline: s.timeline };
  }
  const api = { analyze, structure, weekends, wkKey };
  if (typeof module !== 'undefined') module.exports = api; else root.Secretario = api;
})(typeof window !== 'undefined' ? window : globalThis);
