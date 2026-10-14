// HTTP rendering checks; these do not replace browser interaction or visual verification.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../bar-inventory-system/app');
const paths = [];
function collect(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) collect(path.join(dir, entry.name));
    if (entry.name === 'page.tsx') {
      let url = '/' + path.relative(root, dir).split(path.sep).join('/');
      if (url.includes('[type]')) {
        for (const type of url.startsWith('/setup') ? ['units','categories','brands'] : ['quotation','sales_order','proforma','invoice','credit_note']) paths.push(url.replace('[type]', type));
      } else paths.push(url.replace('[id]', '1'));
    }
  }
}
collect(root);
(async () => {
  const results = [];
  for (const url of paths) {
    try {
      const response = await fetch(`${process.argv[2] || 'http://localhost:3000'}${url}`, { signal: AbortSignal.timeout(10000) });
      await response.text();
      results.push({ path: url, status: response.status });
    } catch (error) { results.push({ path: url, error: error.message }); }
  }
  fs.writeFileSync(path.join(__dirname, '../page-audit-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
