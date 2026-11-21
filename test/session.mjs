import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { sanitizeBuffer, tidyRestored, exitFailed, clampScrollback, EXIT_GRACE_MS, SCROLLBACK_MIN, SCROLLBACK_MAX } = require("../src/session-util.js");

const MARKS = ["── session restarted ──", "── oturum yeniden başlatıldı ──"];
const MARK = "\x1b[2m── session restarted ──\x1b[0m";
let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("sanitize drops the alternate screen section", () => {
  const saved = "user@host ~ % vim x\r\n\x1b[?1049h\x1b[HVIM SCREEN LINE\x1b[?1h\x1b[?2004h";
  assert.equal(sanitizeBuffer(saved), "user@host ~ % vim x\r\n");
});

test("sanitize keeps output after a closed alternate screen", () => {
  assert.equal(sanitizeBuffer("a\r\n\x1b[?1049hALT\x1b[?1049lb"), "a\r\nb");
  assert.equal(sanitizeBuffer("a\x1b[?47hALT\x1b[?47lb"), "ab");
  assert.equal(sanitizeBuffer("a\x1b[?1047hALT"), "a");
});

test("sanitize strips mouse, paste, cursor-key and keypad modes", () => {
  const modes = "\x1b[?1h\x1b[?66h\x1b[?2004h\x1b[4h\x1b[?6h\x1b[?45h\x1b[?1004h\x1b[?7l\x1b[?9h\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1005h\x1b[?1006h\x1b[?1015h";
  assert.equal(sanitizeBuffer("prompt %" + modes), "prompt %");
  assert.equal(sanitizeBuffer("x\x1b[?1000;1006hy\x1b[?1000;1006l"), "xy");
});

test("sanitize keeps unrelated private modes and colors", () => {
  assert.equal(sanitizeBuffer("\x1b[?12h\x1b[31mred\x1b[0m"), "\x1b[?12h\x1b[31mred\x1b[0m");
  assert.equal(sanitizeBuffer("\x1b[?12;2004h"), "\x1b[?12h");
});

test("tidyRestored removes trailing restart markers", () => {
  assert.equal(tidyRestored(`out\r\n${MARK}\r\nuser@host ~ % `, MARKS), "out");
  assert.equal(tidyRestored(`out\r\n${MARK}\r\n`, MARKS), "out");
  assert.equal(tidyRestored(`out\r\n\x1b[2m── oturum yeniden başlatıldı ──\x1b[0m`, MARKS), "out");
});

test("tidyRestored sanitizes an old alt-screen buffer and its markers", () => {
  const buf = `out\r\nuser@host ~ % htop\r\n\x1b[?1049h\x1b[HHTOP\x1b[?1h\x1b[?1000h\x1b[?2004h`;
  assert.equal(tidyRestored(buf, MARKS), "out\r\nuser@host ~ % htop");
  assert.equal(tidyRestored(`out\r\n${MARK}\r\nuser@host ~ % \x1b[?2004h`, MARKS), "out");
});

test("tidyRestored keeps a plain buffer", () => {
  assert.equal(tidyRestored("line 1\r\nline 2   \r\n\r\n", MARKS), "line 1\r\nline 2");
  assert.equal(tidyRestored("", MARKS), "");
});

test("exit classification", () => {
  assert.equal(exitFailed({ ms: 200, typed: false }), true);
  assert.equal(exitFailed({ ms: 200, typed: true }), true);
  assert.equal(exitFailed({ ms: 60000, typed: false }), true);
  assert.equal(exitFailed({ ms: EXIT_GRACE_MS - 1, typed: true }), true);
  assert.equal(exitFailed({ ms: EXIT_GRACE_MS, typed: true }), false);
  assert.equal(exitFailed({ ms: NaN, typed: true }), true);
});

test("scrollback clamp", () => {
  assert.equal(clampScrollback("5000", 1), 5000);
  assert.equal(clampScrollback(5, 1), SCROLLBACK_MIN);
  assert.equal(clampScrollback("99999999", 1), SCROLLBACK_MAX);
  assert.equal(clampScrollback("0", null), null);
  assert.equal(clampScrollback("-3", null), null);
  assert.equal(clampScrollback("abc", 5000), 5000);
  assert.equal(clampScrollback(undefined, 5000), 5000);
  assert.equal(clampScrollback("2500.7", 1), 2500);
});

async function headless(dir) {
  const req = createRequire(path.join(path.resolve(dir), "package.json"));
  const { Terminal } = req("@xterm/headless");
  const { SerializeAddon } = req("@xterm/addon-serialize");
  const write = (t, s) => new Promise((r) => t.write(s, r));
  const make = () => {
    const term = new Terminal({ cols: 60, rows: 10, allowProposedApi: true });
    const ser = new SerializeAddon();
    term.loadAddon(ser);
    return { term, ser };
  };
  const check = async (buf) => {
    const { term } = make();
    await write(term, buf + "\r\n" + MARK + "\r\n");
    assert.equal(term.buffer.active.type, "normal");
    assert.equal(term.modes.bracketedPasteMode, false);
    assert.equal(term.modes.applicationCursorKeysMode, false);
    assert.equal(term.modes.mouseTrackingMode, "none");
    term.dispose();
  };
  const a = make();
  await write(a.term, "user@host ~ % vim x\r\n\x1b[?2004h\x1b[?1h\x1b[?1000h\x1b[?1049h\x1b[HVIM SCREEN LINE");
  const fresh = a.ser.serialize({ scrollback: 300, excludeAltBuffer: true, excludeModes: true });
  assert.ok(!fresh.includes("VIM SCREEN"));
  await check(tidyRestored(fresh, MARKS));
  const old = a.ser.serialize({ scrollback: 300 });
  assert.ok(old.includes("\x1b[?1049h"));
  await check(tidyRestored(old, MARKS));
  a.term.dispose();
}

for (const [name, fn] of tests) {
  await fn();
  passed++;
  console.log("ok -", name);
}
if (process.env.XTERM_HEADLESS_DIR) {
  await headless(process.env.XTERM_HEADLESS_DIR);
  passed++;
  console.log("ok - headless restore stays in the normal buffer with default modes");
} else {
  console.log("skip - headless restore (set XTERM_HEADLESS_DIR to a folder with @xterm/headless and @xterm/addon-serialize)");
}
console.log(`${passed} passed`);
