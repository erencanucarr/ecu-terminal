const SECRET_RE = new RegExp(
  [
    /passw(or)?d|passwd|passphrase|api[-_]?key|bearer|credential|token/,
    /secret[\w-]*\s*[=:]\s*\S|--secret\b|client[-_]?secret|\bsecrets?\s+(set|create|put|add|edit)\b|\b(create|set|add|put|edit)\s+secrets?\b/,
    /(^|\s)--?pass(in|out)?(\s|=|$)|\bpass:\S/,
    /\bauthorization\s*:/,
    /\b[a-z][\w+.-]*:\/\/[^\/\s:@]+:[^\/\s@]+@/,
    /\bvault\s+login\b/,
    /(?<![a-z0-9])(\w*_)?pass\w*\s*=|(?<![a-z0-9])(\w*_)?pat(_\w+)?\s*=|private[-_]?key\w*\s*=|(?<![a-z0-9])\w*_key\s*=/,
  ]
    .map((r) => r.source)
    .join("|"),
  "i"
);

const SECRET_CS_RE = new RegExp(
  [
    /\b(mysql\w*|mariadb\w*)\b[^|;&]*\s-p\S/,
    /\bmongo\w*\b[^|;&]*\s-p(\s+[^\s-]|\S)/,
    /\bredis-cli\b[^|;&]*\s-a(\s+[^\s-]|\S)/,
    /\bsshpass\b[^|;&]*\s-p/,
    /\b(docker|podman|nerdctl|buildah|skopeo)\b[^|;&]*\blogin\b[^|;&]*\s-p(\s+[^\s-]|\S)/,
    /\bcurl\b[^|;&]*\s(-u\s*|--user(\s+|=))['"]?[^\s:'"]*:[^\s'"]/,
    /\bopenssl\b[^|;&]*\s-k\s+\S/,
    /\bgh[pousr]_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}|(?<![\w-])sk-(ant-|proj-)?[A-Za-z0-9_-]{20,}|\bxox[abposr]-[A-Za-z0-9-]{10,}|\b(AKIA|ASIA)[0-9A-Z]{16}\b|\bglpat-[A-Za-z0-9_-]{20,}|\bnpm_[A-Za-z0-9]{30,}/,
  ]
    .map((r) => r.source)
    .join("|")
);

function isSecretCommand(cmd) {
  const s = String(cmd || "");
  return SECRET_RE.test(s) || SECRET_CS_RE.test(s);
}

const PROMPT_RE = /^(?:\([^)\n]{1,40}\)\s*)?(?:(?:\[[^\]\n]{1,80}\]\s?[$#%]|[\w.-]+@[\w.-]+[^\n$#%]{0,80}?[$#%]|\S{0,40}\s?[❯➜])\s|(?:PS )?[A-Za-z]:\\[^>\n]{0,160}>\s?)/;

function splitPrompt(line) {
  const m = PROMPT_RE.exec(line);
  if (!m) return null;
  return { prompt: m[0].trim(), cmd: line.slice(m[0].length).trim() };
}

function shQuote(s) {
  return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

function shellKind(shell, platform = process.platform) {
  const s = String(shell);
  const n = s.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
  if (platform === "win32" && (n === "wsl" || (n === "bash" && (!/[\\/]/.test(s) || /[\\/](system32|sysnative|syswow64|windowsapps)[\\/]/i.test(s))))) return "other";
  if (n === "zsh" || n === "bash" || n === "pwsh" || n === "powershell" || n === "cmd") return n;
  return "other";
}

function cleanShellEnv(env, platform = process.platform) {
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  if (platform !== "linux") return env;
  if (Object.prototype.hasOwnProperty.call(env, "ORIGINAL_XDG_CURRENT_DESKTOP")) {
    if (env.ORIGINAL_XDG_CURRENT_DESKTOP) env.XDG_CURRENT_DESKTOP = env.ORIGINAL_XDG_CURRENT_DESKTOP;
    else delete env.XDG_CURRENT_DESKTOP;
    delete env.ORIGINAL_XDG_CURRENT_DESKTOP;
  }
  delete env.CHROME_DESKTOP;
  if (env.GDK_BACKEND === "x11" && env.WAYLAND_DISPLAY) delete env.GDK_BACKEND;
  return env;
}

function hotkeyKey(h) {
  if (!h) return "";
  if (h.code) return /^Key[A-Z]$/.test(h.code) ? h.code.charAt(3) : h.code;
  return h.key || "";
}

function hotkeyMatches(h, e, isMac) {
  const key = hotkeyKey(h);
  if (!key || !e || !e.key) return false;
  const want = new Set((h.modifiers || []).map((m) => (m === "Mod" ? (isMac ? "Meta" : "Ctrl") : m)));
  const have = new Set();
  if (e.ctrlKey) have.add("Ctrl");
  if (e.metaKey) have.add("Meta");
  if (e.altKey) have.add("Alt");
  if (e.shiftKey) have.add("Shift");
  if (want.size !== have.size || [...want].some((m) => !have.has(m))) return false;
  const k = key.toLowerCase();
  return k === e.key.toLowerCase() || (!!e.code && k === hotkeyKey({ code: e.code }).toLowerCase());
}

module.exports = { SECRET_RE, SECRET_CS_RE, isSecretCommand, PROMPT_RE, splitPrompt, shQuote, shellKind, cleanShellEnv, hotkeyKey, hotkeyMatches };
