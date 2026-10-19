# Chatly — WhatsApp-style chat app with AI Assistant

One codebase for **Android (Play Store)** and **iOS (App Store)**, built with React Native (Expo).
Everything is real: SMS OTP login, real-time messaging, media storage, push notifications and an OpenAI assistant.
No voice or video calling (by design).

```
chatapp/
├── server/   Node.js + Express + Socket.IO + MongoDB  (deploy to Render)
└── app/      React Native (Expo SDK 54)               (build with EAS → stores)
```

## Features

| Area | What works |
|---|---|
| Login | Phone number + 6-digit OTP (real SMS via Twilio, or free log mode for testing), profile name + photo |
| Chats list | Pinned AI chat, last message preview, unread badges, ticks, "typing..." in list, search |
| Messaging | Text, emoji panel, reply to message, copy, delete for me, delete for everyone (48h) |
| Media | Photos, videos, documents (any file), voice notes, camera capture, full-screen viewer |
| Status | Sent ✓, Delivered ✓✓, Seen (blue ✓✓), typing..., online, last seen |
| Contacts | Finds which phone contacts are registered, or start a chat by number |
| Push | Notification when the app is closed/backgrounded; tap opens the chat |
| AI Assistant | Works with OpenAI, Groq (free) or Gemini (free): text, photos (vision models) and voice notes (transcribed) |
| Calls | Voice/video calling UX: outgoing + incoming call screens, ringing tone, call history tab, push for incoming calls |
| Safety (store requirement) | Block / unblock, report user, delete account |

---

## 0. Free testing setup (no paid service needed)

| Part | Free service | Limit to know |
|---|---|---|
| Database | MongoDB Atlas M0 | 512 MB storage |
| Media | Cloudinary free | ~25 GB/month, 10 MB per image |
| AI Assistant | **Groq** (default) or Gemini | Groq: text + voice notes, cannot see photos. Gemini: can see photos, ~20 requests/day |
| OTP | `OTP_PROVIDER=log` | Code is printed in server logs instead of SMS |
| Server hosting | Your PC, or Render free | Render free sleeps after 15 min idle (first request ~1 min) |
| Android app | EAS free plan | Limited builds per month, queue can be slow |
| Push | Expo + Firebase | Free |

iPhone testing needs an Apple Developer account ($99/year), so test on Android first.

**Steps**

1. **MongoDB Atlas:** create a free M0 cluster, a database user, allow `0.0.0.0/0`, copy the connection string.
2. **Cloudinary:** sign up, copy Cloud name, API key, API secret.
3. **Groq:** https://console.groq.com/keys → Create API key (no card needed).
4. **Server** (on your PC first):
   ```bash
   cd server
   npm install
   cp .env.example .env     # paste the keys; OTP_PROVIDER=log is already set
   npm run dev
   ```
5. **OTP in test mode:** enter your number in the app → the terminal prints
   `========== OTP for +923001234567: 482915 ==========` → type that code in the app.
   On Render, the same line appears in the service's **Logs** tab.
6. **Android app** (APK you can install and share with testers):
   ```bash
   cd app
   npm install
   npx expo install --fix
   npm install -g eas-cli
   eas login
   eas init
   ```
   In `eas.json` set `EXPO_PUBLIC_API_URL` of the **preview** profile:
   - server on your PC → `http://YOUR-PC-LAN-IP:5000` (phone on the same Wi-Fi; find the IP with `ipconfig`)
   - server on Render → `https://your-app.onrender.com`

   ```bash
   eas build --profile preview --platform android
   ```
   EAS gives a download link/QR for the APK. Install it on 2 phones and chat between them.
7. **Push notifications on Android (optional, free):** see "Push notification keys" in section 4. Without it, everything else works; only notifications are skipped.

**Free Render deploy (so testers outside your Wi-Fi can use it):** New → Web Service → connect the repo, root directory `server`, build `npm install`, start `npm start`, add the `.env` values, instance type **Free**.

**Switching to live later:** change `OTP_PROVIDER=twilio` and add the Twilio keys, optionally switch the AI to Gemini/OpenAI for photo understanding, and move Render to a paid plan. No app code changes needed.

---

## 1. Create the accounts for production

### MongoDB Atlas (database)
1. https://www.mongodb.com/atlas → create a free **M0** cluster.
2. Database Access → add a user + password.
3. Network Access → add `0.0.0.0/0` (Render IPs change).
4. Connect → Drivers → copy the connection string → this is `MONGODB_URI` (add `/chatly` before the `?`).

### Twilio Verify (SMS OTP)
1. https://www.twilio.com → sign up → copy **Account SID** and **Auth Token**.
2. Console → Verify → Services → **Create** → copy the **Service SID** (starts with `VA`).
3. Verify → **Geo permissions** → enable **Pakistan** (and any other countries your users are in).
4. **Important:** a trial account only sends SMS to numbers you verify in Twilio. Upgrade (add balance) before going live so OTP reaches every user.

### Cloudinary (photos, videos, voice notes, documents)
1. https://cloudinary.com → sign up → Dashboard → copy Cloud name, API key, API secret.
2. Settings → Security → turn on **"Allow delivery of PDF and ZIP files"** (otherwise PDFs won't open).

### AI Assistant
Any OpenAI-compatible API works; set `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_VISION`, `AI_TRANSCRIBE_MODEL` (examples for Groq, Gemini and OpenAI are in `server/.env.example`).
OpenAI `gpt-4o-mini` understands text, photos and voice notes; Groq is free but can't see photos.

---

## 2. Run the backend

```bash
cd server
npm install
cp .env.example .env      # fill in every value
npm run dev
```

Open `http://localhost:5000/health` → `{"ok":true,"db":true}`.

### Deploy to Render
1. Push the `server` folder to a GitHub repo.
2. https://render.com → New → **Web Service** → select the repo.
3. Build command `npm install`, start command `npm start`.
4. Add all values from `.env` under **Environment**.
5. Your API URL will look like `https://chatly-api.onrender.com`.

> Render's **free** plan sleeps after 15 minutes without traffic, which drops live connections and makes the first request slow. For real users use the **Starter** plan so the server stays awake.

---

## 3. Run the app on your phone

```bash
cd app
npm install
npx expo install --fix          # aligns every Expo package version
cp .env.example .env            # set EXPO_PUBLIC_API_URL (Render URL, or http://YOUR-PC-LAN-IP:5000)
npm install -g eas-cli
eas login
eas init                        # creates the EAS project and writes projectId into app.json
```

Push notifications, contacts and voice notes need a **development build** (Expo Go can't do push on Android):

```bash
eas build --profile development --platform android     # install the APK on your phone
npx expo start --dev-client
```

For iOS development builds you need an Apple Developer account (see below).

Before building, change the IDs in `app/app.json` if you want your own:
`ios.bundleIdentifier` and `android.package` (currently `com.hassaan.chatly`), and `name`.

---

## 4. Publish to the stores

Put your Render URL in `app/eas.json` → every `EXPO_PUBLIC_API_URL`.

### Push notification keys (one time)
- **Android:** Firebase console → create project → add Android app with the same package name → download `google-services.json` into the `app/` folder and add `"googleServicesFile": "./google-services.json"` inside the `android` block of `app.json`. Then run `eas credentials` → Android → Push Notifications → upload the FCM V1 service account key (Firebase → Project settings → Service accounts → Generate new private key).
- **iOS:** `eas build` creates the APNs key for you when asked.

### Google Play (one-time $25)
```bash
npm run build:android        # produces an .aab
npm run submit:android       # uploads to Play Console (first upload can be manual)
```
In Play Console fill: Data safety (phone number, photos/videos, audio, contacts), privacy policy URL, content rating, and the **App access** section (reviewer login — see below).

### Apple App Store ($99/year)
```bash
npm run build:ios
npm run submit:ios           # uploads to App Store Connect / TestFlight
```
In App Store Connect fill: privacy details, privacy policy URL, and **Sign-in information** for the reviewer.

### Reviewer login
Reviewers can't receive your SMS. While the app is in review, set in the server `.env`:
```
REVIEW_PHONE=+923001234567
REVIEW_CODE=123456
```
Give that number and code to Apple/Google in the review form. Remove both lines after approval.

### Requirements already handled
- Block user, report user (saved in the `reports` collection — check it at least daily), delete account.
- Permission messages for camera, photos, microphone and contacts.
- You still need to publish a **privacy policy page** (any website URL) before submitting.

---

## How real-time works (short)

- REST (`/api/...`) for login, history, uploads and sending; **Socket.IO** pushes new messages, ticks, typing and presence instantly.
- **Delivered** is set when the recipient's app is connected; **Seen** when they open the chat.
- The app disconnects in the background, so **online / last seen** are accurate, and messages that arrive meanwhile come as **push notifications**.
- Media uploads to Cloudinary first, then the message is sent with the file URL.

## Voice & video calls

- **What works today (including in Expo Go):** tap the call/video button in any chat header → the other phone rings with a full-screen incoming-call UI (ringtone + vibration) → accept/decline → call timer → call history in the **Calls** tab. Signaling runs over the existing Socket.IO connection; unanswered calls time out after 45 s and show as missed. Incoming calls also arrive as push notifications when the app is closed (tap to open).
- **Real voice & video (dev builds):** real-time audio/video uses **Agora** (`react-native-agora`, free 10,000 min/month), which needs the native module — it works in EAS dev builds, not in Expo Go. Without an Agora App ID (or in Expo Go) the app runs the same UX in clearly-labeled preview mode.

**Agora setup (free, ~5 minutes):**
1. Sign up at https://console.agora.io → **Create project** → choose **Testing mode** (App ID only, no token server needed for testing) → copy the **App ID**.
2. Put it in `app/.env`: `EXPO_PUBLIC_AGORA_APP_ID=your_app_id`.
3. For an EAS dev build, also add it to `eas.json` → `build.development.env` (env vars are baked into the build), with `EXPO_PUBLIC_API_URL` pointing at your server.
4. `eas login` → `eas build --profile development --platform android` → install the APK → `npx expo start --dev-client` → scan the QR with the installed dev app.
5. Call from a chat header: this time you will hear and see each other for real.

**How the code is organized:** `src/context/CallContext.js` owns signaling + call state, `src/calls/agora.js` lazily loads the native module (safe no-op in Expo Go), and `src/screens/CallScreen.js` renders video only when the engine is available. Swapping Agora for another provider later only touches `src/calls/agora.js`.

## Troubleshooting — "I added all the API keys but it still doesn't work"

| Symptom | Most likely cause | Fix |
|---|---|---|
| App shows "No internet connection" / nothing loads | The app is pointing at the wrong server URL | `eas.json` still has the placeholder `https://YOUR-API.onrender.com`. Replace it with your real Render URL (production profile) or your PC's LAN IP (preview profile), then rebuild. For `expo start`, set `EXPO_PUBLIC_API_URL` in `app/.env`. No trailing slash. |
| OTP code never arrives by SMS | `OTP_PROVIDER=log` (the free default) does not send SMS | The 6-digit code is printed in the server terminal / Render **Logs** tab. Enter it manually. For real SMS set `OTP_PROVIDER=twilio` + the three Twilio keys (trial accounts only text verified numbers). |
| Login works, but messages never arrive / "Connecting..." forever | Socket can't reach the server | Same URL problem as above. Also make sure Render's free instance has woken up (first request after idle takes ~1 min). |
| AI assistant always replies "having trouble" | Wrong `AI_VISION` / wrong model for the provider | Groq: use `AI_MODEL=llama-3.3-70b-versatile` and keep `AI_VISION=false` (Groq llama can't see images). Gemini/OpenAI vision models: set `AI_VISION=true`. An invalid `AI_API_KEY` causes the same message — check the server logs for `AI reply failed`. |
| Photos / videos fail to send | Cloudinary rejected the upload | Free Cloudinary allows **10 MB per image** (100 MB per video). Bigger images fail. Also verify `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — a typo gives "Upload failed". |
| No push notifications | Token never registered | Push needs `eas init` (so the app has an EAS `projectId`) and, for Android production builds, Firebase Cloud Messaging credentials in EAS. Without them the app silently skips notifications — everything else still works. |
| Server exits with "Missing environment variables" | `.env` incomplete | Copy `server/.env.example` to `server/.env` and fill **every** value (on Render: add them in the service's Environment tab). |

## API summary

| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/send-otp | Send SMS code |
| POST | /api/auth/verify-otp | Verify code → JWT |
| GET/PATCH/DELETE | /api/users/me | Profile / delete account |
| POST/DELETE | /api/users/me/avatar | Profile photo |
| POST | /api/users/sync | Match phone contacts |
| GET | /api/users/lookup?phone= | Find user by number |
| POST/DELETE | /api/users/:id/block | Block / unblock |
| POST | /api/users/:id/report | Report user |
| GET/POST | /api/conversations | List / open chat |
| GET | /api/conversations/ai | AI assistant chat |
| GET/POST/DELETE | /api/conversations/:id/messages | History / send / clear chat |
| GET | /api/conversations/:id/media | Shared photos & videos |
| DELETE | /api/messages/:id?scope=me\|everyone | Delete message |
| POST | /api/media/upload | Upload file |

Socket events: `message:new`, `message:status`, `message:deleted`, `typing`, `presence`, `conversation:read` (server → app); `typing`, `messages:seen` (app → server).
