const SHARED_STYLES = `
    @font-face {
      font-family: "Recoleta";
      src: url("/fonts/Recoleta-Regular.otf") format("opentype");
      font-weight: 400;
      font-display: swap;
    }

    @font-face {
      font-family: "Block Berthold";
      src: url("/fonts/BlockBerthold.otf") format("opentype");
      font-weight: 400;
      font-display: swap;
    }

    :root {
      --bg: #040507;
      --ink: #d7e6f4;
      --ink-dim: rgba(215, 230, 244, 0.55);
      --ink-line: rgba(215, 230, 244, 0.22);
      --red: #ff6b6b;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--bg);
      color: var(--ink);
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    body {
      position: relative;
      display: grid;
      place-items: center;
      padding: clamp(1.5rem, 5vw, 4rem);
      overflow-x: hidden;
    }

    body::before {
      content: "";
      position: fixed;
      inset: 0;
      background-image: url("/black-felt.png");
      background-size: 531px 337px;
      filter: invert(1);
      mix-blend-mode: screen;
      opacity: 0.13;
      pointer-events: none;
    }

    body::after {
      content: "";
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 75% 55% at 50% 42%, rgba(200, 200, 195, 0.08), transparent 68%),
        radial-gradient(ellipse 100% 90% at 50% 48%, transparent 48%, rgba(0, 0, 0, 0.44) 84%, rgba(0, 0, 0, 0.7) 100%);
      pointer-events: none;
    }

    .grain {
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.1;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulencetype='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }

    .stage {
      position: relative;
      z-index: 1;
      width: min(100%, 700px);
      margin-inline: auto;
      text-align: center;
    }

    .eyebrow {
      font-family: "Recoleta", Georgia, serif;
      font-size: clamp(1.8rem, 7vw, 3rem);
      line-height: 1;
      color: var(--ink);
      margin: 0 0 0.25rem;
      text-align: center;
    }

    .headline {
      font-family: "Block Berthold", sans-serif;
      font-weight: 400;
      font-size: clamp(4rem, 18vw, 7rem);
      text-transform: uppercase;
      letter-spacing: 0;
      line-height: 0.86;
      margin: 0 0 clamp(2rem, 6vh, 3rem);
      color: var(--ink);
      text-align: center;
    }

    .panel {
      width: min(100%, 520px);
      margin-inline: auto;
      background: transparent;
      border: 0;
      padding: 0;
      text-align: left;
    }

    label {
      display: block;
      font-size: 0.68rem;
      color: var(--ink-dim);
      margin-bottom: 0.4rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    input {
      width: 100%;
      min-height: 2.8rem;
      padding: 0.75rem 0.85rem;
      margin-bottom: 1rem;
      border-radius: 4px;
      border: 1px solid var(--ink-line);
      background: rgba(215, 230, 244, 0.035);
      color: var(--ink);
      font: inherit;
      font-size: 0.9rem;
    }

    input:focus {
      outline: none;
      border-color: rgba(215, 230, 244, 0.55);
      box-shadow: 0 0 0 3px rgba(215, 230, 244, 0.08);
    }

    button {
      min-height: 2.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font: inherit;
      font-size: 0.76rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      border-radius: 4px;
      padding: 0 1rem;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease, transform 0.1s ease;
    }

    button:active { transform: scale(0.99); }
    button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
    button:disabled { cursor: wait; opacity: 0.6; }

    .btn-primary,
    .btn-allow {
      width: 100%;
      color: var(--bg);
      background: var(--ink);
      border: 1px solid var(--ink);
    }

    .btn-primary:hover,
    .btn-allow:hover {
      background: #ffffff;
      color: #000000;
    }

    .btn-deny {
      width: 100%;
      color: var(--ink-dim);
      background: transparent;
      border: 1px solid var(--ink-line);
    }

    .btn-deny:hover {
      color: var(--ink);
      border-color: rgba(215, 230, 244, 0.45);
    }

    .error {
      display: none;
      font-size: 0.78rem;
      color: var(--red);
      margin: -0.35rem 0 1rem;
    }

    .scopes {
      list-style: none;
      padding: 0;
      margin: 0 0 1.35rem;
      text-align: left;
    }

    .scopes li {
      font-size: 0.88rem;
      line-height: 1.45;
      color: var(--ink);
      padding: 0.65rem 0;
      border-bottom: 1px solid rgba(215, 230, 244, 0.12);
    }

    .scopes li:last-child { border-bottom: none; }

    .scopes li::before {
      content: ">";
      color: var(--ink-dim);
      margin-right: 0.55rem;
    }

    .row {
      width: 100%;
      display: flex;
      gap: 0.7rem;
    }

    .row .btn-deny { flex: 1; }
    .row .btn-allow { flex: 1.5; }

    .footer-note {
      text-align: center;
      font-size: 0.68rem;
      color: var(--ink-dim);
      margin-top: 1.35rem;
      letter-spacing: 0.02em;
    }

    .footer-note .accent { color: var(--ink); }

    @media (max-width: 520px) {
      body { padding: 1.25rem; }

      .stage {
        width: min(100%, 360px);
      }

      .headline {
        font-size: clamp(3.7rem, 23vw, 6rem);
      }

      .panel {
        width: 100%;
      }

      .row {
        flex-direction: column-reverse;
      }
    }
  `;

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  export function signInPage(redirectTo: string): string {
    return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>reeyan — sign in</title>
    <style>${SHARED_STYLES}</style>
  </head>
  <body>
    <div class="grain"></div>

    <div class="stage">
      <p class="eyebrow">reeyan</p>
      <h1 class="headline">Sign In</h1>

      <div class="panel">
        <form id="f">
          <label for="email">email</label>
          <input id="email" type="email" name="email" required autocomplete="username" />

          <label for="password">password</label>
          <input id="password" type="password" name="password" required autocomplete="current-password" />

          <p class="error" id="err">invalid credentials — try again</p>

          <button class="btn-primary" type="submit">Continue</button>
        </form>
      </div>

      <p class="footer-note">self-hosted · protected by <span class="accent">better-auth</span></p>
    </div>

    <script>
      const form = document.getElementById('f');
      const err = document.getElementById('err');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.style.display = 'none';

        const button = form.querySelector('button');
        button.disabled = true;

        const fd = new FormData(form);
        const res = await fetch('/api/auth/sign-in/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') })
        });

        if (res.ok) {
          window.location.href = ${JSON.stringify(redirectTo)};
        } else {
          button.disabled = false;
          err.style.display = 'block';
        }
      });
    </script>
  </body>
  </html>`;
  }

  export function consentPage(
    clientName: string,
    scopes: string[],
    acceptUrl: string,
    denyUrl: string
  ): string {
    const scopeLabels: Record<string, string> = {
      openid: "verify your identity",
      profile: "read your name and profile info",
      email: "read your email address",
      offline_access: "stay signed in on your behalf",
    };

    const items = scopes
      .map((s) => `<li>${escapeHtml(scopeLabels[s] ?? s)}</li>`)
      .join("");

    return `<!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>reeyan — authorize ${escapeHtml(clientName)}</title>
    <style>${SHARED_STYLES}</style>
  </head>
  <body>
    <div class="grain"></div>

    <div class="stage">
      <p class="eyebrow">reeyan</p>
      <h1 class="headline">Authorize</h1>

      <div class="panel">
        <ul class="scopes">${items}</ul>

        <p class="error" id="err">authorization failed — try again</p>

        <div class="row">
          <button class="btn-deny" id="deny" type="button">Deny</button>
          <button class="btn-allow" id="allow" type="button">Allow</button>
        </div>
      </div>

      <p class="footer-note">granting access to <span class="accent">${escapeHtml(clientName)}</span></p>
    </div>

    <script>
      const err = document.getElementById('err');
      const deny = document.getElementById('deny');
      const allow = document.getElementById('allow');

      async function submitConsent(accept) {
        err.style.display = 'none';
        deny.disabled = true;
        allow.disabled = true;

        const res = await fetch(accept ? ${JSON.stringify(acceptUrl)} : ${JSON.stringify(denyUrl)}, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accept,
            oauth_query: window.location.search.slice(1)
          })
        });

        let data = {};
        try {
          data = await res.json();
        } catch (_) {}

        const redirectTo = data.url || data.redirect_uri;
        if (res.ok && redirectTo) {
          window.location.href = redirectTo;
          return;
        }

        deny.disabled = false;
        allow.disabled = false;
        err.style.display = 'block';
      }

      deny.addEventListener('click', () => submitConsent(false));
      allow.addEventListener('click', () => submitConsent(true));
    </script>
  </body>
  </html>`;
  }