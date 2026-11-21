import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { pipeData, FLOW_HIGH, FLOW_LOW } = require("../src/flow.js");

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log("ok   " + name);
  } catch (e) {
    failed++;
    console.log("FAIL " + name + "\n     " + e.message);
  }
};

const fakePty = () => {
  const p = { paused: false, pauses: 0, resumes: 0, handler: null };
  p.onData = (fn) => {
    p.handler = fn;
    return { dispose: () => (p.handler = null) };
  };
  p.pause = () => {
    p.paused = true;
    p.pauses++;
  };
  p.resume = () => {
    p.paused = false;
    p.resumes++;
  };
  p.emit = (d) => p.handler(d);
  return p;
};

const fakeTerm = () => {
  const t = { queue: [], written: "" };
  t.write = (d, cb) => t.queue.push(() => {
    t.written += d;
    if (cb) cb();
  });
  t.flush = (n = Infinity) => {
    while (n-- > 0 && t.queue.length) t.queue.shift()();
  };
  return t;
};

const CHUNK = 32 * 1024;
const chunk = (c) => c.repeat(CHUNK);

test("pipeData returns the pty subscription", () => {
  const p = fakePty();
  const sub = pipeData(p, fakeTerm());
  assert.equal(typeof sub.dispose, "function");
  sub.dispose();
  assert.equal(p.handler, null);
});

test("small output never pauses the pty", () => {
  const p = fakePty();
  const t = fakeTerm();
  pipeData(p, t);
  for (let i = 0; i < 100; i++) {
    p.emit("x".repeat(1024));
    t.flush();
  }
  assert.equal(p.pauses, 0);
  assert.equal(t.written.length, 100 * 1024);
});

test("pauses above the high watermark and resumes below the low watermark", () => {
  const p = fakePty();
  const t = fakeTerm();
  pipeData(p, t);
  const n = Math.floor(FLOW_HIGH / CHUNK);
  for (let i = 0; i < n; i++) p.emit(chunk("a"));
  assert.equal(p.paused, false, "not paused at exactly the high watermark");
  p.emit(chunk("b"));
  assert.equal(p.paused, true, "paused above the high watermark");
  assert.equal(p.pauses, 1);
  p.emit(chunk("c"));
  assert.equal(p.pauses, 1, "pause is not repeated while paused");
  let pending = (n + 2) * CHUNK;
  while (pending - CHUNK >= FLOW_LOW) {
    t.flush(1);
    pending -= CHUNK;
    assert.equal(p.paused, true, "still paused at " + pending);
  }
  t.flush(1);
  assert.equal(p.paused, false, "resumed below the low watermark");
  assert.equal(p.resumes, 1);
  t.flush();
  assert.equal(p.resumes, 1, "resume is not repeated");
  assert.equal(t.written.length, (n + 2) * CHUNK);
  assert.equal(t.written.slice(-CHUNK), chunk("c"), "order is kept");
});

test("can pause again after resuming", () => {
  const p = fakePty();
  const t = fakeTerm();
  pipeData(p, t);
  for (let round = 1; round <= 3; round++) {
    while (!p.paused) p.emit(chunk("z"));
    assert.equal(p.pauses, round);
    t.flush();
    assert.equal(p.paused, false);
    assert.equal(p.resumes, round);
  }
});

test("after callback runs for every chunk", () => {
  const p = fakePty();
  const seen = [];
  pipeData(p, fakeTerm(), (d) => seen.push(d));
  p.emit("one");
  p.emit("two");
  assert.deepEqual(seen, ["one", "two"]);
});

test("watermarks are sane", () => {
  assert.ok(FLOW_LOW > 0 && FLOW_LOW < FLOW_HIGH);
});

const src = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
const lines = src.split("\n");
const hits = (re) => lines.map((l, i) => (re.test(l) ? i + 1 + ": " + l.trim() : null)).filter(Boolean);
const none = (name, re) => test(name, () => assert.deepEqual(hits(re), [], "found:\n     " + hits(re).join("\n     ")));

none("no main-document querySelectorAll", /(^|[^.\w])document\.querySelectorAll/);
none("no bare requestAnimationFrame", /(^|[^.\w])(requestAnimationFrame|cancelAnimationFrame)\(/);
none("no main-window ResizeObserver", /new ResizeObserver\(/);
none("no main-document hidden check", /(^|[^.\w])document\.hidden/);
none("no clipboard write without catch", /\.writeText\((?!.*\.catch\()/);
none("no main-window clipboard", /(^|[^.\w])navigator\.clipboard/);

test("keydown and contextmenu are registered per window", () => {
  const m = src.match(/\n  watchWindow\(win\) \{[\s\S]*?\n  \}\n/);
  assert.ok(m, "watchWindow method exists");
  assert.match(m[0], /registerDomEvent\(\s*win,\s*"keydown"/);
  assert.match(m[0], /registerDomEvent\(\s*win\.document,\s*"contextmenu"/);
  assert.match(src, /workspace\.on\("window-open", \(ww, win\) => this\.watchWindow\(win\)\)/);
  assert.match(src, /this\.watchWindow\(window\)/);
  assert.doesNotMatch(src, /registerDomEvent\(\s*(window|document),\s*"(keydown|contextmenu)"/);
});

test("pty output goes through the flow-controlled pipe", () => {
  assert.match(src, /this\.pipe\(p, term\);/);
  assert.match(src, /require\("\.\/flow"\)/);
  assert.doesNotMatch(src, /p\.onData\(\(d\) => \{\s*term\.write\(d\);/);
});

if (failed) {
  console.log(failed + " failed");
  process.exit(1);
}
console.log("all passed");
