# London Live Departures - Alexa Skill & Echo Show Widget

This directory contains the backend Lambda code (`index.js`), APL visual layouts, DataStore packages, and widget definitions for the London Live Departures Alexa Skill.

---

## 🌟 Overview & Key Architecture

The skill provides two synchronized commuting experiences for Amazon Echo Show devices:
1. **One-Shot Voice & Display Response:** Say *"Alexa, open London Departures"* to immediately hear the next upcoming departure and view a dark-mode APL departure board on screen.
2. **Ambient Echo Show Widget:** A medium home screen widget (`WIDGET_M`) that stays pinned to your Echo Show dashboard, receiving live countdowns directly via Amazon's **DataStore REST API** without needing to open the full skill.

```
┌────────────────────────┐         ┌─────────────────────────┐
│     Physical Device    │         │       Alexa Backend     │
│  (Echo Show 8/10/15)   │         │     (Node.js Lambda)    │
└───────────┬────────────┘         └────────────┬────────────┘
            │                                   │
            │ 1. "Alexa, open London Departures"│
            ├──────────────────────────────────►│
            │                                   │ 2. Read GPS/Postcode via Device Address API
            │                                   │ 3. Fetch TfL Arrivals concurrently
            │ 4. Voice SSML + APL Board Screen  │
            │◄──────────────────────────────────┤
            │                                   │ 5. LWA OAuth 2.0 Auth (scope: alexa::datastore)
            │                                   │ 6. POST /v1/datastore/commands (target: USER)
            │ 7. Local DataStore Dispatched     │
            │◄──────────────────────────────────┘
            │
            ▼
┌────────────────────────┐
│  London Departures     │
│  Home Screen Widget    │
│  [Station Name]        │
│  68 to West Norwood Due│
│  322 to Clapham   2 min│
│  [REFRESH] Button      │
└────────────────────────┘
```

---

## 🧩 Echo Show Widget & DataStore Architecture

### 1. DataStore Extension & APL Document Binding
The widget template is defined in [`skill-package/dataStorePackages/DepartureWidget/documents/document.json`](file:///home/valerio/london-live-departures/alexa-skill/skill-package/dataStorePackages/DepartureWidget/documents/document.json):
- **Extension URI:** `alexaext:datastore:10`
- **Data Binding:**
  ```json
  "settings": {
    "DataStore": {
      "dataBindings": [
        {
          "namespace": "LondonDepartures",
          "key": "liveBoard",
          "dataBindingName": "liveBoard",
          "dataType": "object"
        }
      ]
    }
  }
  ```
- **Parameter Scoping (No Shadowing):** The template parameter is named `defaultPayload` (from `datasources/default.json`), completely separate from `liveBoard`. This prevents APL lexical parameter shadowing and ensures real-time DataStore pushes update the screen immediately.
- **Fallback Expressions:**
  - Station: `${liveBoard.stationName ? liveBoard.stationName : defaultPayload.stationName}`
  - Arrivals: `${liveBoard.arrivals ? liveBoard.arrivals : defaultPayload.arrivals}`

### 2. DataStore REST API Push
- When the skill is opened via voice, or when the widget's blue **REFRESH** button is tapped, the backend dispatches updates via:
  ```text
  POST https://api.eu.amazonalexa.com/v1/datastore/commands
  ```
- **Authentication:** Requires a Login with Amazon (LWA) OAuth 2.0 Client Credentials token (`grant_type=client_credentials`, `scope=alexa::datastore`).
- **Targeting:** Uses `{ "type": "USER", "id": userId }` to broadcast updates across all widget-capable Echo Show devices registered to the Amazon account simultaneously.
- **Payload Shape:** Includes both top-level and `.properties` objects for 100% compatibility with all APL data binding patterns:
  ```json
  {
    "type": "PUT_OBJECT",
    "namespace": "LondonDepartures",
    "key": "liveBoard",
    "content": {
      "stationName": "Lancaster Avenue",
      "arrivals": [ ... ],
      "properties": {
        "stationName": "Lancaster Avenue",
        "arrivals": [ ... ]
      }
    }
  }
  ```

---

## 🚀 Deployment Instructions

### Method A: Alexa-Hosted Skills Git Deploy (Recommended)
Alexa-Hosted Skills are backed by an AWS CodeCommit repository:

1. **Clone the Alexa-Hosted Repo:**
   ```bash
   git clone https://git-codecommit.us-east-1.amazonaws.com/v1/repos/<SKILL_ID> LondonDepartures
   ```
2. **Synchronize Code & Skill Package:**
   Copy `alexa-skill/index.js` to `lambda/index.js` and `alexa-skill/skill-package/` to `skill-package/`.
3. **Commit & Deploy:**
   ```bash
   git add .
   git commit -m "Deploy latest departures skill & widget"
   git push origin master
   ```
   CodeCommit triggers AWS CodeBuild, builds the interaction models, and deploys the Lambda function to the `development` stage.

### Method B: Alexa Developer Console
1. **Enable Interfaces:**
   - In the Developer Console, turn ON **Alexa Presentation Language (APL)**, **Data Store Packages**, and **Data Store**.
2. **Update Code:**
   - In the **Code** tab, paste `alexa-skill/index.js` and ensure dependencies (`ask-sdk-core`, `axios`) are in `package.json`.
   - Click **Save** and **Deploy**.
3. **Add Widget:**
   - Upload the `DepartureWidget` package from `skill-package/dataStorePackages/DepartureWidget/` under Data Store Packages.

---

## 🧪 Testing

### 1. Echo Show Widget Test
- **Home Screen:** The widget displays live departures for your nearest stop.
- **Refresh Button:** Tap the blue **`REFRESH`** button in the top-right corner to fetch fresh arrivals from TfL.

### 2. Voice Test
- Say: *"Alexa, open London Departures"*
- Alexa announces the next departure and displays the full dark-mode departure board.

### 3. CLI Simulation
```bash
ask smapi simulate-skill \
  -s amzn1.ask.skill.19cd4449-6c06-453f-b6a8-c91b2cd3823c \
  -g development \
  --input-content "open london departures" \
  --device-locale en-GB \
  --session-mode FORCE_NEW_SESSION
```
