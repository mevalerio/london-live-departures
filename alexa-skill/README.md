# London Live Departures - Alexa Skill Backend

This directory contains the AWS Lambda backend for the London Live Departures Alexa skill.

## Current Status
The code successfully fetches the user's device address, uses `postcodes.io` to get coordinates, and hits the TfL API for the closest stops within a 1-mile radius.

## Next Steps
- Implement APL (Alexa Presentation Language) to render the visual departures board on Echo Show devices.
- Configure an Alexa Widget so the departure board stays persistently on the user's screen.
