# @interview-assistant/mentor — build-phase watcher

Local CLI that watches a project directory while the candidate
implements their plan, captures file-save events, and ships them
to the Interview Assistant backend in batches.

## Install

The CLI isn't published to npm yet; for v1 we use `npm link`:

```bash
cd cli
npm install
npm run build
npm link
```

After that, `mentor` is on your `$PATH`. Verify with `which mentor`.

## Usage

The web app's "Start build phase" button issues a one-time token.
Run from the project directory you're implementing in:

```bash
mentor watch <TOKEN> [--cwd .] [--server http://localhost:3000] [--duration 60]
```

While running, the CLI:

- Watches the working directory with chokidar (ignores
  `node_modules/`, `.git/`, `dist/`, build artifacts, anything
  matching `.gitignore`).
- Buffers events to `~/.mentor/buffer.sqlite` so a network blip
  never loses data.
- Flushes batches of up to 100 events to the backend every 30s,
  with exponential backoff on failure.
- Auto-finishes after `--duration` minutes, on `mentor finish`,
  or on `Ctrl-C`.

Stop manually:

```bash
mentor finish    # flushes remaining buffer + marks the session done
```

Inspect local state without touching the network:

```bash
mentor status
```

## Local state

- `~/.mentor/session.json` — `{ token, sessionId, server }` from
  the most recent `watch` call.
- `~/.mentor/buffer.sqlite` — append-only event buffer. Rows are
  marked `sent=1` once the backend has acknowledged them.

## Development

```bash
npm run dev -- watch <TOKEN>   # ts-node, no build step
npm run build                  # tsc → dist/
npm test                       # jest, silent
```
