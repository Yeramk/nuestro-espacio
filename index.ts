// ARBITRA · avisos push (Supabase Edge Function)
// Lo llama pg_cron cada hora (con cabecera x-cron-secret) y la web para el botón de prueba (con el token del usuario).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const TZ = 'Atlantic/Canary';

// ---- fechas en hora de Canarias ----
function parts(d: any) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const o: any = {}; f.formatToParts(d).forEach((p: any) => { o[p.type] = p.value; }); return o;
}
const dateOf = (d: any) => { const o = parts(d); return `${o.year}-${o.month}-${o.day}`; };
const hhmm = (d: any) => { const o = parts(d); return `${o.hour}:${o.minute}`; };
const dowOf = (d: any) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts(d).weekday);
const addDays = (s: string, k: number) => { const t = new Date(s + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + k); return t.toISOString().slice(0, 10); };

// ==== PLAN (lógica pura, probada aparte) ====
function plan(at: any, ctx: any, prefs: any, force: any) {
  const out: any[] = [];
  const on = (k: string, h: boolean) => (force ? force === k : h);
  const open = ['Programado', 'Confirmado'];
  // 1. Víspera de un partido (20:00)
  if (prefs.match && on('match', at.hour === 20)) {
    const tmr = addDays(at.date, 1);
    const list = ctx.assignments.filter((a: any) => open.includes(a.status) && dateOf(new Date(a.starts_at)) === tmr)
      .sort((a: any, b: any) => a.starts_at.localeCompare(b.starts_at));
    if (list.length) {
      const one = list.length === 1, a = list[0], d = new Date(a.starts_at);
      const cat = ctx.cats[a.category_id] || 'Partido', loc = ctx.rates[a.locality_id];
      const body = one
        ? `${cat} · ${hhmm(d)}${loc ? ' · ' + loc : ''}${(a.commitments || []).length ? '' : ' · Elige tus compromisos'}`
        : list.map((x: any) => `${hhmm(new Date(x.starts_at))} ${ctx.cats[x.category_id] || 'Partido'}`).join(' · ');
      out.push({ kind: 'match', ref: tmr, payload: { title: one ? 'Mañana, partido' : `Mañana, ${list.length} partidos`, body, tag: 'match-' + tmr, url: one ? `./#/asg/${a.id}` : './#/agenda' } });
    }
  }
  // 2. Partidos pasados sin registrar (10:00, hasta 3 días después)
  if (prefs.unreg && on('unreg', at.hour === 10)) {
    const nowMs = at.nowMs ?? Date.now(), min = addDays(at.date, -3);
    const n = ctx.assignments.filter((a: any) => open.includes(a.status) && new Date(a.starts_at).getTime() < nowMs && dateOf(new Date(a.starts_at)) >= min && !ctx.registered.includes(a.id)).length;
    if (n) out.push({ kind: 'unreg', ref: at.date, payload: { title: 'Partido sin registrar', body: n === 1 ? 'Tienes 1 partido sin registrar. Registrarlo hoy te lleva un minuto.' : `Tienes ${n} partidos sin registrar.`, tag: 'unreg', url: './#/' } });
  }
  // 3. Test de reglas por vencer (09:00; 3 días, 1 día y el mismo día)
  if (prefs.test && on('test', at.hour === 9) && ctx.testDeadlineDay && !ctx.testDone) {
    const y = +at.date.slice(0, 4), m = +at.date.slice(5, 7), last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const left = Math.min(ctx.testDeadlineDay, last) - +at.date.slice(8, 10);
    if ([3, 1, 0].includes(left)) out.push({ kind: 'test', ref: `${at.date.slice(0, 7)}-${left}`, payload: { title: 'Test de reglas', body: left === 0 ? 'Hoy vence el test del mes.' : left === 1 ? 'Mañana vence el test del mes.' : `Quedan ${left} días para el test del mes.`, tag: 'test', url: './#/tests' } });
  }
  // 4. Revisiones (19:00): semanal el domingo; mensual el último día del mes
  if (prefs.review && on('review', at.hour === 19)) {
    const monday = addDays(at.date, -6);
    if ((force ? true : at.dow === 0) && ctx.playedDates.some((d: string) => d >= monday && d <= at.date) && !ctx.reviews.some((r: any) => r.kind === 'semanal' && r.period === monday))
      out.push({ kind: 'review-w', ref: monday, payload: { title: 'Revisión de la semana', body: 'Tarda dos minutos y deja constancia de cómo ha ido.', tag: 'review-w', url: `./#/rev/semanal:${monday}` } });
    const first = at.date.slice(0, 8) + '01';
    if ((force ? true : addDays(at.date, 1).slice(8, 10) === '01') && ctx.playedDates.some((d: string) => d >= first && d <= at.date) && !ctx.reviews.some((r: any) => r.kind === 'mensual' && r.period === first))
      out.push({ kind: 'review-m', ref: first, payload: { title: 'Revisión del mes', body: 'Repasa el mes con tus partidos delante.', tag: 'review-m', url: `./#/rev/mensual:${first}` } });
  }
  return out;
}
// ==== FIN PLAN ====

async function config() {
  const { data } = await db.from('push_config').select('key,value');
  const c: any = {}; (data || []).forEach((r: any) => { c[r.key] = r.value; });
  if (!c.vapid_public || !c.vapid_private) {
    const k = webpush.generateVAPIDKeys();
    await db.from('push_config').upsert([{ key: 'vapid_public', value: k.publicKey }, { key: 'vapid_private', value: k.privateKey }]);
    c.vapid_public = k.publicKey; c.vapid_private = k.privateKey;
  }
  return c;
}

async function sendTo(owner: string, payload: any, cfg: any) {
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('owner', owner);
  webpush.setVapidDetails(cfg.vapid_subject || 'mailto:admin@example.com', cfg.vapid_public, cfg.vapid_private);
  let sent = 0; const errors: string[] = [];
  for (const s of subs || []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 21600, urgency: 'normal' });
      sent++;
    } catch (e: any) {
      const code = e?.statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', s.id);
      errors.push(`${code || ''} ${String(e?.body || e?.message || e).slice(0, 120)}`);
    }
  }
  return { sent, subs: (subs || []).length, errors };
}

async function loadCtx(owner: string, at: any) {
  const from = addDays(at.date, -6) + 'T00:00:00Z', to = addDays(at.date, 3) + 'T23:59:59Z';
  const month1 = at.date.slice(0, 8) + '01', since = addDays(at.date, -40);
  const [as, cats, rates, set, tdone, revs, played] = await Promise.all([
    db.from('assignments').select('id,starts_at,status,commitments,category_id,locality_id').eq('owner', owner).gte('starts_at', from).lte('starts_at', to),
    db.from('categories').select('id,level,competition'),
    db.from('transport_rates').select('id,locality'),
    db.from('user_settings').select('push_prefs,test_deadline_day').eq('owner', owner).maybeSingle(),
    db.from('rules_tests').select('id').eq('owner', owner).eq('month', month1).not('score', 'is', null),
    db.from('reviews').select('kind,period').eq('owner', owner).gte('period', since),
    db.from('games').select('played_on,assignment_id').eq('owner', owner).gte('played_on', since),
  ]);
  const ids = new Set((played.data || []).map((g: any) => g.assignment_id).filter(Boolean));
  const catMap: any = {}; (cats.data || []).forEach((c: any) => { catMap[c.id] = `${c.level} ${c.competition}`; });
  const rateMap: any = {}; (rates.data || []).forEach((r: any) => { rateMap[r.id] = r.locality; });
  return {
    prefs: { match: true, unreg: true, test: true, review: true, ...((set.data as any)?.push_prefs || {}) },
    ctx: {
      assignments: as.data || [], registered: [...ids], cats: catMap, rates: rateMap,
      testDeadlineDay: (set.data as any)?.test_deadline_day || null, testDone: (tdone.data || []).length > 0,
      reviews: revs.data || [], playedDates: (played.data || []).map((g: any) => g.played_on),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const cfg = await config();
    const body = await req.json().catch(() => ({}));
    const secret = req.headers.get('x-cron-secret');
    if (secret && secret === cfg.cron_secret) {
      if (body.init) return json({ ok: true, public: cfg.vapid_public });
      const now = new Date();
      const at = body.at || { date: dateOf(now), hour: +parts(now).hour, dow: dowOf(now) };
      let owners: string[] = body.owners;
      if (!owners) { const { data } = await db.from('push_subscriptions').select('owner'); owners = [...new Set((data || []).map((r: any) => r.owner))] as string[]; }
      const results: any[] = [];
      for (const o of owners) {
        const { prefs, ctx } = await loadCtx(o, at);
        const items = plan(at, ctx, prefs, body.force || null);
        for (const it of items) {
          if (body.dry) { results.push({ owner: o, ...it }); continue; }
          const { error } = await db.from('push_log').insert({ owner: o, kind: it.kind, ref: it.ref, sent_on: at.date });
          if (error) continue; // ya enviado hoy
          results.push({ owner: o, kind: it.kind, ...(await sendTo(o, it.payload, cfg)) });
        }
      }
      return json({ at, results });
    }
    if (body.test) {
      const token = (req.headers.get('authorization') || '').replace('Bearer ', '');
      const { data: u } = await db.auth.getUser(token);
      if (!u?.user) return json({ error: 'no autorizado' }, 401);
      return json(await sendTo(u.user.id, { title: 'ARBITRA', body: 'Las notificaciones funcionan.', tag: 'test', url: './' }, cfg));
    }
    return json({ error: 'no autorizado' }, 401);
  } catch (e: any) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
