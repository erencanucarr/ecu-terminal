const EXIT_GRACE_MS = 2000;
const SCROLLBACK_MIN = 100;
const SCROLLBACK_MAX = 100000;

const ALT_SCREEN_RE = /\x1b\[\?(?:1049|1047|47)h[\s\S]*?(?:\x1b\[\?(?:1049|1047|47)l|$)/g;
const PRIVATE_MODE_RE = /\x1b\[\?([0-9;]*)([hl])/g;
const STRIP_MODES = new Set([1, 6, 7, 9, 25, 45, 47, 66, 1000, 1001, 1002, 1003, 1004, 1005, 1006, 1015, 1016, 1047, 1048, 1049, 2004]);

function plainLine(line) {
  return line.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, "").trim();
}

function sanitizeBuffer(buffer) {
  return String(buffer || "")
    .replace(ALT_SCREEN_RE, "")
    .replace(PRIVATE_MODE_RE, (m, params, op) => {
      const keep = params.split(";").filter((x) => x !== "" && !STRIP_MODES.has(Number(x)));
      return keep.length ? `\x1b[?${keep.join(";")}${op}` : "";
    })
    .replace(/\x1b\[4h/g, "");
}

function tidyRestored(buffer, marks) {
  const lines = sanitizeBuffer(buffer).replace(/\s+$/, "").split(/\r?\n/);
  while (lines.length >= 2 && marks.includes(plainLine(lines[lines.length - 2]))) lines.splice(lines.length - 2, 2);
  while (lines.length && marks.includes(plainLine(lines[lines.length - 1]))) lines.pop();
  return lines.join("\r\n").replace(/\s+$/, "");
}

function exitFailed({ ms, typed }) {
  return !typed || !(ms >= EXIT_GRACE_MS);
}

function clampScrollback(v, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(SCROLLBACK_MAX, Math.max(SCROLLBACK_MIN, n));
}

module.exports = { EXIT_GRACE_MS, SCROLLBACK_MIN, SCROLLBACK_MAX, plainLine, sanitizeBuffer, tidyRestored, exitFailed, clampScrollback };
