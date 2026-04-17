// Shared auth error messages used by all commands.
// Agents must stop and relay these to the human — never retry on auth errors.

export const HOW_TO_GET_API_KEY =
  "Get it from: app.openhome.com → Settings → API Keys. " +
  "This is a one-time setup. Once you have it: " +
  "export OPENHOME_API_KEY=<key>  OR  openhome login --key <key>";

export const HOW_TO_GET_JWT =
  "JWT tokens are browser-only — a human must retrieve and set them. " +
  "They expire roughly every 7 days and are also invalidated the moment the OpenHome web app is opened " +
  "(the browser gets a new token and the old one dies immediately). " +
  "Steps for the human: " +
  "(1) Finish any work in the OpenHome web app first, then go to app.openhome.com " +
  "(2) Open browser console: Cmd+Option+J on Mac, F12 on Windows " +
  "(3) Paste and run: copy(localStorage.getItem('access_token')) " +
  "(4) Run: openhome set-jwt <paste_token>  OR  export OPENHOME_JWT=<token> " +
  "Do NOT retry this command. Tell the human to complete these steps, then retry.";

export const NO_API_KEY_MSG = "API key required. " + HOW_TO_GET_API_KEY;

export const NO_JWT_MSG = "Session token (JWT) required. " + HOW_TO_GET_JWT;

export const SESSION_EXPIRED_MSG = "Session token expired. " + HOW_TO_GET_JWT;
