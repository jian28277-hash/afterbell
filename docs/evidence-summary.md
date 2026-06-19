# AFTERBELL Evidence Snapshot

This folder contains a sanitized evidence snapshot exported from the local AFTERBELL demo. It does not include API keys, passphrases, local database files, or private environment variables.

## Summary

- Generated at: 2026-06-19T23:09:43.085Z
- Evidence hash: `ed2edcd0678b7c444032ef552c2154d91a90646e723f7754fdf4a51a5d0c1e6a`
- Agent Hub calls: 1000
- Successful Agent Hub calls: 1000
- News briefing calls: 41
- Qwen/news-risk analyses: 146
- Strict analyses: 149
- Strict order records: 53
- Demo execution runs: 3
- Completed Demo round trips: 3

## Latest Bitget Demo Order Evidence

- Symbol: SAMSUNGUSDT
- Mode: bitget-demo
- Status: closed
- Open order ID: 1451853930349088768
- Close order ID: 1451854099752833024
- Leverage: 20x
- Close price: 232.02

## Files

- `evidence-snapshot.json`: sanitized machine-readable evidence exported from the demo.
- `submission.md`: project submission description and checklist.

## Verification Path

Run the app locally and open:

```text
http://127.0.0.1:3001/api/evidence
```

The live endpoint exports the full evidence payload from the current local SQLite audit log.
