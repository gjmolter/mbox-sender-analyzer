More about it [here](https://gabrielmolter.com/en/blog/pursuing-data-ownership).

# Mailbox Analyzer

A lightweight, browser-based tool for inspecting `.mbox` files, no matter how huge. Drop a file, parse it, and interactively explore which domains and individual senders contact you most often, all locally on your device. File is never saved or uploaded anywhere other than your own device.

## Getting Started

```bash
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## Usage Tips

- Drag a `.mbox` file into the dropzone.
- Configure filters: date range, subdomain grouping, excluded domains, etc. Filters persist via `localStorage`.
- Export the filtered domain list or the full aggregated dataset

---

Note: Most of this was vibe-coded. 😬
