const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

app.use(express.json());
// No session or authentication required

// Authentication middleware
function requireAuth(req, res, next) {
  // Authentication removed; all requests are allowed
  return next();
}


// Serve static files
app.use(express.static(__dirname));

// Helper to read/write JSON
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));

/* ----- SITE ENDPOINTS ----- */
app.get('/api/sites', requireAuth, (req, res) => {
  res.json(readJson('sites.json'));
});

app.post('/api/sites', requireAuth, (req, res) => {
  const sites = readJson('sites.json');
  const site = req.body;
  const idx = sites.findIndex((s) => s.id === site.id);
  if (idx >= 0) sites[idx] = site; else sites.push(site);
  writeJson('sites.json', sites);
  res.json({ ok: true });
});

app.delete('/api/sites/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  let sites = readJson('sites.json');
  sites = sites.filter((s) => s.id !== id);
  writeJson('sites.json', sites);
  res.json({ ok: true });
});

/* ----- TRACK ENDPOINTS ----- */
app.get('/api/tracks', requireAuth, (req, res) => {
  res.json(readJson('track_index.json'));
});

const trackStorage = multer({ dest: DATA_DIR });
app.post('/api/tracks', requireAuth, trackStorage.single('file'), (req, res) => {
  const index = readJson('track_index.json');
  const filePath = `data/${req.file.filename}.rctrk`;
  fs.renameSync(req.file.path, path.join(DATA_DIR, path.basename(filePath)));
  index.push(filePath);
  writeJson('track_index.json', index);
  res.json({ ok: true, file: filePath });
});

app.delete('/api/tracks', requireAuth, (req, res) => {
  const { file } = req.body;
  const index = readJson('track_index.json').filter((f) => f !== file);
  if (fs.existsSync(path.join(__dirname, file))) fs.unlinkSync(path.join(__dirname, file));
  writeJson('track_index.json', index);
  res.json({ ok: true });
});

/* ----- IMAGE UPLOAD ----- */
const imageStorage = multer({ dest: path.join(DATA_DIR, 'images') });
app.post('/api/images/:siteId', requireAuth, imageStorage.single('image'), (req, res) => {
  const siteId = req.params.siteId;
  const dir = path.join(DATA_DIR, 'images', siteId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(req.file.originalname);
  const dest = path.join(dir, req.file.filename + ext);
  fs.renameSync(req.file.path, dest);
  res.json({ ok: true, file: `data/images/${siteId}/${path.basename(dest)}` });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
