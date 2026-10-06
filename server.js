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

const layout = (title, body) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{font-family:Arial,sans-serif;max-width:720px;margin:20px auto;padding:0 12px;color:#222}
nav{margin-bottom:12px}nav a{margin-right:14px;font-weight:bold;color:#0a58ca;text-decoration:none}
select,input,button{padding:9px;font-size:16px;margin:4px 0;width:100%;box-sizing:border-box}
button{background:#0a58ca;color:#fff;border:0;cursor:pointer;border-radius:4px}
table{border-collapse:collapse;width:100%;margin-top:14px}
td,th{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f2f2f2}
.err{color:#b00020}.ok{color:#0a7a2f;font-weight:bold}.muted{color:#666;font-size:14px}
</style></head><body>
<nav><a href="/polling-unit">1. Polling Unit</a><a href="/lga-total">2. LGA Total</a><a href="/new">3. Add Results</a></nav>
<h2>${esc(title)}</h2>${body}</body></html>`;

const wrap = (fn) => async (req, res) => {
  try { await fn(req, res); }
  catch (e) { console.error(e); res.status(500).send(layout('Error', `<p class="err">Something went wrong: ${esc(e.message)}</p>`)); }
};

const resultTable = (rows, key, total = false) => {
  if (!rows.length) return '<p>No results found.</p>';
  const sum = rows.reduce((a, r) => a + Number(r[key]), 0);
  return `<table><tr><th>Party</th><th>Score</th></tr>
  ${rows.map((r) => `<tr><td>${esc(r.party_abbreviation)}</td><td>${Number(r[key]).toLocaleString()}</td></tr>`).join('')}
  ${total ? `<tr><th>Total</th><th>${sum.toLocaleString()}</th></tr>` : ''}</table>`;
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
  let results = '';
  if (id) {
    const [rows] = await pool.query(
      'SELECT party_abbreviation, party_score FROM announced_pu_results WHERE polling_unit_uniqueid = ?', [String(id)]);
    results = resultTable(rows, 'party_score', true);
  }
  const options = units.map((u) => {
    const label = `${u.has_results ? '✓ ' : ''}${u.lga_name || '-'} › ${u.ward_name || '-'} › ${u.polling_unit_name || u.polling_unit_number || u.uniqueid}`;
    return `<option value="${u.uniqueid}" ${String(u.uniqueid) === String(id) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
  res.send(layout('Polling Unit Result',
    `<form method="get"><select name="id" onchange="this.form.submit()"><option value="">-- Select polling unit --</option>${options}</select></form>
     <p class="muted">✓ = has announced results</p>${results}`));
}));

// ---------- Question 2: summed total per LGA (from polling-unit results only) ----------
app.get('/lga-total', wrap(async (req, res) => {
  const [lgas] = await pool.query('SELECT lga_id, lga_name FROM lga WHERE state_id = 25 ORDER BY lga_name');
  const id = req.query.lga_id;
  let results = '';
  if (id) {
    const [rows] = await pool.query(
      `SELECT r.party_abbreviation, SUM(r.party_score) AS total
       FROM announced_pu_results r
       JOIN polling_unit pu ON pu.uniqueid = r.polling_unit_uniqueid
       WHERE pu.lga_id = ?
       GROUP BY r.party_abbreviation ORDER BY total DESC`, [id]);
    results = resultTable(rows, 'total', true);
  }
  const options = lgas.map((l) =>
    `<option value="${l.lga_id}" ${String(l.lga_id) === String(id) ? 'selected' : ''}>${esc(l.lga_name)}</option>`).join('');
  res.send(layout('LGA Summed Total',
    `<form method="get"><select name="lga_id" onchange="this.form.submit()"><option value="">-- Select local government --</option>${options}</select></form>${results}`));
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

const newPage = ({ wards, parties }, msg = '') => layout('Add New Polling Unit Results',
  `${msg}<form method="post" action="/new">
  <label>Ward</label>
  <select name="ward" required><option value="">-- Select ward --</option>
  ${wards.map((w) => `<option value="${w.uniqueid}">${esc(w.lga_name)} › ${esc(w.ward_name)}</option>`).join('')}</select>
  <label>Polling unit name</label><input name="name" required>
  <label>Polling unit number</label><input name="number">
  <h3>Party scores</h3>
  ${parties.map((p) => `<label>${esc(p.partyid)}</label><input type="number" min="0" name="score_${esc(p.partyid)}" value="0" required>`).join('')}
  <button type="submit">Save results</button></form>`);

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
    res.send(newPage(form, `<p class="ok">Saved! <a href="/polling-unit?id=${ins.insertId}">View the result</a></p>`));
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
