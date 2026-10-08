# London Live Departures

<div align="center">
  <img src="assets/hero-icon-vf.jpg" width="150" alt="London Live Departures Logo" />
</div>

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


## 🎙️ Alexa Skill & Echo Show Widget

A fully functional Alexa Skill and Visual APL Widget for Amazon Echo Show devices has been added to this repository! 

The skill is built specifically for Echo Show devices and provides a seamless "one-shot" commuting experience.

### 🌟 Alexa Features
- **One-Shot Voice Command:** Simply say `"Alexa, open London Departures"` as you walk out the door. The skill instantly fetches the data, speaks the absolute closest train/bus, displays the live visual board, and closes itself. No conversation required!
- **GPS Device Location:** Integrates directly with the Alexa Device Address API to silently grab your Echo Show's physical GPS location.
- **Top 3 Smart Grouping:** Scans a 2000-meter radius, finds the top 3 closest transport hubs (mixing Tube, Bus, and Rail), and elegantly groups their live arrivals under distinct headers (e.g. `Westminster (Platform 1)` or `Parliament Square (Stop C)`).
- **Echo Show Widget:** Fully supports the Amazon Echo Show Widget Gallery! Pin it directly to your home screen. It uses the `Alexa.DataStore.PackageManager` API to silently push live departure updates to the background widget without you needing to open the app.

### 📁 Structure
All Alexa-related code is located in the `alexa-skill/` folder:
- `index.js`: The core AWS Lambda backend that handles voice intents, fetches TfL APIs concurrently (via `Promise.all` to prevent timeouts), and structures the visual data.
- `skill-package/`: Contains the official Alexa Skill Manifest (`skill.json`), interaction models, and the APL layouts for the visual responses and the home screen widget.