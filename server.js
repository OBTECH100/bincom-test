const express = require('express');
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'bincom_test',
});

const app = express();
app.use(express.urlencoded({ extended: true }));

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');

const CSS = `
:root{--bg:#f4f6fa;--card:#fff;--ink:#1b2430;--muted:#6b7686;--line:#e3e8ef;--brand:#0f5132;--brand2:#198754;--accent:#e9f5ee;--err:#b42318;--errbg:#fdecea}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.5}
header{background:linear-gradient(135deg,#0b3d2a,#198754);color:#fff;padding:26px 16px 0}
.wrap{max-width:860px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px}
.logo{width:42px;height:42px;border-radius:10px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:22px}
header h1{margin:0;font-size:22px;font-weight:700}
header p{margin:2px 0 0;font-size:13px;opacity:.85}
nav{display:flex;gap:6px;margin-top:20px;overflow-x:auto}
nav a{color:#d7efe2;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:10px 10px 0 0;white-space:nowrap}
nav a:hover{background:rgba(255,255,255,.12)}
nav a.active{background:var(--bg);color:var(--brand)}
main{max-width:860px;margin:0 auto;padding:22px 16px 40px}
h2{margin:0 0 4px;font-size:20px}
.sub{margin:0 0 18px;color:var(--muted);font-size:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;box-shadow:0 1px 2px rgba(16,24,40,.04);margin-bottom:18px}
label{display:block;font-size:13px;font-weight:600;color:#38424f;margin:14px 0 6px}
label:first-child{margin-top:0}
select,input{width:100%;padding:11px 12px;font-size:15px;border:1px solid #cfd6df;border-radius:10px;background:#fff;color:var(--ink);font-family:inherit}
select:focus,input:focus{outline:none;border-color:var(--brand2);box-shadow:0 0 0 3px rgba(25,135,84,.18)}
button{width:100%;margin-top:20px;padding:13px;font-size:15px;font-weight:700;color:#fff;background:var(--brand2);border:0;border-radius:10px;cursor:pointer}
button:hover{background:var(--brand)}
.hint{font-size:12px;color:var(--muted);margin-top:6px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.stat span{display:block;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.stat b{display:block;font-size:22px;margin-top:2px;color:var(--brand)}
table{width:100%;border-collapse:collapse}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}
td{padding:12px 8px;border-bottom:1px solid #eef1f5;font-size:15px;vertical-align:middle}
tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.party{font-weight:700}
.bar{height:8px;background:#eaf0ec;border-radius:99px;overflow:hidden;min-width:90px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--brand2),#57c48a);border-radius:99px}
.pct{font-size:12px;color:var(--muted);margin-left:6px}
.empty{text-align:center;color:var(--muted);padding:34px 10px}
.empty .ico{font-size:34px;display:block;margin-bottom:6px}
.alert{padding:12px 14px;border-radius:10px;font-size:14px;margin-bottom:16px}
.alert.ok{background:var(--accent);color:var(--brand);border:1px solid #bfe3cf}
.alert.err{background:var(--errbg);color:var(--err);border:1px solid #f5c2bd}
.alert a{color:inherit;font-weight:700}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
.grid label{margin-top:0}
.section{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--brand);margin:22px 0 10px;padding-top:16px;border-top:1px solid var(--line)}
footer{text-align:center;color:var(--muted);font-size:12px;padding:0 16px 28px}
@media(max-width:560px){.grid{grid-template-columns:1fr}header h1{font-size:19px}td,th{padding:10px 4px}.pct{display:none}}
`;

const layout = (title, subtitle, body, active) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Election Results Portal</title>
<style>${CSS}</style></head><body>
<header><div class="wrap">
  <div class="brand"><div class="logo">&#128499;</div><div><h1>Election Results Portal</h1><p>Delta State &middot; 2011 Polling Unit Results</p></div></div>
  <nav>
    <a href="/polling-unit" class="${active === 'pu' ? 'active' : ''}">Polling Unit</a>
    <a href="/lga-total" class="${active === 'lga' ? 'active' : ''}">LGA Totals</a>
    <a href="/new" class="${active === 'new' ? 'active' : ''}">Add Results</a>
  </nav>
</div></header>
<main><h2>${esc(title)}</h2><p class="sub">${esc(subtitle)}</p>${body}</main>
<footer>Election Results Portal</footer></body></html>`;

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) {
    console.error(e);
    const msg = e.message || e.code || String(e);
    res.status(500).send(layout('Something went wrong', 'The request could not be completed.',
      `<div class="alert err">${esc(msg)}</div>`, ''));
  }
};

const emptyState = (text) => `<div class="card empty"><span class="ico">&#128202;</span>${esc(text)}</div>`;

const resultView = (rows, key, heading) => {
  if (!rows.length) return `<div class="card empty"><span class="ico">&#128269;</span>No results have been announced here yet.</div>`;
  const total = rows.reduce((a, r) => a + Number(r[key]), 0);
  const max = Math.max(...rows.map((r) => Number(r[key])), 1);
  const lead = rows.reduce((a, r) => (Number(r[key]) > Number(a[key]) ? r : a), rows[0]);
  return `<div class="stats">
    <div class="stat"><span>Total votes</span><b>${fmt(total)}</b></div>
    <div class="stat"><span>Leading party</span><b>${esc(lead.party_abbreviation)}</b></div>
    <div class="stat"><span>Parties</span><b>${rows.length}</b></div>
  </div>
  <div class="card"><table>
    <tr><th>Party</th><th>Share</th><th class="num">Votes</th></tr>
    ${rows.map((r) => {
      const v = Number(r[key]);
      const pct = total ? (v / total) * 100 : 0;
      return `<tr><td class="party">${esc(r.party_abbreviation)}</td>
        <td><div style="display:flex;align-items:center"><div class="bar" style="flex:1"><i style="width:${(v / max) * 100}%"></i></div><span class="pct">${pct.toFixed(1)}%</span></div></td>
        <td class="num">${fmt(v)}</td></tr>`;
    }).join('')}
  </table></div>`;
};

app.get('/', (req, res) => res.redirect('/polling-unit'));

// ---------- Question 1: result for any polling unit ----------
app.get('/polling-unit', wrap(async (req, res) => {
  const [units] = await pool.query(
    `SELECT pu.uniqueid, pu.polling_unit_name, pu.polling_unit_number,
            w.ward_name, l.lga_name,
            EXISTS(SELECT 1 FROM announced_pu_results r WHERE r.polling_unit_uniqueid = pu.uniqueid) AS has_results
     FROM polling_unit pu
     LEFT JOIN ward w ON w.uniqueid = pu.uniquewardid
     LEFT JOIN lga l ON l.lga_id = pu.lga_id
     ORDER BY has_results DESC, l.lga_name, w.ward_name, pu.polling_unit_name`);
  const id = req.query.id;
  let results = emptyState('Select a polling unit above to view its announced results.');
  if (id) {
    const [rows] = await pool.query(
      'SELECT party_abbreviation, party_score FROM announced_pu_results WHERE polling_unit_uniqueid = ? ORDER BY party_score DESC', [String(id)]);
    results = resultView(rows, 'party_score');
  }
  const options = units.map((u) => {
    const label = `${u.has_results ? '\u2713 ' : ''}${u.lga_name || '-'} \u203A ${u.ward_name || '-'} \u203A ${u.polling_unit_name || u.polling_unit_number || u.uniqueid}`;
    return `<option value="${u.uniqueid}" ${String(u.uniqueid) === String(id) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
  res.send(layout('Polling Unit Result', 'View the announced result for any individual polling unit.',
    `<div class="card"><form method="get"><label for="id">Polling unit</label>
     <select id="id" name="id" onchange="this.form.submit()"><option value="">Select a polling unit</option>${options}</select>
     <div class="hint">&#10003; marks polling units that have announced results.</div></form></div>${results}`, 'pu'));
}));

// ---------- Question 2: summed total per LGA (from polling-unit results only) ----------
app.get('/lga-total', wrap(async (req, res) => {
  const [lgas] = await pool.query(
    `SELECT l.lga_id, l.lga_name FROM lga l
     WHERE l.state_id = 25
       AND EXISTS (SELECT 1 FROM polling_unit pu
                   JOIN announced_pu_results r ON r.polling_unit_uniqueid = pu.uniqueid
                   WHERE pu.lga_id = l.lga_id)
     ORDER BY l.lga_name`);
  const id = req.query.lga_id;
  let results = emptyState('Select a local government above to see its summed total.');
  if (id) {
    const [rows] = await pool.query(
      `SELECT r.party_abbreviation, SUM(r.party_score) AS total
       FROM announced_pu_results r
       JOIN polling_unit pu ON pu.uniqueid = r.polling_unit_uniqueid
       WHERE pu.lga_id = ?
       GROUP BY r.party_abbreviation ORDER BY total DESC`, [id]);
    results = resultView(rows, 'total');
  }
  const options = lgas.map((l) =>
    `<option value="${l.lga_id}" ${String(l.lga_id) === String(id) ? 'selected' : ''}>${esc(l.lga_name)}</option>`).join('');
  res.send(layout('Local Government Totals', 'Summed results of all polling units under a local government.',
    `<div class="card"><form method="get"><label for="lga_id">Local government</label>
     <select id="lga_id" name="lga_id" onchange="this.form.submit()"><option value="">Select a local government</option>${options}</select>
     <div class="hint">Showing ${lgas.length} local government${lgas.length === 1 ? '' : 's'} with announced results. Totals are calculated from individual polling unit results.</div></form></div>${results}`, 'lga'));
}));

// ---------- Question 3: store results for a new polling unit ----------
const loadForm = async () => {
  const [wards] = await pool.query(
    `SELECT w.uniqueid, w.ward_name, l.lga_name FROM ward w
     JOIN lga l ON l.lga_id = w.lga_id AND l.state_id = 25
     ORDER BY l.lga_name, w.ward_name`);
  const [parties] = await pool.query('SELECT partyid FROM party ORDER BY id');
  return { wards, parties };
};

const newPage = ({ wards, parties }, msg = '') => layout('Add Polling Unit Results',
  'Register a new polling unit and record the score of every party.',
  `${msg}<div class="card"><form method="post" action="/new">
  <label for="ward">Ward</label>
  <select id="ward" name="ward" required><option value="">Select a ward</option>
  ${wards.map((w) => `<option value="${w.uniqueid}">${esc(w.lga_name)} &rsaquo; ${esc(w.ward_name)}</option>`).join('')}</select>
  <div class="grid" style="margin-top:14px">
    <div><label for="name">Polling unit name</label><input id="name" name="name" required placeholder="e.g. Town Hall"></div>
    <div><label for="number">Polling unit number</label><input id="number" name="number" placeholder="e.g. DT/04/12/003"></div>
  </div>
  <div class="section">Party scores</div>
  <div class="grid">
  ${parties.map((p) => `<div><label for="s_${esc(p.partyid)}">${esc(p.partyid)}</label><input id="s_${esc(p.partyid)}" type="number" min="0" name="score_${esc(p.partyid)}" value="0" required></div>`).join('')}
  </div>
  <button type="submit">Save results</button></form></div>`, 'new');

app.get('/new', wrap(async (req, res) => res.send(newPage(await loadForm()))));

app.post('/new', wrap(async (req, res) => {
  const form = await loadForm();
  const conn = await pool.getConnection();
  try {
    const [[ward]] = await conn.query('SELECT uniqueid, ward_id, lga_id FROM ward WHERE uniqueid = ?', [req.body.ward]);
    if (!ward) throw new Error('Please select a valid ward');
    await conn.beginTransaction();
    const [[{ nextId }]] = await conn.query('SELECT COALESCE(MAX(polling_unit_id),0)+1 AS nextId FROM polling_unit');
    const [ins] = await conn.query(
      `INSERT INTO polling_unit (polling_unit_id, ward_id, lga_id, uniquewardid, polling_unit_number, polling_unit_name, entered_by_user, date_entered, user_ip_address)
       VALUES (?, ?, ?, ?, ?, ?, 'web', NOW(), ?)`,
      [nextId, ward.ward_id, ward.lga_id, ward.uniqueid, req.body.number || '', req.body.name, req.ip]);
    for (const p of form.parties) {
      const score = Math.max(0, parseInt(req.body[`score_${p.partyid}`], 10) || 0);
      await conn.query(
        `INSERT INTO announced_pu_results (polling_unit_uniqueid, party_abbreviation, party_score, entered_by_user, date_entered, user_ip_address)
         VALUES (?, ?, ?, 'web', NOW(), ?)`,
        [String(ins.insertId), p.partyid.slice(0, 4), score, req.ip]); // column is char(4): LABOUR -> LABO
    }
    await conn.commit();
    res.send(newPage(form, `<div class="alert ok">Results saved successfully. <a href="/polling-unit?id=${ins.insertId}">View the result &rarr;</a></div>`));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));