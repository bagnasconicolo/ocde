const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

// Ensure base data directories exist before handling uploads
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const imagesBase = path.join(DATA_DIR, 'images');
if (!fs.existsSync(imagesBase)) {
  fs.mkdirSync(imagesBase, { recursive: true });
}

// Create default JSON files if they don't exist to prevent read errors
const ensureFile = (file, fallback) => {
  const full = path.join(DATA_DIR, file);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, fallback);
  }
};
ensureFile('sites.json', '[]');
ensureFile('track_index.json', '[]');
ensureFile('samples.json', '[]');

app.use(express.json());
// No session or authentication required

// Authentication middleware
function requireAuth(req, res, next) {
  // Authentication removed; all requests are allowed
  return next();
}


// Serve static files
app.use(express.static(__dirname));
// Also expose the data directory so uploaded files are accessible when
// DATA_DIR is outside the repository root
app.use('/data', express.static(DATA_DIR));

// Helper to read/write JSON
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));

/* ----- CONFIG ENDPOINT ----- */
app.get('/api/data-dir', requireAuth, (req, res) => {
  res.json({ dataDir: DATA_DIR });
});

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
  let index = readJson('track_index.json');
  if (Array.isArray(index)) {
    index = index.map((t) =>
      typeof t === 'string'
        ? { file: t, title: '', description: '', unit: 'usv' }
        : { unit: t.unit || 'usv', ...t }
    );
  } else {
    index = [];
  }
  res.json(index);
});

const trackStorage = multer({ dest: DATA_DIR });
app.post('/api/tracks', requireAuth, trackStorage.single('file'), (req, res) => {
  let index = readJson('track_index.json');
  if (!Array.isArray(index)) index = [];
  const filePath = `data/${req.file.filename}.rctrk`;
  fs.renameSync(req.file.path, path.join(DATA_DIR, path.basename(filePath)));
  const entry = {
    file: filePath,
    title: req.body.title || '',
    description: req.body.description || '',
    unit: req.body.unit || 'usv'
  };
  index.push(entry);
  writeJson('track_index.json', index);
  res.json({ ok: true, file: filePath });
});

app.put('/api/tracks', requireAuth, (req, res) => {
  const { file, title = '', description = '', unit = 'usv' } = req.body;
  let index = readJson('track_index.json');
  if (!Array.isArray(index)) index = [];
  index = index.map((t) => {
    if ((typeof t === 'string' ? t : t.file) === file) {
      return { file, title, description, unit };
    }
    return t;
  });
  writeJson('track_index.json', index);
  res.json({ ok: true });
});

app.delete('/api/tracks', requireAuth, (req, res) => {
  const { file } = req.body;
  let index = readJson('track_index.json');
  if (!Array.isArray(index)) index = [];
  index = index.filter((t) => (typeof t === 'string' ? t : t.file) !== file);
  if (fs.existsSync(path.join(__dirname, file))) {
    fs.unlinkSync(path.join(__dirname, file));
  }
  writeJson('track_index.json', index);
  res.json({ ok: true });
});

/* ----- SAMPLE ENDPOINTS ----- */
app.get('/api/samples', requireAuth, (req, res) => {
  res.json(readJson('samples.json'));
});

app.post('/api/samples', requireAuth, (req, res) => {
  const samples = readJson('samples.json');
  const sample = req.body;
  const idx = samples.findIndex((s) => s.id === sample.id);
  if (idx >= 0) samples[idx] = sample; else samples.push(sample);
  writeJson('samples.json', samples);
  res.json({ ok: true });
});

app.delete('/api/samples/:id', requireAuth, (req, res) => {
  const id = req.params.id;
  let samples = readJson('samples.json');
  samples = samples.filter((s) => s.id !== id);
  writeJson('samples.json', samples);
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

app.delete('/api/images/:siteId/:imageName', requireAuth, (req, res) => {
  const { siteId, imageName } = req.params;
  const filename = path.basename(imageName);
  const filePath = path.join(DATA_DIR, 'images', siteId, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const sites = readJson('sites.json');
  const site = sites.find((s) => s.id === siteId);
  if (site && Array.isArray(site.images)) {
    const rel = `data/images/${siteId}/${filename}`;
    const idx = site.images.indexOf(rel);
    if (idx >= 0) {
      site.images.splice(idx, 1);
      if (Array.isArray(site.captions)) site.captions.splice(idx, 1);
      writeJson('sites.json', sites);
    }
  }
  res.json({ ok: true });
});

/* ----- SAMPLE IMAGE UPLOAD ----- */
app.post('/api/samples/:sampleId/images', requireAuth, imageStorage.single('image'), (req, res) => {
  const sampleId = req.params.sampleId;
  const dir = path.join(DATA_DIR, 'images', 'samples', sampleId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(req.file.originalname);
  const dest = path.join(dir, req.file.filename + ext);
  fs.renameSync(req.file.path, dest);
  res.json({ ok: true, file: `data/images/samples/${sampleId}/${path.basename(dest)}` });
});

app.delete('/api/samples/:sampleId/images/:imageName', requireAuth, (req, res) => {
  const { sampleId, imageName } = req.params;
  const filename = path.basename(imageName);
  const filePath = path.join(DATA_DIR, 'images', 'samples', sampleId, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  const samples = readJson('samples.json');
  const sample = samples.find((s) => s.id === sampleId);
  if (sample && Array.isArray(sample.images)) {
    const rel = `data/images/samples/${sampleId}/${filename}`;
    const idx = sample.images.indexOf(rel);
    if (idx >= 0) {
      sample.images.splice(idx, 1);
      writeJson('samples.json', samples);
    }
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Using data directory: ${DATA_DIR}`);
});
