# London Live Departures - Alexa Skill

This directory contains the backend Lambda code (`index.js`), APL visual layouts, and widget code for the London Live Departures Alexa Skill.

## Full Setup Instructions

To deploy this skill to your own Echo Show or Echo devices, follow these exact steps in the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask):

### 1. Skill Creation & Language
- Create a new skill and select **Alexa-Hosted (Node.js)**.
- Ensure your **Primary Locale** is set to **English (UK)**. *(Note: When testing in the simulator, the language dropdown MUST match English (UK), otherwise Amazon's generic traffic app might hijack your commands).*
- Turn off "Sync Locales" in Language Settings to prevent the simulator from freezing during builds.

### 2. Interfaces (Visuals & Widgets)
- In the **Build** tab, click **Interfaces** on the left menu.
- Turn ON **Alexa Presentation Language** (APL).
- Turn ON **Data Store Packages**.
- Turn ON **Data Store**.
- Click **Save Interfaces** and then **Build Model**.

### 3. Interaction Model (Voice Commands)
- Go to **Interaction Model** -> **Intents**.
- Create a new custom intent named `GetDeparturesIntent`.
- Add the following Sample Utterances (you can add more later):
  - `check my stations`
  - `what are my next trains`
  - `give me my departures`
- Click **Save Model** and **Build Skill**. Wait for the "Full Build Successful" notification.

### 4. Deploying the Code
- Go to the **Code** tab.
- Copy the entire contents of the `index.js` file from this repository.
- Paste it into the console's `index.js` editor, completely replacing the default code.
- Click **Save** and **Deploy**.

## Features Included
- **Visual Departure Board**: A fully functioning dark-mode APL screen designed for Echo Show. It renders the upcoming 5 trains or buses in a beautifully formatted scrolling list, matching the Windows desktop widget.
- **Simulator Bypass**: The web simulator does not supply a real GPS location, so the code contains a fallback to `SW1A 2JR` (Westminster Tube Station) to guarantee live test data. When used on a physical Echo device with Location Permissions granted, it automatically reads the device's real-world postcode!
- **TfL API Integration**: Uses the Transport for London unified API to grab the exact coordinates, find the closest `NaptanPublicBusCoachTram`, `NaptanMetroStation`, or `NaptanRailStation`, and query the `/Arrivals` endpoint.
