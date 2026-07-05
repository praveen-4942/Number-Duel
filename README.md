# Number Duel

A production-ready real-time multiplayer secret-number duel built with React, TypeScript, Tailwind CSS, Framer Motion, Firebase Anonymous Auth, Realtime Database, and Firebase Cloud Functions.

## Why Cloud Functions are included

Secrets are never readable by clients. The frontend calls Firebase Functions for room creation, joining, readiness, rematches, and guesses. Functions store private secrets under `privateRooms`, validate number length and duplicate digits, calculate clues server-side, and publish only public state and each player's private guess history.

## Local setup

1. Install dependencies:
   ```bash
   npm install
   npm --prefix functions install
   ```
2. Copy `.env.example` to `.env.local` and fill in your Firebase web app config.
3. Build functions:
   ```bash
   npm run functions:build
   ```
4. Run the frontend:
   ```bash
   npm run dev
   ```

## Deploy

1. Deploy the Firebase backend:
   ```bash
   firebase deploy --only database,functions
   ```
2. Deploy the frontend to Vercel. Set the same `VITE_FIREBASE_*` variables in the Vercel project.

## Features

- Exactly two-player online rooms with 6-character codes
- Anonymous auth and reconnect-friendly room membership
- Server-side validation and server-side clue generation
- Hidden secrets, private guess histories, public turn and room status
- Classic, Advanced, and Bulls & Cows clue modes
- 3, 4, 5, or 6 digit numbers with no repeated digits
- Rematch, reactions, sound effects, timer, stats, history, ping, light/dark mode, spectator mode
- 60-second disconnect grace period with automatic cleanup
