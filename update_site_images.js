const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const imagesDir = path.join(DATA_DIR, 'images');
const sitesPath = path.join(DATA_DIR, 'sites.json');

if (!fs.existsSync(sitesPath)) {
  console.error(`Missing ${sitesPath}`);
  process.exit(1);
}

let sites;
try {
  sites = JSON.parse(fs.readFileSync(sitesPath, 'utf8'));
} catch (err) {
  console.error(`Failed to parse ${sitesPath}:`, err);
  process.exit(1);
}

sites.forEach(site => {
  const siteDir = path.join(imagesDir, site.id);
  let files = [];
  if (fs.existsSync(siteDir) && fs.statSync(siteDir).isDirectory()) {
    files = fs
      .readdirSync(siteDir)
      .filter(f => /\.(jpe?g|png|gif|webp)$/i.test(f))
      .sort();
  }

  if (files.length > 0) {
    site.images = files.map(f => `data/images/${site.id}/${f}`);
  } else {
    site.images = [];
  }
});

fs.writeFileSync(sitesPath, JSON.stringify(sites, null, 2) + '\n');
console.log(`Updated ${sitesPath}`);
