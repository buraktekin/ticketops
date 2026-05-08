# 🦅 ticketops

> 24/7 concert ticket monitor with WhatsApp alerts and auto-reservation.  
> Built for Biletix (Turkey). Runs on your laptop overnight.

---

## What it does

1. **Monitors** Biletix artist pages every 45 seconds (configurable)
2. **Detects** when sold-out events become available, or new dates appear
3. **Confirms** with Claude Vision to eliminate false positives
4. **Alerts** your WhatsApp group instantly
5. **Reserves** up to 10 tickets automatically — without purchasing

---

## Stack

| Layer        | Tool                  | Why                                              |
|--------------|-----------------------|--------------------------------------------------|
| Scraping     | Playwright (Chromium) | Handles Angular SPAs, reuses your login session  |
| AI confirm   | Claude claude-opus-4-5 (Vision) | Prevents false positives from DOM glitches     |
| Messaging    | whatsapp-web.js       | Uses your actual WhatsApp — no Twilio needed     |
| Process mgmt | pm2                   | Keeps monitor running 24/7 on your laptop        |
| Logging      | Winston               | File + console, rotated                          |

---

## Project layout

```
ticketops/
├── src/
│   ├── monitor/
│   │   ├── index.js      # Main poll loop — orchestrates everything
│   │   ├── poller.js     # Playwright browser management + page loading
│   │   └── detector.js   # Pure DOM diff logic (no side effects)
│   ├── ai/
│   │   ├── index.js      # Claude Vision confirmation calls
│   │   └── prompts.js    # All prompt templates in one place
│   ├── notifier/
│   │   ├── index.js      # Notification orchestrator
│   │   └── whatsapp.js   # whatsapp-web.js client + QR auth
│   ├── reserver/
│   │   ├── index.js      # Reservation orchestrator
│   │   └── biletix.js    # Biletix-specific click-through automation
│   ├── config/
│   │   └── index.js      # Env loading + targets.json loader
│   └── utils/
│       ├── logger.js     # Winston logger
│       ├── retry.js      # Exponential backoff retry
│       └── screenshot.js # Screenshot capture + pruning
├── scripts/
│   ├── setup.js          # Interactive first-run wizard
│   ├── login.js          # Save Biletix browser session
│   ├── list-groups.js    # Find your WhatsApp group ID
│   └── test-notify.js    # Send a test WhatsApp message
├── storage/              # Runtime state, sessions, screenshots (gitignored)
├── logs/                 # Log files (gitignored)
├── targets.example.json  # Template — copy to targets.json
├── .env.example          # Template — copy to .env
└── ecosystem.config.cjs  # pm2 config
```

---

## Setup

### Prerequisites

- Node.js 18+
- npm
- A Biletix account (for the reservation step)
- Your phone nearby (to scan WhatsApp QR on first run)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/ticketops.git
cd ticketops
npm install
npx playwright install chromium
```

### 2. Run the setup wizard

```bash
npm run setup
```

This creates `.env` and `targets.json` from your answers.  
You can also copy the example files manually:

```bash
cp .env.example .env
cp targets.example.json targets.json
```

### 3. Log into Biletix

Opens a real browser window so you can log in manually.  
The session is saved and reused by the monitor — no login headaches.

```bash
npm run login
```

### 4. Connect WhatsApp

On first run, a QR code appears in the terminal. Scan it with WhatsApp on your phone.

```bash
npm run list-groups   # prints all groups + IDs
```

Copy your group's ID into `.env` as `WHATSAPP_GROUP_ID`, then verify:

```bash
npm run test-notify   # sends a test message to your group
```

### 5. Add your targets

Edit `targets.json`:

```json
[
  {
    "id":               "sebnem-ferah-istanbul",
    "name":             "Şebnem Ferah",
    "url":              "https://www.biletix.com/etkinlik/SEBNEMKCK/ISTANBUL/tr",
    "enabled":          true,
    "ticketsToReserve": 10
  }
]
```

### 6. Start monitoring

```bash
# Run in terminal (Ctrl+C to stop)
npm start

# Run in background via pm2 (survives terminal close)
npm install -g pm2
npm run pm2:start
npm run pm2:logs     # tail logs
npm run pm2:stop     # stop
```

---

## Configuration

All options live in `.env`:

| Variable              | Default | Description                                              |
|-----------------------|---------|----------------------------------------------------------|
| `ANTHROPIC_API_KEY`   | —       | Your Anthropic API key                                   |
| `WHATSAPP_GROUP_ID`   | —       | Target group ID (from `npm run list-groups`)             |
| `POLL_INTERVAL_MS`    | 45000   | How often to check each page (ms)                       |
| `MAX_RETRIES`         | 3       | Page load retries before skipping a cycle               |
| `AUTO_RESERVE`        | true    | Whether to auto-reserve tickets on detection             |
| `MAX_TICKETS`         | 10      | Max tickets to add to cart per event                    |
| `USE_AI_CONFIRMATION` | true    | Use Claude Vision to confirm before alerting             |
| `LOG_LEVEL`           | info    | `debug` / `info` / `warn` / `error`                    |

---

## How detection works

```
Playwright loads page
        ↓
Extract all .performance-listing elements
        ↓
Compare with stored snapshot (storage/state.json)
        ↓
Change? ──────────────────────────────────────────┐
  - .sold-out class removed on existing event      │
  - New event row appeared without .sold-out        │
                                                   ↓
                               Claude Vision confirms (screenshot)
                                                   ↓
                                        Send WhatsApp alert
                                                   ↓
                                  Playwright reserves tickets
                                  (adds to cart, no purchase)
```

---

## Adding new ticket platforms

Each platform is an isolated adapter. To add, say, Ticketmaster DE:

1. Create `src/reserver/ticketmaster-de.js` with the same interface as `biletix.js`
2. Add a `platform` field to targets: `"platform": "ticketmaster-de"`
3. Update `src/reserver/index.js` to route by platform

The monitor, AI, and notifier modules stay completely unchanged.

---

## Logs

```
logs/combined.log   # all logs
logs/error.log      # errors only
logs/out.log        # stdout (pm2)
```

Screenshots on detection events: `storage/screenshots/`  
(auto-pruned, keeps last 20)

---

## Known limitations

- **Biletix ToS**: Automation violates their terms of service. Use at your own risk.
- **Anti-bot**: Heavy scraping may get your IP or account flagged. The 45s interval is conservative by design.
- **Session expiry**: If Biletix logs you out, re-run `npm run login`.
- **WhatsApp ToS**: `whatsapp-web.js` uses an unofficial API. Rare risk of account action.
- **Cart hold**: Reserved tickets are held ~15 minutes. You must purchase within that window.

---

## License

MIT
