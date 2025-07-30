const fs = require('fs');
const path = require('path');

// Directory containing track files
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const indexPath = path.join(DATA_DIR, 'track_index.json');

// List .rctrk files in the data directory
const trackFiles = fs
  .readdirSync(DATA_DIR)
  .filter(f => f.toLowerCase().endsWith('.rctrk'))
  .sort()
  .map(f => `data/${f}`);

fs.writeFileSync(indexPath, JSON.stringify(trackFiles, null, 2) + '\n');
console.log(`Updated ${indexPath} with ${trackFiles.length} track file(s)`);
