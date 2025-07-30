# OCDE Site

This repository contains the web interface and scripts for the OCDE project.

## Data Directory

The application uses a `data` folder to store uploaded tracks, images and JSON configuration files. By default the scripts expect this folder to be located at `path.join(__dirname, 'data')` relative to each script.

The server exposes the path it is using via the `/api/data-dir` endpoint. The Admin Dashboard displays this value so you can confirm where files are being saved.

You can override this location by defining the `DATA_DIR` environment variable when running the server or the update scripts. This allows you to keep your local data outside of the repository. For example:

```bash
DATA_DIR=/path/to/my-data npm start
```

To generate indexes manually:

```bash
DATA_DIR=/path/to/my-data node update_site_images.js
DATA_DIR=/path/to/my-data node update_track_index.js
```

Add your custom `data` directory to `.gitignore` so it is not committed. The repository's `.gitignore` already excludes `data/` by default.
