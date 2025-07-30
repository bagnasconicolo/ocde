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
    const newImages = files.map(f => `data/images/${site.id}/${f}`);
    const captions = Array.isArray(site.captions) ? site.captions : [];
    const newCaptions = newImages.map(img => {
      const idx = Array.isArray(site.images) ? site.images.indexOf(img) : -1;
      return idx >= 0 && captions[idx] ? captions[idx] : '';
    });
    site.images = newImages;
    site.captions = newCaptions;
  } else {
    site.images = [];
    site.captions = [];
  }
});

fs.writeFileSync(sitesPath, JSON.stringify(sites, null, 2) + '\n');
console.log(`Updated ${sitesPath}`);
