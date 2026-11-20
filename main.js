const { Plugin, ItemView, Modal, PluginSettingTab, Setting, MarkdownView, Notice, Menu, FileSystemAdapter, setIcon } = require("obsidian");

const nodeRequire = window.require;
const path = nodeRequire("path");
const fs = nodeRequire("fs");
const os = nodeRequire("os");

const VIEW = "ecu-terminal-view";
const LEGACY_VIEW = "terminal-view";
const HIDDEN = "qt-hidden";
const DEFAULTS = {
  side: "bottom",
  size: 40,
  hidden: false,
  notePlace: "cursor",
  shellPath: "",
  startDir: "vault",
  customDir: "",
  fontFamily: "Menlo, Monaco, 'Courier New', monospace",
  fontSize: 14,
  lineHeight: 1,
  cursorStyle: "block",
  cursorBlink: true,
  copyOnSelect: true,
  scrollback: 5000,
  persistBuffer: true,
  optionIsMeta: false,
  minimumContrastRatio: 4.5,
  layout: "auto",
  notify: true,
  notifyAfter: 10,
  notifyMode: "away",
  notifySound: true,
};

const PROMPT_RE = /^(?:\([^)\n]{1,40}\)\s*)?(?:\[[^\]\n]{1,80}\]\s?[$#%]|[\w.-]+@[\w.-]+[^\n$#%]{0,80}?[$#%]|\S{0,40}\s?[❯➜])\s/;

function bufferLines(term) {
  const b = term.buffer.active;
  const out = [];
  for (let i = 0; i < b.length; i++) {
    const l = b.getLine(i);
    if (!l) continue;
    const t = l.translateToString(true);
    if (l.isWrapped && out.length) out[out.length - 1] += t;
    else out.push(t);
  }
  return out;
}

function splitPrompt(line) {
  const m = PROMPT_RE.exec(line);
  if (!m) return null;
  return { prompt: m[0].trim(), cmd: line.slice(m[0].length).trim() };
}

function hostOf(prompt) {
  const m = /([\w.-]+@[\w.-]+)/.exec(prompt || "");
  return m ? m[1] : "";
}

function trimOutput(lines) {
  while (lines.length) {
    const last = lines[lines.length - 1];
    const p = splitPrompt(last);
    if (!last.trim() || (p && !p.cmd)) lines.pop();
    else break;
  }
  while (lines.length && !lines[0].trim()) lines.shift();
  return lines.join("\n");
}

function lastCommand(lines) {
  let end = lines.length - 1;
  while (end >= 0 && !lines[end].trim()) end--;
  if (end < 0) return null;
  let stop = end + 1;
  let i = end;
  const cur = splitPrompt(lines[end]);
  if (cur && !cur.cmd) {
    stop = end;
    i = end - 1;
  }
  for (; i >= 0; i--) {
    const p = splitPrompt(lines[i]);
    if (p && p.cmd) return { prompt: p.prompt, cmd: p.cmd, output: trimOutput(lines.slice(i + 1, stop)) };
  }
  return null;
}

function parseSelection(text, lines) {
  const sel = String(text).replace(/\r\n?/g, "\n").replace(/\s+$/, "");
  const rows = sel.split("\n");
  const p = splitPrompt(rows[0]);
  if (p && p.cmd) return { prompt: p.prompt, cmd: p.cmd, output: trimOutput(rows.slice(1)) };
  let prompt = "";
  for (let i = lines.length - 1; i >= 0 && !prompt; i--) {
    const q = splitPrompt(lines[i]);
    if (q) prompt = q.prompt;
  }
  return { prompt, cmd: "", output: trimOutput(rows) };
}

function fenceFor(text) {
  let max = 2;
  const re = /`{3,}/g;
  let m;
  while ((m = re.exec(text))) max = Math.max(max, m[0].length);
  return "`".repeat(max + 1);
}

function formatCapture(cap, opts) {
  const d = new Date();
  const time = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const host = opts && opts.localHost && hostOf(cap.prompt) === opts.localHost ? "" : hostOf(cap.prompt);
  let head = `**${time}**`;
  if (host) head += ` · ${host}`;
  if (cap.cmd) head += " — `" + cap.cmd.replace(/`/g, "'") + "`";
  const out = cap.output || "(çıktı yok)";
  const fence = fenceFor(out);
  return `${head}\n${fence}text\n${out}\n${fence}`;
}

let ENGINE = null;
function loadEngine(dir) {
  if (ENGINE) return ENGINE;
  const v = (p) => path.join(dir, "vendor", p);
  for (const arch of ["darwin-arm64", "darwin-x64"]) {
    try {
      fs.chmodSync(v(`node-pty/prebuilds/${arch}/spawn-helper`), 0o755);
    } catch (e) {
    }
  }
  ENGINE = {
    pty: nodeRequire(v("node-pty")),
    Terminal: nodeRequire(v("xterm/xterm.js")).Terminal,
    FitAddon: nodeRequire(v("xterm/addon-fit.js")).FitAddon,
    WebLinksAddon: nodeRequire(v("xterm/addon-web-links.js")).WebLinksAddon,
    SerializeAddon: nodeRequire(v("xterm/addon-serialize.js")).SerializeAddon,
    SearchAddon: nodeRequire(v("xterm/addon-search.js")).SearchAddon,
    Unicode11Addon: nodeRequire(v("xterm/addon-unicode11.js")).Unicode11Addon,
    css: fs.readFileSync(v("xterm/xterm.css"), "utf8"),
  };
  return ENGINE;
}

function writeShellIntegration(dir) {
  const zdir = path.join(dir, "shell");
  fs.mkdirSync(zdir, { recursive: true });
  const init = path.join(zdir, "ecu-init.zsh");
  const files = {
    ".zshenv": `[[ -f "\${__ECU_USER_ZDOTDIR:-$HOME}/.zshenv" ]] && source "\${__ECU_USER_ZDOTDIR:-$HOME}/.zshenv"\n`,
    ".zprofile": `[[ -f "\${__ECU_USER_ZDOTDIR:-$HOME}/.zprofile" ]] && source "\${__ECU_USER_ZDOTDIR:-$HOME}/.zprofile"\n`,
    ".zshrc": `source "${init}"\n`,
    "ecu-init.zsh": [
      "# ecu-terminal: zsh shell entegrasyonu",
      'if [[ -n "$__ECU_SHELL_INTEGRATION" ]]; then return 0; fi',
      "__ECU_SHELL_INTEGRATION=1",
      '# kendi ZDOTDIR\'ını geri koy; .zshrc ve .zlogin normal yerinden okunsun',
      'if [[ -n "$__ECU_USER_ZDOTDIR" ]]; then ZDOTDIR="$__ECU_USER_ZDOTDIR"; else unset ZDOTDIR; fi',
      '[[ -f "${ZDOTDIR:-$HOME}/.zshrc" ]] && source "${ZDOTDIR:-$HOME}/.zshrc"',
      "__ecu_precmd() {",
      '  local ec="$?"',
      "  printf '\\e]133;D;%s\\e\\\\' \"$ec\"",
      "  printf '\\e]7;file://%s%s\\e\\\\' \"${HOST}\" \"${PWD}\"",
      "  printf '\\e]133;A\\e\\\\'",
      "}",
      "__ecu_preexec() {",
      "  printf '\\e]133;E;%s\\e\\\\' \"${1//[[:cntrl:]]/ }\"",
      "  printf '\\e]133;B\\e\\\\'",
      "}",
      "autoload -Uz add-zsh-hook",
      "add-zsh-hook precmd __ecu_precmd",
      "add-zsh-hook preexec __ecu_preexec",
      "",
    ].join("\n"),
  };
  for (const [name, body] of Object.entries(files)) {
    const p = path.join(zdir, name);
    try {
      if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== body) fs.writeFileSync(p, body);
    } catch (e) {
      console.warn("[ecu-terminal] shell entegrasyonu yazılamadı", e);
    }
  }
  return zdir;
}

function cssColor(probe, expr, fallback) {
  probe.style.color = "";
  probe.style.color = expr;
  const c = getComputedStyle(probe).color;
  return c && c !== "rgba(0, 0, 0, 0)" ? c : fallback;
}

function termTheme(el) {
  const probe = el.createDiv({ cls: "ecu-color-probe" });
  const c = (v, fb) => cssColor(probe, v, fb);
  const bg = c("var(--background-primary)", "#1e1e1e");
  const fg = c("var(--text-normal)", "#dcddde");
  const theme = {
    background: bg,
    foreground: fg,
    cursor: c("var(--caret-color, var(--text-normal))", fg),
    cursorAccent: bg,
    selectionBackground: c("var(--text-selection)", "rgba(255,255,255,.2)"),
    black: c("var(--background-modifier-border-hover, #3a3a3a)", "#3a3a3a"),
    red: c("var(--color-red)", "#e5534b"),
    green: c("var(--color-green)", "#57ab5a"),
    yellow: c("var(--color-yellow)", "#c69026"),
    blue: c("var(--color-blue)", "#539bf5"),
    magenta: c("var(--color-purple)", "#b083f0"),
    cyan: c("var(--color-cyan)", "#39c5cf"),
    white: c("var(--text-muted)", "#adbac7"),
    brightBlack: c("var(--text-faint)", "#636e7b"),
    brightRed: c("var(--color-red)", "#ff938a"),
    brightGreen: c("var(--color-green)", "#6bc46d"),
    brightYellow: c("var(--color-yellow)", "#daaa3f"),
    brightBlue: c("var(--color-blue)", "#6cb6ff"),
    brightMagenta: c("var(--color-purple)", "#dcbdfb"),
    brightCyan: c("var(--color-cyan)", "#56d4dd"),
    brightWhite: fg,
  };
  probe.remove();
  return theme;
}

const READLINE_KEYS = {
  "alt+ArrowLeft": "\x1bb",
  "alt+ArrowRight": "\x1bf",
  "meta+ArrowLeft": "\x01",
  "meta+ArrowRight": "\x05",
  "meta+Backspace": "\x15",
  "alt+Backspace": "\x17",
};

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk ${s % 60} sn`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

class TermSession {
  constructor(view, opts) {
    this.view = view;
    this.plugin = view.plugin;
    this.restore = opts || {};
    this.cwd = "";
    this.shellName = "";
    this.term = null;
    this.ptyProc = null;
    this.commands = [];
    this.pendingCmd = "";
    this.integrated = false;
    this.localRun = null;
    this.remoteRun = null;
    this.closed = false;

    this.el = createDiv({ cls: "ecu-pane" });
    const head = this.el.createDiv({ cls: "ecu-pane-head" });
    this.captionEl = head.createSpan({ cls: "ecu-pane-caption" });
    const close = head.createEl("button", { cls: "ecu-pane-close clickable-icon", attr: { "aria-label": "Bu terminali kapat" } });
    setIcon(close, "x");
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      this.view.removeSession(this);
    });
    this.hostEl = this.el.createDiv({ cls: "ecu-pane-host" });
    this.el.addEventListener("mousedown", () => this.view.setActive(this), true);
  }

  get session() {
    return this.term && this.ptyProc ? { terminal: this.term, pty: this.ptyProc } : null;
  }

  startDir() {
    const s = this.plugin.settings;
    const pick = (d) => {
      try {
        return d && fs.statSync(d).isDirectory() ? d : "";
      } catch (e) {
        return "";
      }
    };
    return (
      pick(this.restore.cwd) ||
      (s.startDir === "custom" && pick(s.customDir)) ||
      (s.startDir === "home" && os.homedir()) ||
      pick(this.plugin.vaultPath()) ||
      os.homedir()
    );
  }

  start() {
    let E;
    try {
      E = this.plugin.engine();
    } catch (e) {
      console.error("[ecu-terminal] terminal motoru yüklenemedi", e);
      this.hostEl.setText("Terminal başlatılamadı: " + (e && e.message ? e.message : e));
      return;
    }
    const s = this.plugin.settings;
    const term = new E.Terminal({
      fontFamily: s.fontFamily || DEFAULTS.fontFamily,
      fontSize: Number(s.fontSize) || 14,
      lineHeight: Number(s.lineHeight) || 1,
      cursorStyle: s.cursorStyle,
      cursorBlink: !!s.cursorBlink,
      scrollback: Number(s.scrollback) || 5000,
      minimumContrastRatio: Number(s.minimumContrastRatio) || 1,
      macOptionIsMeta: !!s.optionIsMeta,
      allowProposedApi: true,
      theme: termTheme(this.view.contentEl),
    });
    this.term = term;
    this.fit = new E.FitAddon();
    this.serialize = new E.SerializeAddon();
    this.search = new E.SearchAddon();
    term.loadAddon(this.fit);
    term.loadAddon(this.serialize);
    term.loadAddon(this.search);
    term.loadAddon(
      new E.WebLinksAddon((ev, uri) => {
        if (ev.metaKey || ev.ctrlKey) window.open(uri, "_blank");
      })
    );
    try {
      term.loadAddon(new E.Unicode11Addon());
      term.unicode.activeVersion = "11";
    } catch (e) {
    }
    term.open(this.hostEl);
    if (this.restore.buffer) {
      term.write(this.restore.buffer.replace(/\s+$/, "") + "\r\n\x1b[2m── oturum yeniden başlatıldı ──\x1b[0m\r\n");
    }
    this.installHandlers();
    this.fitNow();

    const shell = s.shellPath || process.env.SHELL || "/bin/zsh";
    this.shellName = path.basename(shell);
    const env = Object.assign({}, process.env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "ecu-terminal",
      LANG: process.env.LANG || "en_US.UTF-8",
    });
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ATTACH_CONSOLE;
    if (this.shellName === "zsh") {
      try {
        const zdir = writeShellIntegration(this.plugin.pluginDir());
        if (process.env.ZDOTDIR) env.__ECU_USER_ZDOTDIR = process.env.ZDOTDIR;
        env.ZDOTDIR = zdir;
      } catch (e) {
      }
    }
    this.cwd = this.startDir();
    let p;
    try {
      p = E.pty.spawn(shell, ["-l"], { name: "xterm-256color", cols: term.cols, rows: term.rows, cwd: this.cwd, env });
    } catch (e) {
      term.write(`\r\n\x1b[31mShell başlatılamadı (${shell}): ${e && e.message ? e.message : e}\x1b[0m\r\n`);
      return;
    }
    this.ptyProc = p;
    p.onData((d) => {
      term.write(d);
      if (this.remoteRun) this.checkRemoteDone();
    });
    term.onData((d) => this.input(d));
    term.onBinary((d) => this.ptyProc && this.ptyProc.write(nodeRequire("buffer").Buffer.from(d, "binary")));
    p.onExit(() => {
      this.ptyProc = null;
      if (!this.closed) this.view.removeSession(this);
    });
    this.updateCaption();
    this.restore = {};
  }

  input(d) {
    if (d.includes("\r")) this.noteEnter();
    if (this.view.broadcast) {
      for (const s of this.view.sessions) {
        if (s.ptyProc) s.ptyProc.write(d);
        if (s !== this && d.includes("\r")) s.noteEnter();
      }
    } else if (this.ptyProc) this.ptyProc.write(d);
  }

  noteEnter() {
    if (!this.term || this.term.buffer.active.type !== "normal") return;
    if (this.integrated && !this.localRun) return;
    const b = this.term.buffer.active;
    const line = b.getLine(b.baseY + b.cursorY);
    const p = splitPrompt(line ? line.translateToString(true) : "");
    if (p && p.cmd) this.remoteRun = { cmd: p.cmd, prompt: p.prompt, t: Date.now() };
  }

  checkRemoteDone() {
    clearTimeout(this.remoteTimer);
    this.remoteTimer = setTimeout(() => {
      const run = this.remoteRun;
      if (!run || !this.term || this.term.buffer.active.type !== "normal") return;
      const b = this.term.buffer.active;
      const line = b.getLine(b.baseY + b.cursorY);
      const p = splitPrompt(line ? line.translateToString(true) : "");
      if (!p || p.cmd) return;
      this.remoteRun = null;
      this.plugin.notifyDone(this, { cmd: run.cmd, exit: null, ms: Date.now() - run.t, host: hostOf(run.prompt) });
    }, 400);
  }

  installHandlers() {
    const term = this.term;
    term.parser.registerOscHandler(133, (data) => {
      this.integrated = true;
      const [kind, ...rest] = data.split(";");
      const arg = rest.join(";");
      if (kind === "E") this.pendingCmd = arg.trim();
      else if (kind === "B") {
        this.commands.push({ cmd: this.pendingCmd, start: term.registerMarker(0), end: null, exit: null });
        this.localRun = { cmd: this.pendingCmd, t: Date.now() };
        this.remoteRun = null;
        this.pendingCmd = "";
        if (this.commands.length > 30) {
          const old = this.commands.shift();
          old.start && old.start.dispose();
          old.end && old.end.dispose();
        }
      } else if (kind === "D") {
        const last = this.commands[this.commands.length - 1];
        if (last && !last.end) {
          last.end = term.registerMarker(0);
          last.exit = arg === "" ? null : Number(arg);
        }
        const run = this.localRun;
        this.localRun = null;
        this.remoteRun = null;
        if (run) this.plugin.notifyDone(this, { cmd: run.cmd, exit: last ? last.exit : null, ms: Date.now() - run.t, host: "" });
      }
      return true;
    });
    term.parser.registerOscHandler(7, (data) => {
      const m = /^file:\/\/[^/]*(\/.*)$/.exec(data);
      if (m) {
        try {
          this.cwd = decodeURIComponent(m[1]);
        } catch (e) {
          this.cwd = m[1];
        }
        this.updateCaption();
      }
      return true;
    });

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const s = this.plugin.settings;
      if (e.key === "Escape") {
        e.stopPropagation();
        return true;
      }
      if (e.metaKey && e.altKey && /^Arrow/.test(e.key)) {
        e.preventDefault();
        this.view.focusNeighbor(e.key.slice(5).toLowerCase(), this);
        return false;
      }
      if (e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          if (term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
            term.clearSelection();
          }
          e.preventDefault();
          return false;
        }
        if (k === "v") return true;
        if (k === "k") {
          term.clear();
          e.preventDefault();
          return false;
        }
        if (k === "f") {
          e.preventDefault();
          e.stopPropagation();
          this.openSearch();
          return false;
        }
        if (k === "a") {
          term.selectAll();
          e.preventDefault();
          return false;
        }
      }
      const combo = (e.metaKey ? "meta+" : "") + (e.altKey ? "alt+" : "") + e.key;
      if (!e.ctrlKey && !e.shiftKey && READLINE_KEYS[combo] && !(e.altKey && s.optionIsMeta)) {
        this.input(READLINE_KEYS[combo]);
        e.preventDefault();
        return false;
      }
      if (e.metaKey) return false;
      return true;
    });

    let selTimer = null;
    term.onSelectionChange(() => {
      if (!this.plugin.settings.copyOnSelect) return;
      clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      }, 200);
    });
    term.textarea && term.textarea.addEventListener("focus", () => this.view.setActive(this));

    this.ro = new ResizeObserver(() => {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.fitNow());
    });
    this.ro.observe(this.hostEl);
  }

  fitNow() {
    if (!this.term || !this.hostEl.offsetWidth || !this.hostEl.offsetHeight) return;
    try {
      this.fit.fit();
      if (this.ptyProc) this.ptyProc.resize(this.term.cols, this.term.rows);
    } catch (e) {
    }
  }

  captionText() {
    const home = os.homedir();
    const dir = this.cwd ? (this.cwd === home ? "~" : path.basename(this.cwd)) : "";
    const host = this.remoteHost();
    return `${this.shellName || ""}${dir ? "  ·  " + dir : ""}${host ? "  ·  " + host : ""}`;
  }

  remoteHost() {
    if (!this.term || !this.localRun) return "";
    const b = this.term.buffer.active;
    for (let i = b.baseY + b.cursorY; i >= Math.max(0, b.baseY + b.cursorY - 50); i--) {
      const l = b.getLine(i);
      const p = l && splitPrompt(l.translateToString(true));
      if (p) return hostOf(p.prompt);
    }
    return "";
  }

  updateCaption() {
    this.captionEl.setText(this.captionText());
    this.view.updateToolbar();
  }

  isVisible() {
    return !!(this.el.offsetWidth && this.el.offsetHeight) && !document.hidden;
  }

  focus() {
    if (this.term) this.term.focus();
  }

  openSearch() {
    if (this.searchEl) {
      this.searchInput.focus();
      this.searchInput.select();
      return;
    }
    const bar = this.el.createDiv({ cls: "ecu-term-search" });
    const input = bar.createEl("input", { type: "text", attr: { placeholder: "Terminalde ara…" } });
    const info = bar.createSpan({ cls: "ecu-term-search-info" });
    const btn = (icon, label, fn) => {
      const b = bar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
      setIcon(b, icon);
      b.onclick = fn;
    };
    const find = (back) => {
      const q = input.value;
      if (!q) return;
      const ok = back ? this.search.findPrevious(q) : this.search.findNext(q);
      info.setText(ok ? "" : "bulunamadı");
    };
    btn("arrow-up", "Önceki (⇧↵)", () => find(true));
    btn("arrow-down", "Sonraki (↵)", () => find(false));
    btn("x", "Kapat (esc)", () => this.closeSearch());
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        find(e.shiftKey);
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.closeSearch();
      }
    });
    input.addEventListener("input", () => {
      info.setText("");
      if (input.value) this.search.findNext(input.value, { incremental: true });
    });
    this.searchEl = bar;
    this.searchInput = input;
    const sel = this.term && this.term.getSelection();
    if (sel && !sel.includes("\n")) input.value = sel;
    input.focus();
    input.select();
  }

  closeSearch() {
    if (!this.searchEl) return;
    this.searchEl.remove();
    this.searchEl = null;
    if (this.search) this.search.clearDecorations();
    this.focus();
  }

  linesBetween(from, to) {
    const b = this.term.buffer.active;
    const out = [];
    for (let i = Math.max(0, from); i < Math.min(to, b.length); i++) {
      const l = b.getLine(i);
      if (!l) continue;
      const t = l.translateToString(true);
      if (l.isWrapped && out.length) out[out.length - 1] += t;
      else out.push(t);
    }
    return out;
  }

  lastCommandCapture() {
    const term = this.term;
    if (!term) return null;
    const last = [...this.commands].reverse().find((c) => c.start && !c.start.isDisposed && c.start.line >= 0);
    if (last && last.end && !last.end.isDisposed && last.end.line >= 0) {
      const promptLine = this.linesBetween(last.start.line - 1, last.start.line)[0] || "";
      const p = splitPrompt(promptLine);
      return {
        prompt: p ? p.prompt : "",
        cmd: last.cmd || (p ? p.cmd : ""),
        output: trimOutput(this.linesBetween(last.start.line, last.end.line)),
        exit: last.exit,
      };
    }
    if (last && !last.end) {
      const inner = this.linesBetween(last.start.line, term.buffer.active.length);
      const found = lastCommand(inner);
      if (found) return found;
      return { prompt: "", cmd: last.cmd, output: trimOutput(inner) };
    }
    return lastCommand(bufferLines(term));
  }

  state() {
    const st = { cwd: this.cwd || this.restore.cwd || "" };
    if (this.plugin.settings.persistBuffer && this.term && this.serialize) {
      try {
        st.buffer = this.serialize.serialize({ scrollback: 300 });
      } catch (e) {
      }
    }
    return st;
  }

  dispose() {
    this.closed = true;
    clearTimeout(this.remoteTimer);
    try {
      if (this.ro) this.ro.disconnect();
      if (this.ptyProc) this.ptyProc.kill();
    } catch (e) {
    }
    this.ptyProc = null;
    if (this.term) this.term.dispose();
    this.term = null;
    this.el.remove();
  }
}

const LAYOUTS = { auto: "Otomatik ızgara", cols: "Yan yana", rows: "Alt alta" };

class ConfirmModal extends Modal {
  constructor(app, title, body, okText, onOk) {
    super(app);
    this.titleText = title;
    this.bodyText = body;
    this.okText = okText;
    this.onOk = onOk;
  }
  onOpen() {
    this.titleEl.setText(this.titleText);
    this.contentEl.createEl("p", { text: this.bodyText });
    const row = this.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = row.createEl("button", { text: this.okText, cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.close();
      this.onOk();
    });
    row.createEl("button", { text: "Vazgeç" }).addEventListener("click", () => this.close());
    setTimeout(() => ok.focus(), 0);
  }
  onClose() {
    this.contentEl.empty();
  }
}

class EcuTerminalView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.sessions = [];
    this.active = null;
    this.layout = plugin.settings.layout || "auto";
    this.colSizes = null;
    this.rowSizes = null;
    this.grid = { cols: 1, rows: 1 };
    this.broadcast = false;
    this.restore = null;
    this.started = false;
    this.isPanel = false;
  }
  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    return this.isPanel ? "Terminal Paneli" : "Terminal";
  }
  getIcon() {
    return "terminal";
  }

  get session() {
    return this.active ? this.active.session : null;
  }
  getTabManager() {
    return { getActiveSession: () => this.session };
  }
  get term() {
    return this.active ? this.active.term : null;
  }

  async setState(state, result) {
    if (state && state.panel) {
      this.isPanel = true;
      this.contentEl.addClass("is-panel");
      try {
        this.leaf.updateHeader();
      } catch (e) {
      }
    }
    if (state && !this.started) this.restore = state;
    await super.setState(state, result);
  }
  getState() {
    return {
      panel: this.isPanel || undefined,
      sessions: this.sessions.map((s) => s.state()),
      layout: this.layout,
      colSizes: this.colSizes,
      rowSizes: this.rowSizes,
      active: Math.max(0, this.sessions.indexOf(this.active)),
    };
  }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("ecu-term");
    const bar = root.createDiv({ cls: "ecu-term-toolbar" });
    this.captionEl = bar.createSpan({ cls: "ecu-term-caption" });
    const tools = bar.createDiv({ cls: "ecu-term-tools" });
    const tool = (icon, label, fn, cls) => {
      const b = tools.createEl("button", { cls: "clickable-icon" + (cls ? " " + cls : ""), attr: { "aria-label": label } });
      setIcon(b, icon);
      b.addEventListener("click", (e) => fn(e, b));
      return b;
    };
    tool("plus", "Yeni terminal (⌘D)", () => this.addSession({ cwd: this.active && this.active.cwd }));
    this.layoutBtn = tool("layout-grid", "Düzen", (e) => this.layoutMenu(e));
    this.broadcastBtn = tool("radio-tower", "Tüm terminallere yaz (MultiExec)", () => this.setBroadcast(!this.broadcast), "ecu-broadcast-btn");
    this.closeBtn = tool("x", "Terminalleri kapat", (e) => this.closeMenu(e));
    this.hideBtn = tool("chevron-down", "Terminali gizle (⌘J)", () => this.plugin.toggle());
    this.gridEl = root.createDiv({ cls: "ecu-grid" });
    setTimeout(() => this.hideBtn && this.hideBtn.toggle(!this.isPanel), 0);
    this.ro = new ResizeObserver(() => {
      const shape = this.bestShape();
      if (this.layout === "auto" && (shape.cols !== this.grid.cols || shape.rows !== this.grid.rows)) this.relayout();
    });
    this.ro.observe(this.gridEl);
    this.registerEvent(
      this.app.workspace.on("css-change", () => {
        for (const s of this.sessions) if (s.term) s.term.options.theme = termTheme(this.contentEl);
      })
    );
    setTimeout(() => this.start(), 0);
  }

  start() {
    if (this.started) return;
    this.started = true;
    const st = this.restore || {};
    this.restore = null;
    const list = Array.isArray(st.sessions) && st.sessions.length ? st.sessions : [{ cwd: st.cwd, buffer: st.buffer }];
    if (st.layout && LAYOUTS[st.layout]) this.layout = st.layout;
    this.colSizes = st.colSizes || null;
    this.rowSizes = st.rowSizes || null;
    for (const s of list) this.addSession(s, { noFocus: true, keepSizes: true });
    const a = this.sessions[st.active || 0] || this.sessions[0];
    if (a) this.setActive(a);
  }

  addSession(opts, how) {
    how = how || {};
    const s = new TermSession(this, opts || {});
    this.sessions.push(s);
    if (!how.keepSizes) this.colSizes = this.rowSizes = null;
    this.relayout();
    s.start();
    this.setActive(s);
    if (!how.noFocus) setTimeout(() => s.focus(), 30);
    return s;
  }

  removeSession(s) {
    const i = this.sessions.indexOf(s);
    if (i < 0) return;
    this.sessions.splice(i, 1);
    s.dispose();
    if (!this.sessions.length) {
      if (this.isPanel) {
        this.colSizes = this.rowSizes = null;
        this.addSession({ cwd: s.cwd });
        return;
      }
      this.leaf.detach();
      return;
    }
    this.colSizes = this.rowSizes = null;
    this.relayout();
    const next = this.sessions[Math.min(i, this.sessions.length - 1)];
    this.setActive(next);
    next.focus();
  }

  closeMany(keep) {
    const victims = this.sessions.filter((s) => s !== keep);
    if (!victims.length) return;
    const busy = victims.filter((s) => s.localRun || s.remoteRun);
    const go = () => {
      const cwd = (keep && keep.cwd) || (this.active && this.active.cwd) || victims[0].cwd;
      this.sessions = this.sessions.filter((s) => s === keep);
      for (const s of victims) s.dispose();
      this.colSizes = this.rowSizes = null;
      if (!this.sessions.length) {
        if (this.isPanel) {
          this.addSession({ cwd });
        } else {
          this.leaf.detach();
          this.plugin.focusNote();
        }
        return;
      }
      this.relayout();
      this.setActive(keep);
      setTimeout(() => keep.focus(), 30);
    };
    if (!busy.length) return go();
    const names = busy.map((s) => (s.localRun || s.remoteRun).cmd).filter(Boolean).slice(0, 3).join(", ");
    new ConfirmModal(
      this.app,
      keep ? "Diğer terminaller kapatılsın mı?" : "Tüm terminaller kapatılsın mı?",
      `${busy.length} terminalde hâlâ çalışan bir komut var${names ? ` (${names})` : ""}. Kapatırsan bu komutlar durdurulur.`,
      "Yine de kapat",
      go
    ).open();
  }

  closeMenu(evt) {
    const menu = new Menu();
    const n = this.sessions.length;
    menu.addItem((i) =>
      i.setTitle("Bu terminali kapat").setIcon("x").onClick(() => this.active && this.removeSession(this.active))
    );
    menu.addItem((i) =>
      i.setTitle("Diğer terminalleri kapat").setIcon("minus-square").setDisabled(n < 2).onClick(() => this.closeMany(this.active))
    );
    menu.addItem((i) =>
      i.setTitle(`Tüm terminalleri kapat (${n})`).setIcon("x-square").onClick(() => this.closeMany(null))
    );
    menu.showAtMouseEvent(evt);
  }

  setActive(s) {
    if (!s) return;
    this.active = s;
    for (const x of this.sessions) x.el.toggleClass("is-active", x === s && this.sessions.length > 1);
    this.updateToolbar();
    if (this.app.workspace.activeLeaf !== this.leaf) this.app.workspace.setActiveLeaf(this.leaf, { focus: false });
  }

  focus() {
    if (this.active) this.active.focus();
  }

  focusNeighbor(dir, from) {
    const i = this.sessions.indexOf(from);
    const { cols } = this.grid;
    const r = Math.floor(i / cols);
    const c = i % cols;
    let j = i;
    if (dir === "left") j = c > 0 ? i - 1 : i;
    if (dir === "right") j = c < cols - 1 && i + 1 < this.sessions.length ? i + 1 : i;
    if (dir === "up") j = r > 0 ? i - cols : i;
    if (dir === "down") j = i + cols < this.sessions.length ? i + cols : i;
    const t = this.sessions[j];
    if (t) {
      this.setActive(t);
      t.focus();
    }
  }

  setBroadcast(on) {
    this.broadcast = on;
    this.contentEl.toggleClass("is-broadcast", on);
    this.broadcastBtn.toggleClass("is-active", on);
    new Notice(on ? "MultiExec açık: yazdığın her şey bu paneldeki tüm terminallere gidiyor." : "MultiExec kapalı.");
    if (this.active) this.active.focus();
  }

  setLayout(l) {
    this.layout = l;
    this.colSizes = this.rowSizes = null;
    this.plugin.settings.layout = l;
    this.plugin.saveData(this.plugin.settings);
    this.relayout();
    this.app.workspace.requestSaveLayout();
  }

  layoutMenu(evt) {
    const menu = new Menu();
    for (const [k, label] of Object.entries(LAYOUTS)) {
      menu.addItem((i) => {
        i.setTitle(label).setIcon(k === "auto" ? "layout-grid" : k === "cols" ? "columns-3" : "rows-3").onClick(() => this.setLayout(k));
        if (i.setChecked) i.setChecked(this.layout === k);
      });
    }
    menu.addSeparator();
    menu.addItem((i) =>
      i
        .setTitle("Boyutları eşitle")
        .setIcon("equal")
        .onClick(() => {
          this.colSizes = this.rowSizes = null;
          this.relayout();
        })
    );
    menu.showAtMouseEvent(evt);
  }

  bestShape() {
    const n = Math.max(1, this.sessions.length);
    if (this.layout === "cols") return { cols: n, rows: 1 };
    if (this.layout === "rows") return { cols: 1, rows: n };
    const W = this.gridEl.offsetWidth || 1200;
    const H = this.gridEl.offsetHeight || 400;
    let best = { cols: n, rows: 1 };
    let bestScore = Infinity;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const ratio = W / cols / (H / rows);
      const cramped = (H / rows < 110 ? 2 : 0) + (W / cols < 260 ? 2 : 0);
      const score = Math.abs(Math.log(ratio / 2.2)) + (cols * rows - n) * 0.35 + cramped;
      if (score < bestScore) {
        bestScore = score;
        best = { cols, rows };
      }
    }
    return best;
  }

  relayout() {
    const g = this.gridEl;
    if (!g) return;
    const { cols, rows } = this.bestShape();
    if (!this.colSizes || this.colSizes.length !== cols) this.colSizes = Array(cols).fill(1);
    if (!this.rowSizes || this.rowSizes.length !== rows) this.rowSizes = Array(rows).fill(1);
    this.grid = { cols, rows };
    const GUT = "5px";
    g.style.gridTemplateColumns = this.colSizes.map((f) => `minmax(0, ${f}fr)`).join(` ${GUT} `);
    g.style.gridTemplateRows = this.rowSizes.map((f) => `minmax(0, ${f}fr)`).join(` ${GUT} `);
    g.toggleClass("is-single", this.sessions.length <= 1);

    g.querySelectorAll(":scope > .ecu-gutter, :scope > .ecu-add-tile").forEach((el) => el.remove());
    this.sessions.forEach((s, i) => {
      if (s.el.parentElement !== g) g.appendChild(s.el);
      s.el.style.gridColumn = String((i % cols) * 2 + 1);
      s.el.style.gridRow = String(Math.floor(i / cols) * 2 + 1);
      s.el.toggleClass("is-active", s === this.active && this.sessions.length > 1);
    });
    for (let i = this.sessions.length; i < cols * rows; i++) {
      const tile = g.createDiv({ cls: "ecu-add-tile" });
      tile.style.gridColumn = String((i % cols) * 2 + 1);
      tile.style.gridRow = String(Math.floor(i / cols) * 2 + 1);
      const inner = tile.createDiv({ cls: "ecu-add-tile-inner" });
      setIcon(inner.createSpan(), "plus");
      inner.createSpan({ text: "Yeni terminal" });
      tile.addEventListener("click", () => this.addSession({ cwd: this.active && this.active.cwd }, { keepSizes: true }));
    }
    for (let c = 0; c < cols - 1; c++) this.makeGutter("col", c, rows);
    for (let r = 0; r < rows - 1; r++) this.makeGutter("row", r, cols);
    this.updateToolbar();
    requestAnimationFrame(() => this.sessions.forEach((s) => s.fitNow()));
  }

  makeGutter(kind, idx, span) {
    const g = this.gridEl;
    const el = g.createDiv({ cls: `ecu-gutter ecu-gutter-${kind}` });
    if (kind === "col") {
      el.style.gridColumn = String(idx * 2 + 2);
      el.style.gridRow = `1 / ${span * 2}`;
    } else {
      el.style.gridRow = String(idx * 2 + 2);
      el.style.gridColumn = `1 / ${span * 2}`;
    }
    el.addEventListener("dblclick", () => {
      if (kind === "col") this.colSizes = null;
      else this.rowSizes = null;
      this.relayout();
    });
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const sizes = kind === "col" ? this.colSizes : this.rowSizes;
      const total = sizes.reduce((a, b) => a + b, 0);
      const px = (kind === "col" ? g.offsetWidth : g.offsetHeight) - (sizes.length - 1) * 5;
      const a0 = sizes[idx];
      const b0 = sizes[idx + 1];
      const start = kind === "col" ? e.clientX : e.clientY;
      const min = total * (120 / Math.max(px, 1));
      document.body.addClass("ecu-resizing", kind === "col" ? "is-col" : "is-row");
      const move = (ev) => {
        const d = (((kind === "col" ? ev.clientX : ev.clientY) - start) / Math.max(px, 1)) * total;
        const a = Math.max(min, Math.min(a0 + b0 - min, a0 + d));
        sizes[idx] = a;
        sizes[idx + 1] = a0 + b0 - a;
        const tpl = sizes.map((f) => `minmax(0, ${f}fr)`).join(" 5px ");
        if (kind === "col") g.style.gridTemplateColumns = tpl;
        else g.style.gridTemplateRows = tpl;
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        document.body.removeClass("ecu-resizing", "is-col", "is-row");
        this.sessions.forEach((s) => s.fitNow());
        this.app.workspace.requestSaveLayout();
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
  }

  updateToolbar() {
    if (!this.captionEl) return;
    const n = this.sessions.length;
    const a = this.active;
    this.captionEl.setText(n > 1 ? `Terminal  ·  ${n} oturum` : `Terminal  ${a ? a.captionText() : ""}`);
    if (this.closeBtn) this.closeBtn.toggle(n > 1);
  }

  sessionFromEl(el) {
    const pane = el && el.closest && el.closest(".ecu-pane");
    return this.sessions.find((s) => s.el === pane) || this.active;
  }

  lastCommandCapture() {
    return this.active ? this.active.lastCommandCapture() : null;
  }

  async onClose() {
    if (this.ro) this.ro.disconnect();
    for (const s of this.sessions) s.dispose();
    this.sessions = [];
  }
}

module.exports = class EcuTerminal extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.lastTerm = null;

    this.registerView(VIEW, (leaf) => new EcuTerminalView(leaf, this));
    try {
      this.styleEl = document.head.createEl("style", { attr: { id: "ecu-terminal-xterm-css" } });
      this.styleEl.textContent = fs.readFileSync(path.join(this.pluginDir(), "vendor/xterm/xterm.css"), "utf8");
    } catch (e) {
      console.warn("[ecu-terminal] xterm.css yüklenemedi", e);
    }

    this.addCommand({
      id: "toggle",
      name: "Show / hide terminal",
      hotkeys: [{ modifiers: ["Mod"], key: "j" }],
      callback: () => this.toggle(),
    });

    this.addCommand({
      id: "split-right",
      name: "New terminal beside",
      callback: () => this.split("vertical"),
    });

    this.addCommand({
      id: "split-down",
      name: "New terminal below",
      callback: () => this.split("horizontal"),
    });

    this.addCommand({
      id: "restart",
      name: "Restart terminal (new shell)",
      callback: () => this.restart(),
    });

    this.addCommand({
      id: "move",
      name: "Move terminal (right / bottom)",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "j" }],
      callback: () => this.move(),
    });

    this.addSettingTab(new EcuTerminalSettings(this.app, this));

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf && leaf.view && leaf.view.getViewType() === VIEW && !leaf.view.isPanel) this.lastTerm = leaf;
        if (leaf && leaf.view instanceof MarkdownView) this.lastNote = leaf;
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!file) return;
        const folder = file.children ? file : file.parent;
        const name = folder && folder.path !== "/" ? folder.name : "kasa klasörü";
        menu.addItem((i) =>
          i
            .setTitle(`Terminali burada aç (${name})`)
            .setIcon("terminal")
            .setSection("open")
            .onClick(() => this.openAt(folder))
        );
      })
    );
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, info) => {
        const file = info && info.file;
        menu.addItem((i) =>
          i
            .setTitle("Terminali bu notun klasöründe aç")
            .setIcon("terminal")
            .setSection("ecu-terminal")
            .onClick(() => this.openAt(file ? file.parent : null))
        );
      })
    );
    this.addCommand({
      id: "open-panel",
      name: "Terminal Panelini aç (tam ekran sekme)",
      callback: () => this.openPanel(),
    });
    this.addCommand({
      id: "open-here",
      name: "Terminali açık notun klasöründe aç",
      callback: () => {
        const f = this.app.workspace.getActiveFile();
        this.openAt(f ? f.parent : null);
      },
    });

    this.addCommand({
      id: "close-others",
      name: "Diğer terminalleri kapat",
      callback: () => {
        const l = this.activeTermLeaf();
        if (l && l.view.active) l.view.closeMany(l.view.active);
      },
    });
    this.addCommand({
      id: "close-all",
      name: "Tüm terminalleri kapat",
      callback: () => {
        const l = this.activeTermLeaf();
        if (l) l.view.closeMany(null);
      },
    });

    this.addCommand({
      id: "capture-last",
      name: "Son komutu ve çıktısını nota ekle",
      callback: () => this.capture(this.activeTermLeaf(), "last"),
    });
    this.addCommand({
      id: "capture-selection",
      name: "Terminalde seçili metni nota ekle",
      callback: () => this.capture(this.activeTermLeaf(), "selection"),
    });

    this.registerDomEvent(
      window,
      "keydown",
      (evt) => {
        if (!evt.metaKey || evt.ctrlKey || evt.altKey || evt.code !== "KeyD") return;
        const leaf = this.leafFromEl(evt.target);
        if (!leaf) return;
        evt.preventDefault();
        evt.stopPropagation();
        this.split(evt.shiftKey ? "horizontal" : "vertical", leaf);
      },
      { capture: true }
    );

    this.registerDomEvent(
      document,
      "contextmenu",
      (evt) => {
        const leaf = this.leafFromEl(evt.target);
        if (!leaf) return;
        evt.preventDefault();
        evt.stopPropagation();
        const sess = leaf.view.sessionFromEl && leaf.view.sessionFromEl(evt.target);
        if (sess) leaf.view.setActive(sess);
        this.showMenu(evt, leaf);
      },
      { capture: true }
    );

    this.navButtons = [];
    this.winFocused = true;
    this.registerDomEvent(window, "focus", () => (this.winFocused = true));
    this.registerDomEvent(window, "blur", () => (this.winFocused = false));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addNavButtons()));

    this.app.workspace.onLayoutReady(async () => {
      this.addNavButtons();
      for (const leaf of this.app.workspace.getLeavesOfType(LEGACY_VIEW)) {
        const st = leaf.getViewState();
        await leaf.setViewState({ type: VIEW, active: false, state: { cwd: st.state && st.state.cwd } });
      }
      if (this.settings.hidden && this.leaves().length) this.applyHidden(true);
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        if (!this.leaves().length && this.settings.hidden) this.saveHidden(false);
      })
    );
  }

  onunload() {
    document.querySelectorAll("." + HIDDEN).forEach((el) => el.classList.remove(HIDDEN));
    if (this.styleEl) this.styleEl.remove();
    (this.navButtons || []).forEach((b) => b.remove());
  }

  addNavButtons() {
    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      const bar = leaf.view && leaf.view.containerEl.querySelector(".nav-header .nav-buttons-container");
      if (!bar || bar.querySelector(".ecu-term-navbtn")) continue;
      const b = bar.createDiv({ cls: "clickable-icon nav-action-button ecu-term-navbtn", attr: { "aria-label": "Terminal (sağ tık: Terminal Paneli)" } });
      setIcon(b, "terminal");
      b.addEventListener("click", (e) => this.navMenu(e));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openPanel();
      });
      this.navButtons.push(b);
    }
  }

  navMenu(evt) {
    const v = this.leaf() && this.leaf().view;
    const open = !!v && !this.isHidden();
    const menu = new Menu();
    menu.addItem((i) => i.setTitle("Terminal Paneli (tam ekran sekme)").setIcon("square-terminal").onClick(() => this.openPanel()));
    menu.addSeparator();
    const sessions = (v && v.sessions) || [];
    sessions.forEach((sess, i) => {
      const run = sess.localRun || sess.remoteRun;
      const busy = run ? `   ⏳ ${fmtDuration(Date.now() - run.t)}` : "";
      menu.addItem((it) => {
        it.setTitle(`${i + 1}   ${sess.captionText().trim() || "terminal"}${busy}`)
          .setIcon("square-terminal")
          .onClick(() => this.focusSession(sess));
        if (it.setChecked) it.setChecked(open && sess === v.active);
      });
    });
    menu.addItem((i) => i.setTitle("Yeni terminal  ⌘D").setIcon("plus").onClick(() => this.split()));
    if (sessions.length > 1) menu.addItem((i) => i.setTitle(`Tüm terminalleri kapat (${sessions.length})`).setIcon("x-square").onClick(() => v.closeMany(null)));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(open ? "Terminali gizle  ⌘J" : "Terminali göster  ⌘J").setIcon(open ? "eye-off" : "terminal").onClick(() => this.toggle()));
    menu.addItem((i) => i.setTitle("Kasa klasöründe yeni terminal").setIcon("folder-open").onClick(() => this.openAt(null)));
    if (v && v.sessions) {
      menu.addSeparator();
      for (const [k, label] of Object.entries(LAYOUTS)) {
        menu.addItem((i) => {
          i.setTitle(label).setIcon(k === "auto" ? "layout-grid" : k === "cols" ? "columns-3" : "rows-3").onClick(() => v.setLayout(k));
          if (i.setChecked) i.setChecked(v.layout === k);
        });
      }
      menu.addItem((i) => {
        i.setTitle("Tüm terminallere yaz (MultiExec)").setIcon("radio-tower").onClick(() => v.setBroadcast(!v.broadcast));
        if (i.setChecked) i.setChecked(!!v.broadcast);
      });
    }
    menu.addSeparator();
    const toBottom = this.settings.side !== "bottom";
    menu.addItem((i) => i.setTitle(toBottom ? "Alta taşı" : "Sağa taşı").setIcon(toBottom ? "panel-bottom" : "panel-right").onClick(() => this.move()));
    menu.addItem((i) =>
      i
        .setTitle("Terminal ayarları")
        .setIcon("settings")
        .onClick(() => {
          this.app.setting.open();
          this.app.setting.openTabById(this.manifest.id);
        })
    );
    menu.showAtMouseEvent(evt);
  }

  async focusSession(sess) {
    if (this.isHidden()) {
      this.applyHidden(false);
      await this.saveHidden(false);
    }
    const leaf = sess.view.leaf;
    this.app.workspace.revealLeaf(leaf);
    sess.view.setActive(sess);
    setTimeout(() => sess.focus(), 30);
  }

  notifyDone(sess, info) {
    const s = this.settings;
    if (!s.notify || !info || info.ms < (Number(s.notifyAfter) || 10) * 1000) return;
    const appFocused = this.appFocused();
    const seen = appFocused && sess.isVisible() && !this.isHidden();
    if (s.notifyMode !== "always" && seen) return;
    const ok = info.exit == null ? null : info.exit === 0;
    const where = info.host ? ` · ${info.host}` : "";
    const title = (ok === false ? `✗ Komut hata verdi (kod ${info.exit})` : ok ? "✓ Komut bitti" : "Komut bitti") + where;
    const body = `${info.cmd || "komut"}\n${fmtDuration(info.ms)}`;
    if (!appFocused) {
      try {
        const n = new Notification(title, { body, silent: !s.notifySound });
        n.onclick = () => this.bringToFront(sess);
        return;
      } catch (e) {
      }
    }
    const frag = createFragment((f) => {
      f.createDiv({ text: title, cls: "ecu-notice-title" });
      f.createDiv({ text: `${info.cmd || "komut"} · ${fmtDuration(info.ms)}`, cls: "ecu-notice-body" });
    });
    const notice = new Notice(frag, 8000);
    if (notice.noticeEl) notice.noticeEl.addEventListener("click", () => this.bringToFront(sess));
  }

  appFocused() {
    try {
      const w = nodeRequire("@electron/remote").getCurrentWindow();
      return w.isFocused() && w.isVisible() && !w.isMinimized();
    } catch (e) {
      return this.winFocused !== false && document.hasFocus();
    }
  }

  async bringToFront(sess) {
    try {
      const remote = nodeRequire("@electron/remote");
      const w = remote.getCurrentWindow();
      if (w.isMinimized()) w.restore();
      w.show();
      w.focus();
    } catch (e) {
      window.focus();
    }
    if (this.isHidden()) {
      this.applyHidden(false);
      await this.saveHidden(false);
    }
    const leaf = sess && sess.view && sess.view.leaf;
    if (leaf) {
      this.app.workspace.revealLeaf(leaf);
      sess.view.setActive(sess);
      sess.focus();
    }
  }

  pluginDir() {
    const adapter = this.app.vault.adapter;
    const base = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    return path.join(base, this.manifest.dir || ".obsidian/plugins/ecu-terminal");
  }

  vaultPath() {
    const adapter = this.app.vault.adapter;
    return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
  }

  engine() {
    return loadEngine(this.pluginDir());
  }

  applyToAll() {
    for (const l of this.allLeaves()) {
      for (const sess of (l.view && l.view.sessions) || []) {
        const t = sess.term;
        if (!t) continue;
        t.options.fontSize = Number(this.settings.fontSize) || 14;
        t.options.cursorStyle = this.settings.cursorStyle;
        t.options.cursorBlink = !!this.settings.cursorBlink;
        t.options.macOptionIsMeta = !!this.settings.optionIsMeta;
        sess.fitNow();
      }
    }
  }

  leaves() {
    return this.allLeaves().filter((l) => !(l.view && l.view.isPanel));
  }

  allLeaves() {
    return this.app.workspace.getLeavesOfType(VIEW);
  }

  activeTermLeaf() {
    const a = this.app.workspace.activeLeaf;
    if (a && a.view && a.view.getViewType() === VIEW) return a;
    return this.leaf() || this.panelLeaf();
  }

  panelLeaf() {
    return this.allLeaves().find((l) => l.view && l.view.isPanel) || null;
  }

  async openPanel() {
    let leaf = this.panelLeaf();
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW, active: true, state: { panel: true } });
    }
    if (leaf.setPinned && !leaf.getViewState().pinned) leaf.setPinned(true);
    this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    this.focusTerminal(leaf);
    return leaf;
  }

  leaf() {
    const all = this.leaves();
    if (this.lastTerm && all.includes(this.lastTerm)) return this.lastTerm;
    return all[0] || null;
  }

  leafFromEl(el) {
    const content = el && el.closest && el.closest('.workspace-leaf-content[data-type="' + VIEW + '"]');
    if (!content) return null;
    return this.allLeaves().find((l) => l.view.containerEl === content) || null;
  }

  termGroup(leaf) {
    const g = leaf.parent;
    if (!g || !g.containerEl || !g.children) return null;
    return g.children.every((c) => c.view && c.view.getViewType() === VIEW) ? g : null;
  }

  canHide() {
    const all = this.leaves();
    return all.length > 0 && all.every((l) => this.termGroup(l));
  }

  isHidden() {
    return this.leaves().some((l) => l.parent && l.parent.containerEl && l.parent.containerEl.classList.contains(HIDDEN));
  }

  applyHidden(hidden) {
    if (!hidden) {
      document.querySelectorAll("." + HIDDEN).forEach((el) => el.classList.remove(HIDDEN));
      return;
    }
    const root = this.app.workspace.rootSplit;
    const groups = new Set();
    for (const l of this.leaves()) {
      const g = this.termGroup(l);
      if (g) groups.add(g);
    }
    groups.forEach((g) => g.containerEl.classList.add(HIDDEN));
    groups.forEach((g) => {
      let p = g.parent;
      while (p && p !== root && p.children && p.containerEl) {
        if (p.children.every((c) => c.containerEl && c.containerEl.classList.contains(HIDDEN))) {
          p.containerEl.classList.add(HIDDEN);
          p = p.parent;
        } else break;
      }
    });
  }

  async saveHidden(hidden) {
    this.settings.hidden = hidden;
    await this.saveData(this.settings);
  }

  noteLeaf() {
    const ws = this.app.workspace;
    const active = ws.getActiveViewOfType(MarkdownView);
    if (active) return active.leaf;
    const md = ws.getLeavesOfType("markdown")[0];
    if (md) return md;
    const recent = ws.getMostRecentLeaf(ws.rootSplit);
    return recent && recent.view.getViewType() !== VIEW ? recent : null;
  }

  focusTerminal(leaf) {
    this.app.workspace.setActiveLeaf(leaf, { focus: true });
    const tryFocus = (n) => {
      const v = leaf.view;
      if (v && v.term) v.focus();
      else if (n > 0) setTimeout(() => tryFocus(n - 1), 60);
    };
    tryFocus(15);
  }

  focusNote() {
    const leaf = this.noteLeaf();
    if (leaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  session(leaf) {
    leaf = leaf || this.leaf();
    return leaf && leaf.view && leaf.view.session ? leaf.view.session : null;
  }

  async toggle() {
    const leaf = this.leaf();
    if (!leaf) return this.create();

    if (!this.canHide()) {
      this.app.workspace.revealLeaf(leaf);
      return this.focusTerminal(leaf);
    }

    if (this.isHidden()) {
      this.applyHidden(false);
      await this.saveHidden(false);
      this.focusTerminal(leaf);
    } else {
      this.applyHidden(true);
      await this.saveHidden(true);
      this.focusNote();
    }
  }

  setSize(base, leaf) {
    try {
      const size = Math.min(80, Math.max(15, Number(this.settings.size) || 40));
      if (base && base.parent && base.parent.setDimension) base.parent.setDimension(100 - size);
      if (leaf.parent && leaf.parent.setDimension) leaf.parent.setDimension(size);
    } catch (e) {
    }
  }

  async create(state) {
    const ws = this.app.workspace;
    const base = this.noteLeaf();
    const dir = this.settings.side === "bottom" ? "horizontal" : "vertical";
    const leaf = base ? ws.createLeafBySplit(base, dir) : ws.getLeaf("split", dir);
    await leaf.setViewState({ type: VIEW, active: true, state: state || {} });
    await this.saveHidden(false);
    this.setSize(base, leaf);
    this.focusTerminal(leaf);
    return leaf;
  }

  async split(dir, from, opts) {
    if (this.isHidden()) {
      this.applyHidden(false);
      await this.saveHidden(false);
    }
    const base = from || this.leaf();
    if (!base || !base.view || !base.view.addSession) return this.create(opts ? { sessions: [opts] } : undefined);
    this.app.workspace.revealLeaf(base);
    const v = base.view;
    v.addSession(opts || { cwd: v.active && v.active.cwd });
    return base;
  }

  async openAt(folder) {
    const rel = folder && folder.path && folder.path !== "/" ? folder.path : "";
    const cwd = path.join(this.vaultPath(), rel);
    return this.split(null, null, { cwd });
  }

  async restart() {
    const leaf = this.leaf();
    if (leaf) leaf.detach();
    await this.create();
  }

  async move() {
    this.settings.side = this.settings.side === "bottom" ? "right" : "bottom";
    await this.saveData(this.settings);
    const all = this.leaves();
    if (all.length) {
      const states = all.map((l) => l.getViewState().state);
      all.forEach((l) => l.detach());
      let prev = await this.create(states[0]);
      for (const st of states.slice(1)) {
        const dir = this.settings.side === "bottom" ? "vertical" : "horizontal";
        const leaf = this.app.workspace.createLeafBySplit(prev, dir);
        await leaf.setViewState({ type: VIEW, active: false, state: st });
        prev = leaf;
      }
    }
    new Notice("Terminal: " + (this.settings.side === "bottom" ? "altta" : "sağda"));
  }

  targetNote() {
    const ok = (l) => l && l.view instanceof MarkdownView && l.view.editor && this.app.workspace.getLeavesOfType("markdown").includes(l);
    if (ok(this.lastNote)) return this.lastNote;
    const l = this.noteLeaf();
    return ok(l) ? l : null;
  }

  capture(leaf, mode) {
    const s = this.session(leaf);
    const term = s && s.terminal;
    if (!term) return new Notice("Açık terminal yok.");
    const note = this.targetNote();
    if (!note) return new Notice("Önce çıktının ekleneceği notu aç.");
    const lines = bufferLines(term);
    let cap;
    if (mode === "selection") {
      if (!term.hasSelection()) return new Notice("Terminalde önce bir şey seç.");
      cap = parseSelection(term.getSelection(), lines);
      term.clearSelection();
    } else {
      cap = leaf.view && leaf.view.lastCommandCapture ? leaf.view.lastCommandCapture() : lastCommand(lines);
      if (!cap) return new Notice("Son komut bulunamadı. Çıktıyı seçip 'Seçimi nota ekle'yi kullan.");
    }
    if (!cap.cmd && !cap.output) return new Notice("Eklenecek bir şey yok.");
    const local = os && os.userInfo ? `${os.userInfo().username}@${os.hostname().replace(/\.local$/, "")}` : "";
    this.insertIntoNote(note, formatCapture(cap, { localHost: local }));
    new Notice(`Nota eklendi: ${note.view.file ? note.view.file.basename : ""}`);
  }

  insertIntoNote(note, block) {
    const ed = note.view.editor;
    let line;
    if (this.settings.notePlace === "end") line = ed.lineCount() - 1;
    else line = ed.getCursor().line;
    let open = null;
    let closeAt = -1;
    for (let i = 0; i < ed.lineCount(); i++) {
      const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(ed.getLine(i));
      if (!m) continue;
      if (!open) open = { ch: m[1][0], len: m[1].length, at: i };
      else if (m[1][0] === open.ch && m[1].length >= open.len && !m[2].trim()) {
        if (line >= open.at && line <= i) closeAt = i;
        open = null;
      }
      if (i >= line && !open) break;
    }
    if (closeAt >= 0) line = closeAt;
    else if (open && line >= open.at) line = ed.lineCount() - 1;
    const text = ed.getLine(line);
    let insert;
    let from;
    if (!text.trim()) {
      from = { line, ch: 0 };
      insert = block + "\n";
      ed.replaceRange(insert, from, { line, ch: text.length });
    } else {
      from = { line, ch: text.length };
      insert = "\n\n" + block + "\n";
      ed.replaceRange(insert, from);
    }
    const endOff = ed.posToOffset(from) + insert.length;
    const endPos = ed.offsetToPos(endOff);
    ed.setCursor(endPos);
    ed.scrollIntoView({ from: endPos, to: endPos }, true);
  }

  showMenu(evt, leaf) {
    const s = this.session(leaf);
    const term = s && s.terminal;
    const menu = new Menu();
    menu.addItem((i) =>
      i.setTitle("Kopyala").setIcon("copy").setDisabled(!term || !term.hasSelection()).onClick(() => {
        navigator.clipboard.writeText(term.getSelection());
        term.clearSelection();
      })
    );
    menu.addItem((i) =>
      i.setTitle("Yapıştır").setIcon("clipboard-paste").setDisabled(!term).onClick(async () => {
        term.paste(await navigator.clipboard.readText());
        term.focus();
      })
    );
    menu.addItem((i) =>
      i.setTitle("Tümünü seç").setIcon("text-select").setDisabled(!term).onClick(() => term.selectAll())
    );
    menu.addSeparator();
    const note = this.targetNote();
    const where = note ? ` (${note.view.file ? note.view.file.basename : "not"})` : "";
    menu.addItem((i) =>
      i
        .setTitle("Son komutu ve çıktısını nota ekle" + where)
        .setIcon("file-input")
        .setDisabled(!term || !note)
        .onClick(() => this.capture(leaf, "last"))
    );
    menu.addItem((i) =>
      i
        .setTitle("Seçimi nota ekle" + where)
        .setIcon("file-plus")
        .setDisabled(!term || !note || !term.hasSelection())
        .onClick(() => this.capture(leaf, "selection"))
    );
    menu.addItem((i) =>
      i.setTitle("Ekranı temizle").setIcon("eraser").setDisabled(!s).onClick(() => {
        s.pty.write("\f");
        term.focus();
      })
    );
    menu.addSeparator();
    const v = leaf.view;
    menu.addItem((i) => i.setTitle("Yeni terminal  ⌘D").setIcon("plus").onClick(() => this.split(null, leaf)));
    menu.addItem((i) => i.setTitle("Düzen…").setIcon("layout-grid").onClick(() => v.layoutMenu(evt)));
    menu.addItem((i) => {
      i.setTitle("Tüm terminallere yaz (MultiExec)").setIcon("radio-tower").onClick(() => v.setBroadcast(!v.broadcast));
      if (i.setChecked) i.setChecked(!!v.broadcast);
    });
    menu.addSeparator();
    const toBottom = this.settings.side !== "bottom";
    menu.addItem((i) =>
      i.setTitle(toBottom ? "Alta taşı" : "Sağa taşı").setIcon(toBottom ? "panel-bottom" : "panel-right").onClick(() => this.move())
    );
    menu.addItem((i) =>
      i.setTitle("Terminali gizle").setIcon("eye-off").onClick(() => {
        if (!this.isHidden()) this.toggle();
      })
    );
    menu.addItem((i) =>
      i.setTitle("Bu terminali kapat").setIcon("x").onClick(() => {
        if (v.active) v.removeSession(v.active);
        if (v.sessions.length) {
          this.app.workspace.setActiveLeaf(leaf, { focus: true });
          v.focus();
        } else if (!this.allLeaves().includes(leaf)) this.focusNote();
      })
    );
    menu.addItem((i) =>
      i.setTitle("Diğer terminalleri kapat").setIcon("minus-square").setDisabled(v.sessions.length < 2).onClick(() => v.closeMany(v.active))
    );
    menu.addItem((i) =>
      i.setTitle(`Tüm terminalleri kapat (${v.sessions.length})`).setIcon("x-square").setDisabled(v.sessions.length < 2 && !v.isPanel).onClick(() => v.closeMany(null))
    );
    menu.showAtMouseEvent(evt);
  }
};

class EcuTerminalSettings extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Terminal konumu")
      .setDesc("Yeni açılan terminal notun neresinde dursun.")
      .addDropdown((d) =>
        d
          .addOption("right", "Sağda")
          .addOption("bottom", "Altta")
          .setValue(this.plugin.settings.side)
          .onChange(async (v) => {
            this.plugin.settings.side = v;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    new Setting(containerEl)
      .setName("Terminal boyutu (%)")
      .setDesc("Yeni açılan terminalin kapladığı alan.")
      .addSlider((s) =>
        s
          .setLimits(15, 80, 5)
          .setValue(this.plugin.settings.size)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.size = v;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    new Setting(containerEl)
      .setName("Terminal çıktısı nota nereye eklensin")
      .setDesc("Sağ tık → 'Son komutu ve çıktısını nota ekle' / 'Seçimi nota ekle'. Çıktı en son kullandığın nota, saatiyle birlikte eklenir.")
      .addDropdown((d) =>
        d
          .addOption("cursor", "İmlecin olduğu yere")
          .addOption("end", "Notun sonuna")
          .setValue(this.plugin.settings.notePlace)
          .onChange(async (v) => {
            this.plugin.settings.notePlace = v;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    const p = this.plugin;
    const save = () => p.saveData(p.settings);
    const note = "Yeni açılan terminallerde geçerli olur.";

    containerEl.createEl("h3", { text: "Shell" });
    new Setting(containerEl)
      .setName("Shell")
      .setDesc(`Boş bırakırsan sistemdeki varsayılan kullanılır (${process.env.SHELL || "/bin/zsh"}). zsh'de komut sınırları kesin bilinir.`)
      .addText((t) => t.setPlaceholder(process.env.SHELL || "/bin/zsh").setValue(p.settings.shellPath).onChange(async (v) => ((p.settings.shellPath = v.trim()), await save())));
    new Setting(containerEl)
      .setName("Başlangıç klasörü")
      .addDropdown((d) =>
        d
          .addOption("vault", "Kasa klasörü (notlar)")
          .addOption("home", "Ev klasörü (~)")
          .addOption("custom", "Özel klasör")
          .setValue(p.settings.startDir)
          .onChange(async (v) => {
            p.settings.startDir = v;
            await save();
            this.display();
          })
      );
    if (p.settings.startDir === "custom")
      new Setting(containerEl)
        .setName("Özel klasör")
        .addText((t) => t.setPlaceholder("/Users/…").setValue(p.settings.customDir).onChange(async (v) => ((p.settings.customDir = v.trim()), await save())));
    new Setting(containerEl)
      .setName("Oturumu hatırla")
      .setDesc("Obsidian yeniden açılınca terminal aynı klasörde başlar ve önceki ekran içeriği görünür (shell yeniden başlar).")
      .addToggle((t) => t.setValue(p.settings.persistBuffer).onChange(async (v) => ((p.settings.persistBuffer = v), await save())));

    containerEl.createEl("h3", { text: "Komut bitince bildirim" });
    new Setting(containerEl)
      .setName("Bildirim gönder")
      .setDesc("Uzun süren bir komut bitince haber verir: çıkış kodu (✓/✗), süre ve ssh'teysen sunucu adıyla. ssh içindeki komutların bitişi prompt'un geri gelmesinden anlaşılır.")
      .addToggle((t) => t.setValue(p.settings.notify).onChange(async (v) => ((p.settings.notify = v), await save())));
    new Setting(containerEl)
      .setName("En az süre (saniye)")
      .setDesc("Bundan kısa süren komutlar için bildirim gelmez.")
      .addSlider((sl) => sl.setLimits(3, 120, 1).setValue(Number(p.settings.notifyAfter) || 10).setDynamicTooltip().onChange(async (v) => ((p.settings.notifyAfter = v), await save())));
    new Setting(containerEl)
      .setName("Ne zaman")
      .addDropdown((d) =>
        d
          .addOption("away", "Obsidian arka plandayken ya da terminal görünmüyorken")
          .addOption("always", "Her zaman")
          .setValue(p.settings.notifyMode)
          .onChange(async (v) => ((p.settings.notifyMode = v), await save()))
      );
    new Setting(containerEl)
      .setName("Ses")
      .addToggle((t) => t.setValue(p.settings.notifySound).onChange(async (v) => ((p.settings.notifySound = v), await save())));

    containerEl.createEl("h3", { text: "Görünüm ve davranış" });
    new Setting(containerEl)
      .setName("Yazı tipi")
      .setDesc(note)
      .addText((t) => t.setValue(p.settings.fontFamily).onChange(async (v) => ((p.settings.fontFamily = v), await save())));
    new Setting(containerEl)
      .setName("Yazı boyutu")
      .addSlider((s) => s.setLimits(10, 22, 1).setValue(p.settings.fontSize).setDynamicTooltip().onChange(async (v) => ((p.settings.fontSize = v), await save(), p.applyToAll())));
    new Setting(containerEl)
      .setName("İmleç")
      .addDropdown((d) =>
        d
          .addOption("block", "Blok")
          .addOption("bar", "Çizgi")
          .addOption("underline", "Alt çizgi")
          .setValue(p.settings.cursorStyle)
          .onChange(async (v) => ((p.settings.cursorStyle = v), await save(), p.applyToAll()))
      )
      .addToggle((t) => t.setTooltip("Yanıp sönsün").setValue(p.settings.cursorBlink).onChange(async (v) => ((p.settings.cursorBlink = v), await save(), p.applyToAll())));
    new Setting(containerEl)
      .setName("Seçince kopyala")
      .setDesc("Fareyle seçtiğin metin otomatik panoya kopyalanır.")
      .addToggle((t) => t.setValue(p.settings.copyOnSelect).onChange(async (v) => ((p.settings.copyOnSelect = v), await save())));
    new Setting(containerEl)
      .setName("Option tuşu Meta gibi davransın")
      .setDesc("Kapalıyken Option ile Türkçe/özel karakter yazılır ve ⌥←/→ kelime atlar. Açıkken Option, emacs tarzı Meta tuşu olur.")
      .addToggle((t) => t.setValue(p.settings.optionIsMeta).onChange(async (v) => ((p.settings.optionIsMeta = v), await save(), p.applyToAll())));
    new Setting(containerEl)
      .setName("Geçmiş satır sayısı")
      .setDesc(note)
      .addText((t) =>
        t.setValue(String(p.settings.scrollback)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (n > 0) {
            p.settings.scrollback = n;
            await save();
          }
        })
      );

    containerEl.createEl("p", {
      text:
        "Cmd+J göster/gizle, Cmd+Shift+J sağ/alt arasında taşı. Cmd+D yeni terminal (ızgaraya eklenir), ⌥⌘+ok terminaller arası geçiş, Ctrl-D o terminali kapatır. Ayraçları sürükleyerek boyutlandır, çift tıkla eşitle. ⌘F ara, ⌘K ekranı temizle, ⌘+tık bağlantıyı açar. ⌥←/→ kelime, ⌘←/→ satır başı/sonu, ⌘⌫ satırı siler. Sağ tıkla menü.",
      cls: "setting-item-description",
    });
  }
}

module.exports._internals = { PROMPT_RE, splitPrompt, lastCommand, parseSelection, formatCapture, trimOutput };
