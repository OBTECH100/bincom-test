// Usage: node import.js [path-to-sql]
// Reads DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME from the environment (same as server.js)
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const file = process.argv[2] || path.join(__dirname, 'bincom_test.sql');
  let sql = fs.readFileSync(file, 'utf8');
  // zero dates are rejected by MySQL 8 -> replace with a valid date
  sql = sql.replace(/0000-00-00 00:00:00/g, '2011-01-01 00:00:00');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'bincom_test',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  await conn.query("SET SESSION sql_mode=''");
  await conn.query(sql);
  const [[a]] = await conn.query('SELECT COUNT(*) AS n FROM polling_unit');
  const [[b]] = await conn.query('SELECT COUNT(*) AS n FROM announced_pu_results');
  const [[c]] = await conn.query('SELECT COUNT(*) AS n FROM lga');
  console.log(`Import OK -> polling_unit: ${a.n}, announced_pu_results: ${b.n}, lga: ${c.n}`);
  await conn.end();
})().catch((e) => { console.error('Import failed:', e.message); process.exit(1); });
