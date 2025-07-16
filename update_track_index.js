const fs = require('fs');
const path = require('path');

// Directory containing track files
const dataDir = path.join(__dirname, 'data');
const indexPath = path.join(dataDir, 'track_index.json');

// List .rctrk files in the data directory
const trackFiles = fs
  .readdirSync(dataDir)
  .filter(f => f.toLowerCase().endsWith('.rctrk'))
  .sort()
  .map(f => `data/${f}`);

fs.writeFileSync(indexPath, JSON.stringify(trackFiles, null, 2) + '\n');
console.log(`Updated ${indexPath} with ${trackFiles.length} track file(s)`);
