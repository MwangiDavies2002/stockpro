const fs = require('node:fs');
const path = require('node:path');

const resultsPath = path.join(__dirname, '../page-audit-results.json');
const pages = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

const baseUrl = process.argv[2] || 'http://localhost:3000';

async function measureLoadTime(url) {
  const start = Date.now();
  try {
    const response = await fetch(`${baseUrl}${url}`, { signal: AbortSignal.timeout(30000) });
    await response.text();
    const end = Date.now();
    return { path: url, status: response.status, elapsedMs: end - start };
  } catch (error) {
    const end = Date.now();
    return { path: url, error: error.message, elapsedMs: end - start };
  }
}

(async () => {
  const performanceResults = [];
  console.log(`Measuring load times for ${pages.length} pages...`);
  
  for (const page of pages) {
    const result = await measureLoadTime(page.path);
    console.log(`${result.path}: ${result.elapsedMs}ms [${result.status || 'ERROR'}]`);
    performanceResults.push(result);
  }
  
  fs.writeFileSync(path.join(__dirname, 'page-performance-baseline.json'), JSON.stringify(performanceResults, null, 2));
  
  const slowPages = performanceResults.filter(r => r.elapsedMs > 3000);
  console.log(`\nFound ${slowPages.length} slow pages (>3s):`);
  slowPages.forEach(p => console.log(`${p.path}: ${p.elapsedMs}ms`));
})();
