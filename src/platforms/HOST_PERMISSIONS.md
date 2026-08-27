# Host permissions

The chromium/safari/firefox manifests grant `https://*/*`, plus `http://localhost/*` and `http://127.0.0.1/*`. Content-script injection and `web_accessible_resources` use the same three patterns rather than `<all_urls>`.

Why these three:

- HTTPS is where signed content lives. Verification needs SubtleCrypto, which is only available on a secure context, so the extension cannot verify a plain-HTTP page anyway.
- The local development servers and the e2e simulation harness run on `http://localhost:3000` and `http://localhost:8080`. Chrome host patterns ignore the port, so `http://localhost/*` covers every local port. `127.0.0.1` is listed separately because Chrome treats it as a distinct host, not an alias.

What was dropped and why:

- `http://*/*` gave the extension read and inject access to every plaintext HTTP site on the web. Nothing in the verification path used it: the verifier's key and directory fetches have always required HTTPS (`createVerifierFetch`), and the crypto needs a secure context. It was permission the extension asked for and never spent.
- `<all_urls>` in `content_scripts` and `web_accessible_resources` additionally covered `file://`, `ftp://`, and extension-internal schemes.

If you add a dev origin on some other host, add that specific pattern. Do not widen back to `http://*/*`.
