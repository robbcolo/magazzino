// Lettura dei codici sulle confezioni: GS1 (DataMatrix, GS1-128, EAN/UPC), HIBC,
// etichette QR interne dell'app. Tutte funzioni pure, senza dipendenze.

const GS = '\x1d';

// Application Identifier GS1: lunghezza fissa dei dati (escluso l'AI) oppure variabile (max)
const FIXED = {
  '00': 18, '01': 14, '02': 14, '03': 14, '04': 16,
  '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6, '18': 6, '19': 6, '20': 2,
};
const VAR2 = { '10': 20, '21': 20, '22': 20, '30': 8, '37': 8, '90': 30, '91': 90, '92': 90, '93': 90, '94': 90, '95': 90, '96': 90, '97': 90, '98': 90, '99': 90 };

function aiSpec(s, i) {
  const a2 = s.substr(i, 2);
  if (FIXED[a2]) return { ai: a2, fixed: FIXED[a2] };
  if (VAR2[a2]) return { ai: a2, max: VAR2[a2] };
  const a3 = s.substr(i, 3);
  if (/^41[0-7]$/.test(a3)) return { ai: a3, fixed: 13 };
  if (/^(24[0-3]|25[0-4]|400|401|402|403|42[0-7])$/.test(a3)) return { ai: a3, max: 30 };
  const a4 = s.substr(i, 4);
  if (/^3[1-6]\d\d$/.test(a4)) return { ai: a4, fixed: 6 };
  if (a4 === '7003') return { ai: a4, fixed: 10 };
  if (/^7\d\d\d$/.test(a4)) return { ai: a4, max: 30 };
  if (/^8\d\d\d$/.test(a4)) return { ai: a4, max: 70 };
  return null;
}

// Interpreta una stringa GS1 "a elementi" (01...17...10...) con o senza separatori GS
function parseElementString(s) {
  const out = {};
  let i = 0;
  const noGS = !s.includes(GS);
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const spec = aiSpec(s, i);
    if (!spec) return Object.keys(out).length ? out : null;
    i += spec.ai.length;
    let val;
    if (spec.fixed) {
      val = s.substr(i, spec.fixed);
      if (val.length < spec.fixed) return Object.keys(out).length ? out : null;
      i += spec.fixed;
    } else {
      let end = s.indexOf(GS, i);
      if (end === -1) end = s.length;
      val = s.slice(i, end);
      // Lettori a tastiera perdono spesso il separatore GS: se il campo variabile
      // contiene una data 17/11 valida seguita da un resto interpretabile, separa lì.
      if (noGS && val.length > 6) {
        for (let k = 1; k < val.length - 7; k++) {
          const ai = val.substr(k, 2);
          if ((ai === '17' || ai === '11') && validYYMMDD(val.substr(k + 2, 6))) {
            const rest = val.slice(k);
            const sub = parseElementString(rest);
            if (sub && (sub['17'] || sub['11'])) {
              out[spec.ai] = val.slice(0, k);
              Object.assign(out, sub);
              return out;
            }
          }
        }
      }
      if (val.length > spec.max) val = val.slice(0, spec.max);
      i = end;
    }
    out[spec.ai] = val;
  }
  return out;
}

function validYYMMDD(v) {
  if (!/^\d{6}$/.test(v)) return false;
  const m = +v.slice(2, 4), d = +v.slice(4, 6);
  return m >= 1 && m <= 12 && d >= 0 && d <= 31;
}

export function gs1Date(v) {
  if (!validYYMMDD(v)) return null;
  let y = +v.slice(0, 2), m = +v.slice(2, 4), d = +v.slice(4, 6);
  y += y >= 51 ? 1900 : 2000;
  if (d === 0) d = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 00 = ultimo giorno del mese
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function gtinCheckOk(code) {
  if (!/^\d{8,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  digits.reverse().forEach((d, idx) => { sum += d * (idx % 2 === 0 ? 3 : 1); });
  return (10 - (sum % 10)) % 10 === check;
}

const toGtin14 = (c) => c.padStart(14, '0');

// --- HIBC (Health Industry Bar Code) ---
const HIBC_SET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
function hibcCheck(str) {
  let sum = 0;
  for (const ch of str) { const v = HIBC_SET.indexOf(ch); if (v < 0) return null; sum += v; }
  return HIBC_SET[sum % 43];
}
function julian(yy, jjj) {
  const y = 2000 + +yy;
  const d = new Date(Date.UTC(y, 0, 1));
  d.setUTCDate(+jjj);
  return d.toISOString().slice(0, 10);
}
function parseHibcSecondary(sec) {
  // sec: dati secondari senza '+' iniziale e senza caratteri di controllo
  const r = {};
  let m;
  if (sec.startsWith('$$')) {
    const t = sec.slice(2);
    const f = t[0];
    if (f === '0' || f === '1') { // MMYY
      const mm = t.slice(0, 2), yy = t.slice(2, 4);
      const y = 2000 + +yy;
      r.exp = `${y}-${mm}-${String(new Date(Date.UTC(y, +mm, 0)).getUTCDate()).padStart(2, '0')}`;
      r.lot = t.slice(4);
    } else if (f === '2') { r.exp = `20${t.slice(5, 7)}-${t.slice(1, 3)}-${t.slice(3, 5)}`; r.lot = t.slice(7); }
    else if (f === '3') { r.exp = `20${t.slice(1, 3)}-${t.slice(3, 5)}-${t.slice(5, 7)}`; r.lot = t.slice(7); }
    else if (f === '4') { r.exp = `20${t.slice(1, 3)}-${t.slice(3, 5)}-${t.slice(5, 7)}`; r.lot = t.slice(9); }
    else if (f === '5') { r.exp = julian(t.slice(1, 3), t.slice(3, 6)); r.lot = t.slice(6); }
    else if (f === '6') { r.exp = julian(t.slice(1, 3), t.slice(3, 6)); r.lot = t.slice(8); }
    else if (f === '7') { r.lot = t.slice(1); }
    else if (f === '8' || f === '9') {
      const qlen = f === '8' ? 2 : 5;
      const rest = t.slice(1 + qlen);
      const sub = parseHibcSecondary('$$' + rest);
      Object.assign(r, sub);
    } else { r.lot = t; }
  } else if (sec.startsWith('$+')) {
    r.serial = sec.slice(2);
  } else if (sec.startsWith('$')) {
    r.lot = sec.slice(1);
  } else if ((m = sec.match(/^(\d{2})(\d{3})(.*)$/))) {
    r.exp = julian(m[1], m[2]);
    r.lot = m[3];
  }
  if (r.lot === '') delete r.lot;
  return r;
}

function parseHibc(raw) {
  let s = raw.replace(/^\*|\*$/g, '').toUpperCase();
  if (!s.startsWith('+')) return null;
  const res = { kind: 'hibc' };
  // controlla e rimuove il carattere di controllo finale, se valido
  const body = s.slice(0, -1);
  const hasCheck = hibcCheck(body) === s.slice(-1);
  let data = hasCheck ? body : s;
  if (/^\+[A-Z]/.test(data)) {
    // primario (eventualmente concatenato con secondario dopo '/')
    const [prim, ...secParts] = data.slice(1).split('/');
    const lic = prim.slice(0, 4);
    const pcn = prim.slice(4, -1);
    const um = prim.slice(-1);
    if (lic.length < 4 || !pcn) return null;
    res.lic = lic; res.pcn = pcn; res.um = um;
    res.key = `hibc:${lic}${pcn}${um}`;
    if (secParts.length) Object.assign(res, parseHibcSecondary(secParts.join('/')));
  } else {
    // secondario autonomo: '+' dati link controllo (il link è l'ultimo carattere dopo aver tolto il controllo)
    const sec = hasCheck ? data.slice(1, -1) : data.slice(1);
    Object.assign(res, parseHibcSecondary(sec));
    if (!res.exp && !res.lot && !res.serial) return null;
  }
  return res;
}

/**
 * Interpreta il testo letto da un codice.
 * Ritorna { raw, kind, key?, gtin?, lot?, exp?, serial?, productId?, location? }
 *  - key: chiave per riconoscere il prodotto (null se il codice contiene solo lotto/scadenza)
 */
export function parseCode(input) {
  if (input == null) return null;
  let raw = String(input).replace(/[\r\n]+$/g, '').trim();
  if (!raw) return null;
  const base = { raw };

  // Etichette interne
  let m = raw.match(/^MAG:P:(.+)$/);
  if (m) return { ...base, kind: 'internal', productId: m[1], key: `id:${m[1]}` };
  m = raw.match(/^MAG:L:(.+)$/);
  if (m) return { ...base, kind: 'location', location: decodeURIComponent(m[1]), key: null };

  // Identificatori di simbologia AIM (]d2, ]C1, ]Q3, ]e0)
  raw = raw.replace(/^\][A-Za-z]\d/, '');
  if (raw.startsWith(GS)) raw = raw.slice(1);

  // GS1 in forma leggibile: (01)...(17)...(10)...
  if (/^\(\d{2,4}\)/.test(raw)) {
    const ais = {};
    for (const mm of raw.matchAll(/\((\d{2,4})\)([^(]*)/g)) ais[mm[1]] = mm[2].trim();
    return fromAIs(base, ais);
  }

  // EAN / UPC / GTIN puro
  if (/^\d{8}$|^\d{12,14}$/.test(raw) && gtinCheckOk(raw)) {
    const gtin = toGtin14(raw);
    return { ...base, kind: 'gtin', gtin, key: `gtin:${gtin}` };
  }

  // GS1 element string (01 + GTIN, oppure 17/10/11/21 da soli)
  const looksGs1 = /^0[12]\d{14}/.test(raw)
    || (/^(17|11)\d{6}/.test(raw) && validYYMMDD(raw.substr(2, 6)) && raw.length > 8)
    || (raw.includes(GS) && /^\d{2}/.test(raw));
  if (looksGs1) {
    const ais = parseElementString(raw);
    if (ais && (ais['01'] || ais['02'] || ais['17'] || ais['10'])) return fromAIs(base, ais);
  }

  // HIBC
  if (/^\*?\+/.test(raw)) {
    const h = parseHibc(raw);
    if (h) return { ...base, ...h, key: h.key || null };
  }

  // Qualsiasi altro testo (codici interni dei fornitori, Code 128 generici...)
  return { ...base, kind: 'text', key: `raw:${raw.toUpperCase()}` };
}

function fromAIs(base, ais) {
  const r = { ...base, kind: 'gs1', ais };
  const g = ais['01'] || ais['02'];
  if (g && /^\d{14}$/.test(g)) { r.gtin = g; r.key = `gtin:${g}`; } else r.key = null;
  if (ais['17']) r.exp = gs1Date(ais['17']);
  if (ais['10']) r.lot = ais['10'];
  if (ais['21']) r.serial = ais['21'];
  if (!r.key && !r.exp && !r.lot) return { ...base, kind: 'text', key: `raw:${base.raw.toUpperCase()}` };
  return r;
}

// Unisce più letture (es. due codici sulla stessa scatola: GTIN + lotto/scadenza)
export function mergeCodes(list) {
  const out = { raws: [] };
  for (const c of list) {
    if (!c) continue;
    out.raws.push(c.raw);
    for (const k of ['key', 'gtin', 'lot', 'exp', 'serial', 'productId', 'location', 'kind', 'raw']) {
      if (c[k] && !out[k]) out[k] = c[k];
    }
  }
  return out;
}

export function describeCode(c) {
  if (!c) return '';
  const parts = [];
  if (c.kind === 'internal') return 'Etichetta del magazzino';
  if (c.kind === 'location') return `Ubicazione: ${c.location}`;
  if (c.gtin) parts.push(`GTIN ${c.gtin.replace(/^0+(?=\d{8,})/, '')}`);
  else if (c.kind === 'hibc' && c.lic) parts.push(`HIBC ${c.lic} ${c.pcn}`);
  else if (c.kind === 'text') parts.push(c.raw);
  if (c.lot) parts.push(`lotto ${c.lot}`);
  if (c.exp) parts.push(`scadenza ${c.exp.split('-').reverse().join('/')}`);
  return parts.join(', ');
}
