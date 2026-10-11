/* ARBITRA · Observatorio de patrones
   Sin IA, sin servicios de pago: recuento de semanas y reglas explícitas.
   Entrada: registros {date, category, role, partner} (designaciones y partidos)
            + groups {nombre normalizado: 'G1' | 'G2' | ...}
   Salida: observaciones ordenadas por relevancia, con texto descriptivo (nunca causal). */
(function (root) {
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const dayKind = d => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return w === 6 ? 'sábado' : w === 0 ? 'domingo' : 'entre semana'; };
  const weekOf = d => { const t = new Date(d + 'T12:00:00Z'), n = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - n + 3); const y = t.getUTCFullYear(); return y * 100 + Math.ceil((((t - Date.UTC(y, 0, 1)) / 864e5) + 1) / 7); };
  const addDays = (d, k) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };
  function weeksBetween(from, to) {
    const out = [];
    for (let d = from; d <= to; d = addDays(d, 7)) { const w = weekOf(d); if (!out.includes(w)) out.push(w); }
    const wl = weekOf(to); if (!out.includes(wl)) out.push(wl);
    return out;
  }
  function items(records, groups) {
    return records.filter(r => r.date).map(r => {
      const g = groups[norm(r.partner)] || (r.partner ? r.partner.trim() : 'sin compañero');
      const cat = r.category || 'sin categoría', role = r.role || 'sin rol';
      return { date: r.date, week: weekOf(r.date), slot: `${dayKind(r.date)} · ${cat} · ${role} · con ${g}`, profileKey: `${cat} · ${role} · ${g}` };
    });
  }
  // P: presencia por semana, de la más antigua a la más reciente
  function classify(P) {
    const n = P.length, total = P.filter(Boolean).length;
    if (!total) return null;
    let streak = 0; for (let i = n - 1; i >= 0 && P[i]; i--) streak++;
    const last4 = P.slice(-4).filter(Boolean).length;
    let best = 0, run = 0; P.forEach(x => { run = x ? run + 1 : 0; best = Math.max(best, run); });
    const lastTwoOff = n >= 2 && !P[n - 1] && !P[n - 2];
    if (streak >= 3 || last4 >= 3) return { level: 'tendencia', total, streak, last4, best };
    if (best >= 3 && lastTwoOff) return { level: 'cambio', total, streak, last4, best };
    if (streak === 2) return { level: 'repetición', total, streak, last4, best };
    if (total === 1) return { level: 'coincidencia', total, streak, last4, best };
    return { level: 'esporádica', total, streak, last4, best };
  }
  const lista = ws => ws.map(w => `sem. ${w % 100}`).join(', ');
  function texto(o) {
    const q = o.kind === 'fin de semana completo' ? 'El fin de semana completo se repite igual' : o.key;
    if (o.level === 'tendencia') return `${q}: aparece en ${o.last4} de las últimas 4 semanas (${lista(o.weeks)}). Es una tendencia que se mantiene. Tus datos no explican el motivo.`;
    if (o.level === 'cambio') return `${q}: llevaba ${o.best} semanas seguidas y lleva 2 sin aparecer. Merece seguimiento.`;
    if (o.level === 'repetición') return `${q}: ${o.streak} semanas seguidas (${lista(o.weeks.slice(-o.streak))}). Aún es pronto para hablar de patrón; si se mantiene 3 de las 4 últimas semanas lo marco como tendencia.`;
    if (o.level === 'coincidencia') return `${q}: ha aparecido una sola vez (${lista(o.weeks)}).`;
    return `${q}: aparece de forma irregular (${o.total} veces).`;
  }
  function observe(records, groups, opt) {
    const W = weeksBetween(opt.from, opt.to);
    const its = items(records, groups).filter(i => i.date >= opt.from && i.date <= opt.to);
    const bySlot = {}, wk = {}, profs = {}, out = [];
    its.forEach(i => { (bySlot[i.slot] = bySlot[i.slot] || new Set()).add(i.week); (wk[i.week] = wk[i.week] || new Set()).add(i.profileKey); });
    Object.entries(wk).forEach(([w, s]) => { const k = [...s].sort().join(' + '); (profs[k] = profs[k] || new Set()).add(Number(w)); });
    const run = (map, kind) => Object.entries(map).forEach(([k, set]) => {
      const c = classify(W.map(w => set.has(w)));
      if (c) out.push({ kind, key: k, ...c, weeks: W.filter(w => set.has(w)) });
    });
    run(bySlot, 'designación');
    run(profs, 'fin de semana completo');
    const rank = { tendencia: 0, cambio: 1, repetición: 2, esporádica: 3, coincidencia: 4 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]).map(o => ({ ...o, text: texto(o) }));
  }
  const api = { observe, classify, weekOf, weeksBetween, dayKind };
  if (typeof module !== 'undefined') module.exports = api; else root.Observatorio = api;
})(typeof window !== 'undefined' ? window : globalThis);
