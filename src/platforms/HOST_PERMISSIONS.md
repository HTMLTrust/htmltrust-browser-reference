# Host permissions: HTTP + HTTPS

The chromium/safari/firefox manifests grant host permissions for `https://*/*` **and** `http://*/*`. This is deliberate.

- The extension works against local development servers and the e2e simulation harness, which run plain-HTTP origins.
- Production HTMLTrust deployments are HTTPS by convention, but the protocol does not require it; the verification logic itself is transport-agnostic.

If you tighten this to HTTPS-only, the local dev workflow and the e2e tests stop working.
