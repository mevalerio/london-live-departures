# London Live Departures

A beautiful, frameless desktop widget built with **Electron** and **Vanilla JS** that brings the live transport boards of London (and National Rail) straight to your desktop.

<div align="center">
  <a href="https://github.com/mevalerio/london-live-departures/releases/latest/download/London.Live.Departures.Setup.exe">
    <img src="https://img.shields.io/badge/Download_for_Windows-.exe-007aff?style=for-the-badge&logo=windows" alt="Download .exe" />
  </a>
</div>

## 🛠️ How to Set It Up (For Users)

1. **Download**: Click the download button above to get the latest `.exe` installer.
2. **Install**: Double-click the downloaded file. 
   *(Note: Windows SmartScreen might show a warning since the app isn't signed. Click **"More Info"** -> **"Run anyway"**).*
3. **Run**: The widget will seamlessly appear on your desktop.
4. **Configure**: Click the **⚙️ Gear Icon** in the widget to open Settings:
   - Enter your **UK Postcode** for pinpoint street-level accuracy.
   - Adjust the search **Radius** (0.5 to 5 miles).
   - Set how often you want the live departure boards to refresh.

---

## ✨ Features
- **True Desktop Widget:** Runs as a frameless, transparent glassmorphic window hovering over your desktop.
- **TfL Unified API:** Fetches accurate, live arrival boards for nearby Tube, Bus, DLR, and Overground stations.
- **National Rail (Huxley 2):** Intelligently falls back to the open Huxley 2 API to give you live National Rail departures (including active delay and cancellation statuses).
- **Auto-Location:** Uses built-in HTML5 Geolocation (or IP location fallback) to automatically find the transport links closest to you.
- **Maximum Precision:** Allows you to override your location using a UK Postcode for pinpoint street-level accuracy via the free `postcodes.io` API.

## 🚀 Quick Start (Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/london-live-departures.git
   cd london-live-departures
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Run the widget:**
   ```bash
   npm start
   ```

## 📦 Packaging for Production

If you want to build a standalone executable `.exe` (or Mac `.dmg` / Linux AppImage) that anyone can install and run without needing Node.js:

1. **Run the builder:**
   ```bash
   npm run build
   ```
2. **Find the installer:**
   Look inside the newly created `dist/` directory. You will find a `London Live Departures Setup.exe` ready to be distributed!

## ⚙️ Configuration
The widget allows you to configure its behavior directly from its UI:
- **Radius:** Change how far the widget looks for stations (0.5 to 5 miles).
- **Auto-Refresh:** Set how often the live departure boards should update.
- **Postcode Override:** Type a UK postcode (e.g., `SW1A 1AA`) to anchor the widget to a specific location.

## 📄 License
MIT License
