# OCDE Site

A web interface and data management platform for the OCDE (Observatory for Citizen-Driven Environmental monitoring) project by the CHARM team at the University of Turin.

## About

This repository contains the complete web application for visualizing and managing radiation measurement data from geological sites. The platform enables:

- **Interactive mapping** of geological measurement sites
- **Data visualization** of radiation measurements and spectra
- **Site management** with detailed information, images, and references
- **Track data handling** for RadiaCode instrument measurements
- **Science communication** tools for educational outreach

The project is part of a science education initiative focused on bridging academic research with public engagement, creating immersive exhibits and multimedia experiences to promote critical thinking through hands-on experiments.

## Features

- Web-based interface for site and measurement data management
- Interactive maps with geological site information
- Support for RadiaCode track file uploads and processing
- Image gallery management for each site
- Admin dashboard for data management
- JSON-based data storage with configurable data directory

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/bagnasconicolo/ocde.git
   cd ocde
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`.

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

## Contributing

This project is developed by the CHARM team at the University of Turin as part of their science education and public outreach mission. Contributions are welcome!

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Team

Developed by CHARM - a dynamic, student-driven initiative within the Department of Physics at the University of Turin, dedicated to advancing innovation in science education and public outreach.
