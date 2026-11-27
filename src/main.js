const { Plugin, ItemView, Modal, PluginSettingTab, Setting, MarkdownView, Notice, Menu, FileSystemAdapter, Scope, setIcon, requestUrl } = require("obsidian");
const { Terminal } = require("@xterm/xterm");
const { FitAddon } = require("@xterm/addon-fit");
const { WebLinksAddon } = require("@xterm/addon-web-links");
const { SerializeAddon } = require("@xterm/addon-serialize");
const { SearchAddon } = require("@xterm/addon-search");
const { Unicode11Addon } = require("@xterm/addon-unicode11");
const { tidyRestored: tidyBuffer, exitFailed, clampScrollback, SCROLLBACK_MIN, SCROLLBACK_MAX } = require("./session-util");
const { isSecretCommand, PROMPT_RE, splitPrompt, shQuote, shellKind, cleanShellEnv, hotkeyKey, hotkeyMatches } = require("./util");
const { pipeData } = require("./flow");

const STRINGS = {
  en: {
    "common.language": "Language",
    "set.uiLangDesc": "Plugin interface language. Auto follows Obsidian's language.",
    "set.uiLangAuto": "Auto (follow Obsidian)",
    "set.uiLangEn": "English",
    "set.uiLangTr": "Türkçe",
    "notice.langChanged": "Language changed. Reload Obsidian to apply it everywhere.",
    "capture.noOutput": "(no output)",
    "engine.unsupported": "This platform is not supported: {platform}",
    "engine.badHash": "Couldn't verify the downloaded file (SHA-256 mismatch).",
    "engine.notInstalled": "node-pty is not installed",
    "engine.title": "Terminal engine required",
    "engine.text": "ecu-terminal uses node-pty {version} ({platform}) to run the shell. It's downloaded once, from the github.com/erencanucarr/ecu-terminal releases, and verified with SHA-256.",
    "engine.download": "Download and start",
    "engine.downloading": "Downloading…",
    "engine.downloadFailed": "Download failed: {error}",
    "dur.s": "{s} s",
    "dur.ms": "{m} min {s} s",
    "dur.hm": "{h} h {m} min",
    "session.startFailed": "Couldn't start the terminal: {error}",
    "session.restarted": "── session restarted ──",
    "session.shellFailed": "Couldn't start the shell ({shell}): {error}",
    "session.exited": "Shell exited (code {code}): {shell}",
    "session.exitedSignal": "Shell exited (signal {signal}): {shell}",
    "session.restartHint": "Press Enter or click Restart to start it again.",
    "session.restart": "Restart",
    "engine.redownload": "Download the engine again",
    "search.placeholder": "Search the terminal…",
    "search.notFound": "not found",
    "search.prev": "Previous (⇧↵)",
    "search.next": "Next (↵)",
    "search.close": "Close (esc)",
    "layout.auto": "Auto grid",
    "layout.cols": "Side by side",
    "layout.rows": "Stacked",
    "layout.equalize": "Equalize sizes",
    "common.cancel": "Cancel",
    "view.terminal": "Terminal",
    "view.panel": "Terminal panel",
    "toolbar.new": "New terminal ({key})",
    "toolbar.layout": "Layout",
    "toolbar.close": "Close terminals",
    "toolbar.hide": "Hide terminal",
    "toolbar.sessions": "Terminal  ·  {n} sessions",
    "tile.new": "New terminal",
    "common.broadcast": "Type into all terminals (MultiExec)",
    "confirm.closeOthersTitle": "Close the other terminals?",
    "confirm.closeAllTitle": "Close all terminals?",
    "confirm.busyOne": "A command is still running in {n} terminal{names}. Closing it will stop the command.",
    "confirm.busyMany": "Commands are still running in {n} terminals{names}. Closing them will stop these commands.",
    "confirm.closeAnyway": "Close anyway",
    "confirm.moveTitle": "Move the terminal?",
    "confirm.moveBusyOne": "A command is still running in {n} terminal{names}. Moving restarts the shell and stops the command.",
    "confirm.moveBusyMany": "Commands are still running in {n} terminals{names}. Moving restarts the shells and stops these commands.",
    "confirm.moveAnyway": "Move anyway",
    "common.closeThis": "Close this terminal",
    "common.closeOthers": "Close other terminals",
    "common.closeAllN": "Close all terminals ({n})",
    "notice.broadcastOn": "MultiExec on: everything you type goes to every terminal in this panel.",
    "notice.broadcastOff": "MultiExec off.",
    "cmd.toggle": "Show / hide terminal",
    "cmd.splitRight": "New terminal beside",
    "cmd.splitDown": "New terminal below",
    "cmd.restart": "Restart terminal (new shell)",
    "cmd.move": "Move terminal (right / bottom)",
    "cmd.openPanel": "Open terminal panel (full-screen tab)",
    "cmd.openHere": "Open terminal in the current note's folder",
    "cmd.closeAll": "Close all terminals",
    "common.captureLast": "Add last command and its output to note",
    "cmd.captureSelection": "Add selected terminal text to note",
    "menu.vaultFolder": "vault folder",
    "menu.openHere": "Open terminal here ({name})",
    "menu.openInNoteFolder": "Open terminal in this note's folder",
    "nav.button": "Terminal (right-click: terminal panel)",
    "nav.panel": "Terminal panel (full-screen tab)",
    "menu.newKey": "New terminal  {key}",
    "nav.hideKey": "Hide terminal",
    "nav.showKey": "Show terminal",
    "nav.newInVault": "New terminal in vault folder",
    "common.moveBottom": "Move to bottom",
    "common.moveRight": "Move to right",
    "nav.settings": "Terminal settings",
    "notify.failed": "✗ Command failed (code {code})",
    "notify.doneOk": "✓ Command finished",
    "notify.done": "Command finished",
    "notify.cmdFallback": "command",
    "notice.movedBottom": "Terminal: bottom",
    "notice.movedRight": "Terminal: right",
    "notice.noTerminal": "No open terminal.",
    "notice.noNote": "Open the note to add the output to first.",
    "notice.noSelection": "Select something in the terminal first.",
    "notice.noLastCmd": "Couldn't find the last command. Select the output and use 'Add selection to note'.",
    "notice.nothing": "Nothing to add.",
    "notice.added": "Added to note: {name}",
    "menu.copy": "Copy",
    "menu.paste": "Paste",
    "menu.selectAll": "Select all",
    "menu.noteFallback": "note",
    "menu.captureSelection": "Add selection to note",
    "menu.clear": "Clear screen",
    "menu.layout": "Layout…",
    "menu.hide": "Hide terminal",
    "set.side": "Terminal position",
    "set.sideDesc": "Where a newly opened terminal sits next to the note.",
    "set.sideRight": "Right",
    "set.sideBottom": "Bottom",
    "set.size": "Terminal size (%)",
    "set.sizeDesc": "Space a newly opened terminal takes up.",
    "set.notePlace": "Where terminal output goes in the note",
    "set.notePlaceDesc": "Right-click → 'Add last command and its output to note' / 'Add selection to note'. The output is added to the note you used last, with the time.",
    "set.placeCursor": "At the cursor",
    "set.placeEnd": "At the end of the note",
    "set.newOnly": "Applies to newly opened terminals.",
    "set.shell": "Shell",
    "set.shellDesc": "Leave empty to use the system default ({shell}). Command boundaries are known exactly in zsh, bash and PowerShell.",
    "set.startDir": "Start folder",
    "set.startVault": "Vault folder (notes)",
    "set.startHome": "Home folder (~)",
    "set.startCustom": "Custom folder",
    "set.persist": "Remember session",
    "set.persistDesc": "When Obsidian reopens, the terminal starts in the same folder and the previous screen content is shown (the shell restarts).",
    "set.history": "Remember recent commands",
    "set.historyDesc": "Keeps the last 40 commands you ran, with their folder, in this plugin's data.json (it syncs with your vault). ecu-newtab shows them under \"Recent commands\". Commands that look like they contain a password or token are never saved. Turning this off clears the list.",
    "set.clearHistory": "Clear command history",
    "set.clearHistoryDesc": "{n} commands saved.",
    "set.clearHistoryBtn": "Clear",
    "notice.historyCleared": "Command history cleared.",
    "set.hNotify": "Notify when a command finishes",
    "set.notify": "Send notification",
    "set.notifyDesc": "Tells you when a long-running command finishes: exit code (✓/✗), duration, and the server name if you're in ssh. Inside ssh, a command counts as finished when the prompt comes back.",
    "set.notifyAfter": "Minimum duration (seconds)",
    "set.notifyAfterDesc": "No notification for commands shorter than this.",
    "set.notifyMode": "When",
    "set.notifyAway": "When Obsidian is in the background or the terminal isn't visible",
    "set.notifyAlways": "Always",
    "set.sound": "Sound",
    "set.hLook": "Appearance and behavior",
    "set.font": "Font",
    "set.fontSize": "Font size",
    "set.cursor": "Cursor",
    "set.cursorBlock": "Block",
    "set.cursorBar": "Bar",
    "set.cursorUnderline": "Underline",
    "set.cursorBlink": "Blink",
    "set.copyOnSelect": "Copy on select",
    "set.copyOnSelectDesc": "Text you select with the mouse is copied to the clipboard automatically.",
    "set.optionMeta": "Use Option as Meta",
    "set.optionMetaDesc": "When off, Option types special/accented characters and ⌥←/→ jumps by word. When on, Option acts as an emacs-style Meta key.",
    "set.scrollback": "Scrollback lines",
    "set.scrollbackRange": "Between {min} and {max}.",
    "set.engine": "Terminal engine",
    "set.engineDesc": "node-pty {version} ({platform}). Download it again if terminals fail to start.",
    "notice.engineInstalled": "Terminal engine downloaded. If terminals still fail to start, reload Obsidian.",
    "set.helpMac": "Give \"Show / hide terminal\" and \"Move terminal\" a hotkey under Settings > Hotkeys (for example Cmd+J and Cmd+Shift+J). Cmd+D new terminal (added to the grid), ⌥⌘+arrow switch between terminals, Ctrl-D closes that terminal. Drag the dividers to resize, double-click to equalize. ⌘F search, ⌘K clear screen, ⌘+click opens a link. ⌥←/→ word, ⌘←/→ start/end of line, ⌘⌫ deletes the line. Right-click for the menu.",
    "set.helpOther": "Give \"Show / hide terminal\" and \"Move terminal\" a hotkey under Settings > Hotkeys (for example Ctrl+J and Ctrl+Shift+J). Ctrl+Shift+D new terminal (added to the grid), Alt+arrow switch between terminals. Ctrl+Shift+C copy, {paste} paste, Ctrl+Shift+F search, Ctrl+Shift+K clear screen. While the terminal has focus, only the hotkeys you gave these two commands and the command palette reach Obsidian; other Ctrl keys go to the shell. Ctrl+click opens a link. Right-click for the menu.",
  },
  tr: {
    "common.language": "Dil",
    "set.uiLangDesc": "Eklentinin arayüz dili. Otomatik, Obsidian'ın diline uyar.",
    "set.uiLangAuto": "Otomatik (Obsidian'a göre)",
    "set.uiLangEn": "English",
    "set.uiLangTr": "Türkçe",
    "notice.langChanged": "Dil değişti. Her yerde uygulanması için Obsidian'ı yeniden yükle.",
    "capture.noOutput": "(çıktı yok)",
    "engine.unsupported": "Bu platform desteklenmiyor: {platform}",
    "engine.badHash": "İndirilen dosya doğrulanamadı (SHA-256 uyuşmuyor).",
    "engine.notInstalled": "node-pty yüklü değil",
    "engine.title": "Terminal motoru gerekli",
    "engine.text": "ecu-terminal, kabuğu çalıştırmak için node-pty {version} ({platform}) kullanır. Bir kerelik indirilir: github.com/erencanucarr/ecu-terminal sürümlerinden gelir ve SHA-256 ile doğrulanır.",
    "engine.download": "İndir ve başlat",
    "engine.downloading": "İndiriliyor…",
    "engine.downloadFailed": "İndirilemedi: {error}",
    "dur.s": "{s} sn",
    "dur.ms": "{m} dk {s} sn",
    "dur.hm": "{h} sa {m} dk",
    "session.startFailed": "Terminal başlatılamadı: {error}",
    "session.restarted": "── oturum yeniden başlatıldı ──",
    "session.shellFailed": "Shell başlatılamadı ({shell}): {error}",
    "session.exited": "Shell kapandı (çıkış kodu {code}): {shell}",
    "session.exitedSignal": "Shell kapandı (sinyal {signal}): {shell}",
    "session.restartHint": "Yeniden başlatmak için Enter'a bas ya da Yeniden başlat'a tıkla.",
    "session.restart": "Yeniden başlat",
    "engine.redownload": "Motoru yeniden indir",
    "search.placeholder": "Terminalde ara…",
    "search.notFound": "bulunamadı",
    "search.prev": "Önceki (⇧↵)",
    "search.next": "Sonraki (↵)",
    "search.close": "Kapat (esc)",
    "layout.auto": "Otomatik ızgara",
    "layout.cols": "Yan yana",
    "layout.rows": "Alt alta",
    "layout.equalize": "Boyutları eşitle",
    "common.cancel": "Vazgeç",
    "view.terminal": "Terminal",
    "view.panel": "Terminal paneli",
    "toolbar.new": "Yeni terminal ({key})",
    "toolbar.layout": "Düzen",
    "toolbar.close": "Terminalleri kapat",
    "toolbar.hide": "Terminali gizle",
    "toolbar.sessions": "Terminal  ·  {n} oturum",
    "tile.new": "Yeni terminal",
    "common.broadcast": "Tüm terminallere yaz (MultiExec)",
    "confirm.closeOthersTitle": "Diğer terminaller kapatılsın mı?",
    "confirm.closeAllTitle": "Tüm terminaller kapatılsın mı?",
    "confirm.busyOne": "{n} terminalde hâlâ çalışan bir komut var{names}. Kapatırsan bu komutlar durdurulur.",
    "confirm.busyMany": "{n} terminalde hâlâ çalışan bir komut var{names}. Kapatırsan bu komutlar durdurulur.",
    "confirm.closeAnyway": "Yine de kapat",
    "confirm.moveTitle": "Terminal taşınsın mı?",
    "confirm.moveBusyOne": "{n} terminalde hâlâ çalışan bir komut var{names}. Taşımak shell'i yeniden başlatır ve komutu durdurur.",
    "confirm.moveBusyMany": "{n} terminalde hâlâ çalışan komutlar var{names}. Taşımak shell'leri yeniden başlatır ve bu komutları durdurur.",
    "confirm.moveAnyway": "Yine de taşı",
    "common.closeThis": "Bu terminali kapat",
    "common.closeOthers": "Diğer terminalleri kapat",
    "common.closeAllN": "Tüm terminalleri kapat ({n})",
    "notice.broadcastOn": "MultiExec açık: yazdığın her şey bu paneldeki tüm terminallere gidiyor.",
    "notice.broadcastOff": "MultiExec kapalı.",
    "cmd.toggle": "Terminali göster / gizle",
    "cmd.splitRight": "Yana yeni terminal",
    "cmd.splitDown": "Alta yeni terminal",
    "cmd.restart": "Terminali yeniden başlat (yeni shell)",
    "cmd.move": "Terminali taşı (sağ / alt)",
    "cmd.openPanel": "Terminal panelini aç (tam ekran sekme)",
    "cmd.openHere": "Terminali açık notun klasöründe aç",
    "cmd.closeAll": "Tüm terminalleri kapat",
    "common.captureLast": "Son komutu ve çıktısını nota ekle",
    "cmd.captureSelection": "Terminalde seçili metni nota ekle",
    "menu.vaultFolder": "kasa klasörü",
    "menu.openHere": "Terminali burada aç ({name})",
    "menu.openInNoteFolder": "Terminali bu notun klasöründe aç",
    "nav.button": "Terminal (sağ tık: terminal paneli)",
    "nav.panel": "Terminal paneli (tam ekran sekme)",
    "menu.newKey": "Yeni terminal  {key}",
    "nav.hideKey": "Terminali gizle",
    "nav.showKey": "Terminali göster",
    "nav.newInVault": "Kasa klasöründe yeni terminal",
    "common.moveBottom": "Alta taşı",
    "common.moveRight": "Sağa taşı",
    "nav.settings": "Terminal ayarları",
    "notify.failed": "✗ Komut hata verdi (kod {code})",
    "notify.doneOk": "✓ Komut bitti",
    "notify.done": "Komut bitti",
    "notify.cmdFallback": "komut",
    "notice.movedBottom": "Terminal: altta",
    "notice.movedRight": "Terminal: sağda",
    "notice.noTerminal": "Açık terminal yok.",
    "notice.noNote": "Önce çıktının ekleneceği notu aç.",
    "notice.noSelection": "Terminalde önce bir şey seç.",
    "notice.noLastCmd": "Son komut bulunamadı. Çıktıyı seçip 'Seçimi nota ekle'yi kullan.",
    "notice.nothing": "Eklenecek bir şey yok.",
    "notice.added": "Nota eklendi: {name}",
    "menu.copy": "Kopyala",
    "menu.paste": "Yapıştır",
    "menu.selectAll": "Tümünü seç",
    "menu.noteFallback": "not",
    "menu.captureSelection": "Seçimi nota ekle",
    "menu.clear": "Ekranı temizle",
    "menu.layout": "Düzen…",
    "menu.hide": "Terminali gizle",
    "set.side": "Terminal konumu",
    "set.sideDesc": "Yeni açılan terminal notun neresinde dursun.",
    "set.sideRight": "Sağda",
    "set.sideBottom": "Altta",
    "set.size": "Terminal boyutu (%)",
    "set.sizeDesc": "Yeni açılan terminalin kapladığı alan.",
    "set.notePlace": "Terminal çıktısı nota nereye eklensin",
    "set.notePlaceDesc": "Sağ tık → 'Son komutu ve çıktısını nota ekle' / 'Seçimi nota ekle'. Çıktı en son kullandığın nota, saatiyle birlikte eklenir.",
    "set.placeCursor": "İmlecin olduğu yere",
    "set.placeEnd": "Notun sonuna",
    "set.newOnly": "Yeni açılan terminallerde geçerli olur.",
    "set.shell": "Shell",
    "set.shellDesc": "Boş bırakırsan sistemdeki varsayılan kullanılır ({shell}). zsh, bash ve PowerShell'de komut sınırları kesin bilinir.",
    "set.startDir": "Başlangıç klasörü",
    "set.startVault": "Kasa klasörü (notlar)",
    "set.startHome": "Ev klasörü (~)",
    "set.startCustom": "Özel klasör",
    "set.persist": "Oturumu hatırla",
    "set.persistDesc": "Obsidian yeniden açılınca terminal aynı klasörde başlar ve önceki ekran içeriği görünür (shell yeniden başlar).",
    "set.history": "Son komutları hatırla",
    "set.historyDesc": "Çalıştırdığın son 40 komutu, klasörleriyle birlikte bu eklentinin data.json dosyasında tutar (kasanla birlikte eşitlenir). ecu-newtab bunları \"Son komutlar\" altında gösterir. Şifre ya da token içerdiği anlaşılan komutlar hiç kaydedilmez. Kapatınca liste silinir.",
    "set.clearHistory": "Komut geçmişini temizle",
    "set.clearHistoryDesc": "{n} komut kayıtlı.",
    "set.clearHistoryBtn": "Temizle",
    "notice.historyCleared": "Komut geçmişi temizlendi.",
    "set.hNotify": "Komut bitince bildirim",
    "set.notify": "Bildirim gönder",
    "set.notifyDesc": "Uzun süren bir komut bitince haber verir: çıkış kodu (✓/✗), süre ve ssh'teysen sunucu adıyla. ssh içindeki komutların bitişi prompt'un geri gelmesinden anlaşılır.",
    "set.notifyAfter": "En az süre (saniye)",
    "set.notifyAfterDesc": "Bundan kısa süren komutlar için bildirim gelmez.",
    "set.notifyMode": "Ne zaman",
    "set.notifyAway": "Obsidian arka plandayken ya da terminal görünmüyorken",
    "set.notifyAlways": "Her zaman",
    "set.sound": "Ses",
    "set.hLook": "Görünüm ve davranış",
    "set.font": "Yazı tipi",
    "set.fontSize": "Yazı boyutu",
    "set.cursor": "İmleç",
    "set.cursorBlock": "Blok",
    "set.cursorBar": "Çizgi",
    "set.cursorUnderline": "Alt çizgi",
    "set.cursorBlink": "Yanıp sönsün",
    "set.copyOnSelect": "Seçince kopyala",
    "set.copyOnSelectDesc": "Fareyle seçtiğin metin otomatik panoya kopyalanır.",
    "set.optionMeta": "Option tuşu Meta gibi davransın",
    "set.optionMetaDesc": "Kapalıyken Option ile Türkçe/özel karakter yazılır ve ⌥←/→ kelime atlar. Açıkken Option, emacs tarzı Meta tuşu olur.",
    "set.scrollback": "Geçmiş satır sayısı",
    "set.scrollbackRange": "{min} ile {max} arasında.",
    "set.engine": "Terminal motoru",
    "set.engineDesc": "node-pty {version} ({platform}). Terminaller başlamıyorsa yeniden indir.",
    "notice.engineInstalled": "Terminal motoru indirildi. Terminaller hâlâ başlamıyorsa Obsidian'ı yeniden yükle.",
    "set.helpMac": "\"Terminali göster / gizle\" ve \"Terminali taşı\" komutlarına Ayarlar > Kısayollar'dan kısayol ata (örneğin Cmd+J ve Cmd+Shift+J). Cmd+D yeni terminal (ızgaraya eklenir), ⌥⌘+ok terminaller arası geçiş, Ctrl-D o terminali kapatır. Ayraçları sürükleyerek boyutlandır, çift tıkla eşitle. ⌘F ara, ⌘K ekranı temizle, ⌘+tık bağlantıyı açar. ⌥←/→ kelime, ⌘←/→ satır başı/sonu, ⌘⌫ satırı siler. Sağ tıkla menü.",
    "set.helpOther": "\"Terminali göster / gizle\" ve \"Terminali taşı\" komutlarına Ayarlar > Kısayollar'dan kısayol ata (örneğin Ctrl+J ve Ctrl+Shift+J). Ctrl+Shift+D yeni terminal (ızgaraya eklenir), Alt+ok terminaller arası geçiş. Ctrl+Shift+C kopyala, {paste} yapıştır, Ctrl+Shift+F ara, Ctrl+Shift+K ekranı temizle. Terminal odaktayken yalnızca bu iki komuta ve komut paletine atadığın kısayollar Obsidian'a ulaşır; diğer Ctrl tuşları kabuğa gider. Ctrl+tık bağlantıyı açar. Sağ tıkla menü.",
  },
};
let uiLang = "en";
function t(key, vars) {
  const s = (STRINGS[uiLang] && STRINGS[uiLang][key]) || STRINGS.en[key] || key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m)) : s;
}
function resolveUiLang(pref) {
  if (pref === "en" || pref === "tr") return pref;
  let code = "";
  try {
    const obs = require("obsidian");
    code = typeof obs.getLanguage === "function" ? obs.getLanguage() : obs.moment.locale();
  } catch (e) {
    code = "";
  }
  return /^tr/i.test(code) ? "tr" : "en";
}
function setUiLang(pref) {
  uiLang = resolveUiLang(pref);
  return uiLang;
}

const nodeRequire = window.require;
const path = nodeRequire("path");
const fs = nodeRequire("fs");
const os = nodeRequire("os");

const IS_MAC = process.platform === "darwin";
const IS_WIN = process.platform === "win32";
const KEY = IS_MAC
  ? { toggle: "⌘J", move: "⌘⇧J", split: "⌘D", search: "⌘F", clear: "⌘K", copy: "⌘C", paste: "⌘V", nav: "⌥⌘+ok", palette: "⌘P" }
  : { toggle: "Ctrl+J", move: "Ctrl+Shift+J", split: "Ctrl+Shift+D", search: "Ctrl+Shift+F", clear: "Ctrl+Shift+K", copy: "Ctrl+Shift+C", paste: IS_WIN ? "Ctrl+V" : "Ctrl+Shift+V", nav: "Alt+ok", palette: "Ctrl+Shift+P" };

function defaultShell() {
  if (IS_WIN) {
    const sys = process.env.SystemRoot || "C:\\Windows";
    const cands = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, "PowerShell", "7", "pwsh.exe"),
      path.join(sys, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ];
    for (const c of cands) {
      try {
        if (c && fs.existsSync(c)) return c;
      } catch (e) {}
    }
    return process.env.COMSPEC || "cmd.exe";
  }
  return process.env.SHELL || (IS_MAC ? "/bin/zsh" : "/bin/bash");
}

const VIEW = "ecu-terminal-view";
const LEGACY_VIEW = "terminal-view";
const HIDDEN = "qt-hidden";
const BEFORE_HIDDEN = "ecu-before-hidden";
const TERM_TABS = "ecu-term-tabs";
const DEFAULTS = {
  uiLang: "auto",
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
  rememberCommands: true,
  history: [],
};

const TRIVIAL_RE = /^(exit|logout|clear|reset|ls|ll|la|pwd|cd|cd \S+|history|q|:q)$/;

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
  const out = cap.output || t("capture.noOutput");
  const fence = fenceFor(out);
  return `${head}\n${fence}text\n${out}\n${fence}`;
}

const PTY_VERSION = "1.1.0";
const PTY_RELEASE_URL = "https://github.com/erencanucarr/ecu-terminal/releases/download/node-pty-" + PTY_VERSION;
const PTY_SHA256 = {
  "darwin-arm64": "c32d517b10189c762e829bf6d343ef57294fcaefb32761a611d2ccd05678562d",
  "darwin-x64": "9eb69ad5b64c85d187a301062fdfad8b50442306b283ac6940cf8cf66e43fdd3",
  "linux-arm64": "b6c11247e95ab47bc801b1136f271a5c9d63f4502827be77db3a206dbcfb048a",
  "linux-x64": "7e7f7ab98a3c545e596691eb18a4cd5447b223148a7df7337d8e7ae3fce3f75c",
  "win32-arm64": "8bd3700ac6ffe0e70d0fcffca2dd7537b4a2d0f5c66773e0b5b64ac5bdd343b7",
  "win32-x64": "d868c695cb8bd310b9c3fe857f45ef481a920dbe48ac20f5879df0031691078c",
};
const PLATFORM_KEY = process.platform + "-" + process.arch;

function ptyDir(dir) {
  for (const d of [path.join(dir, "node-pty"), path.join(dir, "vendor", "node-pty")]) {
    try {
      if (fs.existsSync(path.join(d, "package.json")) && fs.existsSync(path.join(d, "prebuilds", PLATFORM_KEY))) return d;
    } catch (e) {}
  }
  return null;
}

function untar(buf, dest) {
  const root = path.resolve(dest);
  let off = 0;
  const str = (a, b) => buf.toString("utf8", off + a, off + b).replace(/\0.*$/s, "");
  while (off + 512 <= buf.length) {
    if (buf.readUInt32BE(off) === 0 && buf.readUInt32BE(off + 4) === 0) break;
    const name = str(0, 100);
    const mode = parseInt(str(100, 108).trim() || "644", 8);
    const size = parseInt(str(124, 136).trim() || "0", 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(345, 500);
    const rel = (prefix ? prefix + "/" : "") + name;
    const target = path.resolve(root, rel);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error("unsafe path in archive: " + rel);
    off += 512;
    if (type === "5") fs.mkdirSync(target, { recursive: true });
    else if (type === "0" || type === "\0") {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buf.subarray(off, off + size));
      if (process.platform !== "win32") fs.chmodSync(target, mode & 0o755);
    }
    off += Math.ceil(size / 512) * 512;
  }
}

async function installEngine(dir) {
  const sha = PTY_SHA256[PLATFORM_KEY];
  if (!sha) throw new Error(t("engine.unsupported", { platform: PLATFORM_KEY }));
  const res = await requestUrl({ url: `${PTY_RELEASE_URL}/node-pty-${PLATFORM_KEY}.tar.gz`, method: "GET" });
  const Buf = nodeRequire("buffer").Buffer;
  const gz = Buf.from(res.arrayBuffer);
  const got = nodeRequire("crypto").createHash("sha256").update(gz).digest("hex");
  if (got !== sha) throw new Error(t("engine.badHash"));
  const tmp = path.join(dir, ".node-pty-download");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  untar(nodeRequire("zlib").gunzipSync(gz), tmp);
  const final = path.join(dir, "node-pty");
  const old = path.join(dir, ".node-pty-old");
  fs.rmSync(old, { recursive: true, force: true });
  if (fs.existsSync(final)) fs.renameSync(final, old);
  try {
    fs.renameSync(path.join(tmp, "node-pty"), final);
  } catch (e) {
    if (fs.existsSync(old) && !fs.existsSync(final)) fs.renameSync(old, final);
    throw e;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  try {
    fs.rmSync(old, { recursive: true, force: true });
    if (process.platform === "darwin") fs.chmodSync(path.join(final, "prebuilds", PLATFORM_KEY, "spawn-helper"), 0o755);
  } catch (e) {
  }
}

let ENGINE = null;
function loadEngine(dir) {
  if (ENGINE) return ENGINE;
  const pdir = ptyDir(dir);
  if (!pdir) throw new Error(t("engine.notInstalled"));
  if (process.platform === "darwin") {
    try {
      fs.chmodSync(path.join(pdir, "prebuilds", PLATFORM_KEY, "spawn-helper"), 0o755);
    } catch (e) {}
  }
  ENGINE = { pty: nodeRequire(pdir), Terminal, FitAddon, WebLinksAddon, SerializeAddon, SearchAddon, Unicode11Addon };
  return ENGINE;
}

const BASH_INIT = (login) =>
  [
    "# ecu-terminal: bash shell entegrasyonu",
    login
      ? '[ -f /etc/profile ] && . /etc/profile; for __f in ~/.bash_profile ~/.bash_login ~/.profile; do if [ -f "$__f" ]; then . "$__f"; break; fi; done; unset __f'
      : '[ -f ~/.bashrc ] && . ~/.bashrc',
    'if [ -z "$__ECU_SHELL_INTEGRATION" ]; then',
    "__ECU_SHELL_INTEGRATION=1",
    "__ecu_ready=",
    "__ecu_pc_start() { __ecu_ec=$?; __ecu_ready=; }",
    "__ecu_pc_end() {",
    "  printf '\\e]133;D;%s\\e\\\\' \"$__ecu_ec\"",
    "  printf '\\e]7;file://%s\\e\\\\' \"${PWD}\"",
    "  printf '\\e]133;A\\e\\\\'",
    "  __ecu_ready=1",
    "  return $__ecu_ec",
    "}",
    "__ecu_preexec() {",
    '  [ -n "$__ecu_ready" ] || return 0',
    '  [ -n "$COMP_LINE" ] && return 0',
    '  case "$BASH_COMMAND" in __ecu_pc_*) return 0;; esac',
    "  __ecu_ready=",
    "  local c; c=$(HISTTIMEFORMAT= builtin history 1)",
    "  c=\"${c#*[0-9] }\"; c=\"${c#\"${c%%[![:space:]]*}\"}\"",
    "  printf '\\e]133;E;%s\\e\\\\' \"${c//[[:cntrl:]]/ }\"",
    "  printf '\\e]133;B\\e\\\\'",
    "}",
    'if [[ "$(declare -p PROMPT_COMMAND 2>/dev/null)" == "declare -a"* ]]; then',
    '  PROMPT_COMMAND=(__ecu_pc_start "${PROMPT_COMMAND[@]}" __ecu_pc_end)',
    "else",
    '  PROMPT_COMMAND="__ecu_pc_start${PROMPT_COMMAND:+; $PROMPT_COMMAND}; __ecu_pc_end"',
    "fi",
    'if [ -z "$(trap -p DEBUG)" ]; then trap \'__ecu_preexec\' DEBUG; fi',
    "fi",
    "",
  ].join("\n");

const PWSH_INIT = [
  "if ($null -eq $global:__ecuInit) {",
  "  $global:__ecuInit = $true",
  "  $global:__ecuOrigPrompt = $function:prompt",
  "  function global:prompt {",
  "    $ok = $?; $ec = $global:LASTEXITCODE",
  "    $e = [char]27",
  "    $code = if ($ok) { 0 } elseif ($ec -is [int] -and $ec -ne 0) { $ec } else { 1 }",
  "    $dir = ($PWD.ProviderPath -replace '\\\\', '/')",
  '    "$e]133;D;$code$e\\$e]7;file:///$dir$e\\$e]133;A$e\\" + (& $global:__ecuOrigPrompt)',
  "  }",
  "  if (Get-Module PSReadLine) {",
  "    $global:__ecuPrevHist = (Get-PSReadLineOption).AddToHistoryHandler",
  "    Set-PSReadLineOption -AddToHistoryHandler {",
  "      param($line)",
  "      $e = [char]27",
  "      $c = $line -replace '[\\x00-\\x1f]', ' '",
  '      [Console]::Write("$e]133;E;$c$e\\$e]133;B$e\\")',
  "      if ($global:__ecuPrevHist) { & $global:__ecuPrevHist $line } else { $true }",
  "    }",
  "  }",
  "}",
].join("\n");

function writeBashIntegration(dir) {
  const bdir = path.join(dir, "shell");
  fs.mkdirSync(bdir, { recursive: true });
  const p = path.join(bdir, "ecu-init.bash");
  const body = BASH_INIT(IS_MAC);
  if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== body) fs.writeFileSync(p, body);
  return p;
}

function shellLaunch(plugin, shell, env) {
  const kind = shellKind(shell);
  if (kind === "zsh") {
    try {
      const zdir = writeShellIntegration(plugin.pluginDir());
      if (process.env.ZDOTDIR) env.__ECU_USER_ZDOTDIR = process.env.ZDOTDIR;
      env.ZDOTDIR = zdir;
    } catch (e) {}
    return ["-l"];
  }
  if (kind === "bash") {
    try {
      return ["--init-file", writeBashIntegration(plugin.pluginDir()), "-i"];
    } catch (e) {
      return IS_MAC ? ["-l"] : ["-i"];
    }
  }
  if (kind === "pwsh" || kind === "powershell") {
    return ["-NoLogo", "-NoExit", "-EncodedCommand", nodeRequire("buffer").Buffer.from(PWSH_INIT, "utf16le").toString("base64")];
  }
  if (kind === "cmd" || IS_WIN) return [];
  return ["-l"];
}

function writeShellIntegration(dir) {
  const zdir = path.join(dir, "shell");
  fs.mkdirSync(zdir, { recursive: true });
  const init = path.join(zdir, "ecu-init.zsh");
  const files = {
    ".zshenv": `[[ -f "\${__ECU_USER_ZDOTDIR:-$HOME}/.zshenv" ]] && source "\${__ECU_USER_ZDOTDIR:-$HOME}/.zshenv"\n`,
    ".zprofile": `[[ -f "\${__ECU_USER_ZDOTDIR:-$HOME}/.zprofile" ]] && source "\${__ECU_USER_ZDOTDIR:-$HOME}/.zprofile"\n`,
    ".zshrc": `source ${shQuote(init)}\n`,
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
      "  printf '\\e]7;file://%s\\e\\\\' \"${PWD}\"",
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
  probe.setCssStyles({ color: "" });
  probe.setCssStyles({ color: expr });
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
  if (s < 60) return t("dur.s", { s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("dur.ms", { m, s: s % 60 });
  return t("dur.hm", { h: Math.floor(m / 60), m: m % 60 });
}

const RESTART_MARKS = Object.values(STRINGS).map((x) => x["session.restarted"]).filter(Boolean);

function tidyRestored(buffer) {
  return tidyBuffer(buffer, RESTART_MARKS);
}

class TermSession {
  constructor(view, opts) {
    this.view = view;
    this.plugin = view.plugin;
    this.restore = opts || {};
    this.command = (opts && opts.command) || "";
    this.resumeCommand = (opts && opts.resumeCommand) || "";
    this.commandSentAt = 0;
    this.lastDataAt = 0;
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
    const close = head.createEl("button", { cls: "ecu-pane-close clickable-icon", attr: { "aria-label": t("common.closeThis") } });
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
      pick(this.cwd) ||
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
      this.showEngineFailed(e);
      return;
    }
    this.engineFailed = false;
    const s = this.plugin.settings;
    const term = new E.Terminal({
      fontFamily: s.fontFamily || DEFAULTS.fontFamily,
      fontSize: Number(s.fontSize) || 14,
      lineHeight: Number(s.lineHeight) || 1,
      cursorStyle: s.cursorStyle,
      cursorBlink: !!s.cursorBlink,
      scrollback: clampScrollback(s.scrollback, DEFAULTS.scrollback),
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
    this.savedBuffer = this.restore.buffer ? tidyRestored(this.restore.buffer) : null;
    this.touched = false;
    if (this.savedBuffer) term.write(this.savedBuffer + "\r\n\x1b[2m" + t("session.restarted") + "\x1b[0m\r\n");
    this.installHandlers();
    this.fitNow();
    term.onData((d) => this.input(d));
    term.onBinary((d) => this.input(d, true));
    this.spawn();
    this.restore = {};
  }

  showEngineFailed(e) {
    this.engineFailed = true;
    this.hostEl.empty();
    const box = this.hostEl.createDiv({ cls: "ecu-pane-failed" });
    box.createDiv({ text: t("session.startFailed", { error: e && e.message ? e.message : e }) });
    const row = box.createDiv({ cls: "ecu-engine-row" });
    const btn = row.createEl("button", { cls: "mod-cta", text: t("engine.redownload") });
    const status = row.createSpan({ cls: "ecu-engine-status" });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.setText(t("engine.downloading"));
      try {
        await this.plugin.installEngine();
      } catch (err) {
        btn.disabled = false;
        status.setText(t("engine.downloadFailed", { error: err && err.message ? err.message : err }));
      }
    });
  }

  retryStart() {
    if (this.closed || !this.engineFailed) return;
    this.hostEl.empty();
    this.start();
  }

  spawn() {
    const term = this.term;
    const s = this.plugin.settings;
    const E = this.plugin.engine();
    const shell = s.shellPath || defaultShell();
    this.shellName = String(shell).split(/[\\/]/).pop().replace(/\.exe$/i, "").toLowerCase();
    const env = Object.assign({}, process.env, {
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      TERM_PROGRAM: "ecu-terminal",
      LANG: process.env.LANG || "en_US.UTF-8",
    });
    cleanShellEnv(env);
    const args = shellLaunch(this.plugin, shell, env);
    this.cwd = this.startDir();
    let p;
    try {
      p = E.pty.spawn(shell, args, { name: "xterm-256color", cols: term.cols, rows: term.rows, cwd: this.cwd, env });
    } catch (e) {
      term.write(`\r\n\x1b[31m${t("session.shellFailed", { shell, error: e && e.message ? e.message : e })}\x1b[0m\r\n`);
      this.showExited();
      return;
    }
    this.ptyProc = p;
    this.typed = false;
    this.spawnedAt = Date.now();
    this.ptySubs = [this.pipe(p, term), p.onExit((ev) => this.ptyExited(p, ev, shell))];
    this.updateCaption();
    if (this.command && !this.commandSentAt) this.runWhenReady(p, this.command);
  }

  runWhenReady(p, cmd) {
    const started = Date.now();
    const tick = () => {
      if (this.closed || this.ptyProc !== p) return;
      const now = Date.now();
      const quiet = this.lastDataAt && now - this.lastDataAt > 250;
      if ((this.integrated && quiet) || (quiet && now - started > 600) || now - started > 5000) {
        this.commandSentAt = Date.now();
        this.touched = true;
        p.write(cmd + "\r");
        return;
      }
      this.hostEl.win.setTimeout(tick, 100);
    };
    this.hostEl.win.setTimeout(tick, 150);
  }

  ptyExited(p, ev, shell) {
    if (this.ptyProc !== p) return;
    this.ptyProc = null;
    this.localRun = this.remoteRun = null;
    if (this.closed) return;
    if (!exitFailed({ ms: Date.now() - this.spawnedAt, typed: this.typed })) return this.view.removeSession(this);
    const signal = ev && ev.signal;
    const msg = signal
      ? t("session.exitedSignal", { signal, shell })
      : t("session.exited", { code: ev && ev.exitCode != null ? ev.exitCode : "?", shell });
    if (this.term) this.term.write(`\r\n\x1b[2m${msg}\x1b[0m\r\n`);
    this.showExited();
  }

  showExited() {
    this.exited = true;
    if (this.term) this.term.write(`\x1b[2m${t("session.restartHint")}\x1b[0m\r\n`);
    if (this.exitEl) return;
    this.exitEl = this.el.createDiv({ cls: "ecu-pane-exit" });
    const btn = this.exitEl.createEl("button", { cls: "mod-cta", text: t("session.restart") });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.restartShell();
    });
  }

  restartShell() {
    if (this.closed || !this.exited || !this.term) return;
    this.exited = false;
    if (this.exitEl) {
      this.exitEl.remove();
      this.exitEl = null;
    }
    this.disposePty();
    this.term.write("\r\n");
    try {
      this.spawn();
    } catch (e) {
      this.term.write(`\r\n\x1b[31m${t("session.startFailed", { error: e && e.message ? e.message : e })}\x1b[0m\r\n`);
      this.showExited();
      return;
    }
    this.fitNow();
    this.focus();
  }

  disposePty() {
    for (const d of this.ptySubs || []) {
      try {
        d.dispose();
      } catch (e) {
      }
    }
    this.ptySubs = null;
  }

  pipe(p, term) {
    return pipeData(p, term, () => {
      this.lastDataAt = Date.now();
      if (this.remoteRun) this.checkRemoteDone();
    });
  }

  input(d, binary) {
    if (this.exited) {
      if (!binary && d.includes("\r")) this.restartShell();
      return;
    }
    this.touched = true;
    this.typed = true;
    const data = binary ? nodeRequire("buffer").Buffer.from(d, "binary") : d;
    const enter = !binary && d.includes("\r");
    if (enter) this.noteEnter();
    if (this.view.broadcast) {
      for (const s of this.view.sessions) {
        s.touched = true;
        s.typed = true;
        if (s.ptyProc) s.ptyProc.write(data);
        if (s !== this && enter) s.noteEnter();
      }
    } else if (this.ptyProc) this.ptyProc.write(data);
  }

  noteEnter() {
    if (!this.term || this.term.buffer.active.type !== "normal") return;
    if (this.integrated && !this.localRun) return;
    const b = this.term.buffer.active;
    const line = b.getLine(b.baseY + b.cursorY);
    const p = splitPrompt(line ? line.translateToString(true) : "");
    if (p && p.cmd) {
      this.remoteRun = { cmd: p.cmd, prompt: p.prompt, t: Date.now() };
      if (!this.command) this.plugin.recordCommand(p.cmd, hostOf(p.prompt), "");
    }
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
        const start = term.registerMarker(0);
        this.commands.push({ cmd: this.pendingCmd, start, end: null, exit: null });
        if (!this.plugin.localHost && start) {
          const p = splitPrompt(this.linesBetween(start.line - 1, start.line)[0] || "");
          if (p && hostOf(p.prompt)) this.plugin.localHost = hostOf(p.prompt);
        }
        this.localRun = { cmd: this.pendingCmd, t: Date.now() };
        if (!this.command) this.plugin.recordCommand(this.pendingCmd, "", this.cwd);
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
        if (/^\/[A-Za-z]:/.test(this.cwd)) this.cwd = this.cwd.slice(1);
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
      if (IS_MAC ? e.metaKey && e.altKey && /^Arrow/.test(e.key) : e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Arrow/.test(e.key)) {
        e.preventDefault();
        this.view.focusNeighbor(e.key.slice(5).toLowerCase(), this);
        return false;
      }
      if (!IS_MAC) return this.ctrlKeys(e);
      if (e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "c") {
          if (term.hasSelection()) {
            this.hostEl.win.navigator.clipboard.writeText(term.getSelection()).catch(() => {});
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
      if (!e.ctrlKey && !e.shiftKey && READLINE_KEYS[combo] && !(e.altKey && s.optionIsMeta) && this.shellName !== "pwsh" && this.shellName !== "powershell") {
        this.input(READLINE_KEYS[combo]);
        e.preventDefault();
        return false;
      }
      if (e.metaKey) return false;
      return true;
    });

    term.onSelectionChange(() => {
      if (!this.plugin.settings.copyOnSelect) return;
      clearTimeout(this.selTimer);
      this.selTimer = setTimeout(() => {
        if (term.hasSelection()) this.hostEl.win.navigator.clipboard.writeText(term.getSelection()).catch(() => {});
      }, 200);
    });
    if (term.textarea) {
      term.textarea.addEventListener("focus", () => {
        this.view.setActive(this);
        if (!IS_MAC) this.plugin.enterTermScope();
      });
      term.textarea.addEventListener("blur", () => {
        if (!IS_MAC) this.plugin.leaveTermScope();
      });
    }

    const win = this.hostEl.win;
    this.ro = new win.ResizeObserver(() => {
      win.cancelAnimationFrame(this.raf);
      this.raf = win.requestAnimationFrame(() => this.fitNow());
    });
    this.ro.observe(this.hostEl);
  }

  ctrlKeys(e) {
    const term = this.term;
    const k = e.key.toLowerCase();
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    const paste = () => {
      this.hostEl.win.navigator.clipboard.readText().then((t) => t && term.paste(t)).catch(() => {});
      return stop();
    };
    if (e.ctrlKey && !e.altKey && !e.metaKey && e.shiftKey) {
      if (k === "c") {
        if (term.hasSelection()) this.hostEl.win.navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        return stop();
      }
      if (k === "v") return paste();
      if (k === "f") {
        stop();
        this.openSearch();
        return false;
      }
      if (k === "k") {
        term.clear();
        return stop();
      }
      if (k === "a") {
        term.selectAll();
        return stop();
      }
      if (k === "d") return false;
    }
    if (this.plugin.isTermHotkey(e)) return false;
    if (e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (IS_WIN && k === "c" && term.hasSelection()) {
        this.hostEl.win.navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
        return stop();
      }
      if (IS_WIN && k === "v") return paste();
    }
    return true;
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
    return !!(this.el.offsetWidth && this.el.offsetHeight) && !this.el.doc.hidden;
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
    const input = bar.createEl("input", { type: "text", attr: { placeholder: t("search.placeholder") } });
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
      info.setText(ok ? "" : t("search.notFound"));
    };
    btn("arrow-up", t("search.prev"), () => find(true));
    btn("arrow-down", t("search.next"), () => find(false));
    btn("x", t("search.close"), () => this.closeSearch());
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
    if (this.command) {
      st.command = this.resumeCommand || this.command;
      if (this.resumeCommand) st.resumeCommand = this.resumeCommand;
      return st;
    }
    if (this.plugin.settings.persistBuffer && !this.term && this.restore.buffer) {
      st.buffer = this.restore.buffer;
    } else if (this.plugin.settings.persistBuffer && !this.touched && this.savedBuffer) {
      st.buffer = this.savedBuffer;
    } else if (this.plugin.settings.persistBuffer && this.term && this.serialize) {
      try {
        st.buffer = this.serialize.serialize({ scrollback: 300, excludeAltBuffer: true, excludeModes: true });
      } catch (e) {
      }
    }
    return st;
  }

  dispose() {
    this.closed = true;
    clearTimeout(this.remoteTimer);
    clearTimeout(this.selTimer);
    this.hostEl.win.cancelAnimationFrame(this.raf);
    this.disposePty();
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

const LAYOUTS = {
  get auto() {
    return t("layout.auto");
  },
  get cols() {
    return t("layout.cols");
  },
  get rows() {
    return t("layout.rows");
  },
};

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
    row.createEl("button", { text: t("common.cancel") }).addEventListener("click", () => this.close());
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
    this.tool = null;
  }
  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    if (this.tool) return this.tool.title || t("view.terminal");
    return this.isPanel ? t("view.panel") : t("view.terminal");
  }
  getIcon() {
    return (this.tool && this.tool.icon) || "terminal";
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
    if (state && state.tool && state.tool.id) {
      this.tool = { id: String(state.tool.id), title: state.tool.title || "", icon: state.tool.icon || "" };
      this.contentEl.addClass("is-tool");
      try {
        this.leaf.updateHeader();
      } catch (e) {
      }
    }
    if (state && state.panel) {
      this.isPanel = true;
      this.contentEl.addClass("is-panel");
      try {
        this.leaf.updateHeader();
      } catch (e) {
      }
      this.plugin.syncTermTabs();
    }
    if (state && !this.started) this.restore = state;
    await super.setState(state, result);
  }
  showEngineCard() {
    if (this.engineEl) return;
    const card = (this.engineEl = this.gridEl.createDiv({ cls: "ecu-engine-card" }));
    card.createDiv({ cls: "ecu-engine-title", text: t("engine.title") });
    card.createDiv({
      cls: "ecu-engine-text",
      text: t("engine.text", { version: PTY_VERSION, platform: PLATFORM_KEY }),
    });
    const row = card.createDiv({ cls: "ecu-engine-row" });
    const btn = row.createEl("button", { cls: "mod-cta", text: t("engine.download") });
    const status = row.createSpan({ cls: "ecu-engine-status" });
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      status.setText(t("engine.downloading"));
      try {
        await this.plugin.installEngine();
      } catch (e) {
        btn.disabled = false;
        status.setText(t("engine.downloadFailed", { error: e && e.message ? e.message : e }));
      }
    });
  }

  engineInstalled() {
    if (!this.started) return this.start();
    for (const s of this.sessions.slice()) s.retryStart();
  }

  getState() {
    if (!this.started && this.restore) return Object.assign({ panel: this.isPanel || undefined, tool: this.tool || undefined }, this.restore);
    return {
      panel: this.isPanel || undefined,
      tool: this.tool || undefined,
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
    tool("plus", t("toolbar.new", { key: KEY.split }), () => this.addSession({ cwd: this.active && this.active.cwd }));
    this.layoutBtn = tool("layout-grid", t("toolbar.layout"), (e) => this.layoutMenu(e));
    this.broadcastBtn = tool("radio-tower", t("common.broadcast"), () => this.setBroadcast(!this.broadcast), "ecu-broadcast-btn");
    this.closeBtn = tool("x", t("toolbar.close"), (e) => this.closeMenu(e));
    this.hideBtn = tool("chevron-down", t("toolbar.hide"), () => this.plugin.toggle());
    this.gridEl = root.createDiv({ cls: "ecu-grid" });
    setTimeout(() => this.hideBtn && this.hideBtn.toggle(!this.isPanel && !this.tool), 0);
    this.ro = new this.gridEl.win.ResizeObserver(() => {
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
    if (!this.plugin.engineReady()) return this.showEngineCard();
    this.started = true;
    if (this.engineEl) {
      this.engineEl.remove();
      this.engineEl = null;
    }
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
    if (!this.plugin.engineReady()) {
      this.showEngineCard();
      return null;
    }
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
      keep ? t("confirm.closeOthersTitle") : t("confirm.closeAllTitle"),
      t(busy.length === 1 ? "confirm.busyOne" : "confirm.busyMany", { n: busy.length, names: names ? ` (${names})` : "" }),
      t("confirm.closeAnyway"),
      go
    ).open();
  }

  closeMenu(evt) {
    const menu = new Menu();
    const n = this.sessions.length;
    menu.addItem((i) =>
      i.setTitle(t("common.closeThis")).setIcon("x").onClick(() => this.active && this.removeSession(this.active))
    );
    menu.addItem((i) =>
      i.setTitle(t("common.closeOthers")).setIcon("minus-square").setDisabled(n < 2).onClick(() => this.closeMany(this.active))
    );
    menu.addItem((i) =>
      i.setTitle(t("common.closeAllN", { n })).setIcon("x-square").onClick(() => this.closeMany(null))
    );
    menu.showAtMouseEvent(evt);
  }

  setActive(s) {
    if (!s) return;
    this.active = s;
    for (const x of this.sessions) x.el.toggleClass("is-active", x === s && this.sessions.length > 1);
    this.updateToolbar();
    const av = this.app.workspace.getActiveViewOfType(ItemView);
    if (!av || av.leaf !== this.leaf) this.app.workspace.setActiveLeaf(this.leaf, { focus: false });
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
    new Notice(on ? t("notice.broadcastOn") : t("notice.broadcastOff"));
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
        .setTitle(t("layout.equalize"))
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
    g.setCssProps({
      "--ecu-grid-cols": this.colSizes.map((f) => `minmax(0, ${f}fr)`).join(` ${GUT} `),
      "--ecu-grid-rows": this.rowSizes.map((f) => `minmax(0, ${f}fr)`).join(` ${GUT} `),
    });
    g.toggleClass("is-single", this.sessions.length <= 1);

    g.querySelectorAll(":scope > .ecu-gutter, :scope > .ecu-add-tile").forEach((el) => el.remove());
    this.sessions.forEach((s, i) => {
      if (s.el.parentElement !== g) g.appendChild(s.el);
      s.el.setCssProps({ "--ecu-col": String((i % cols) * 2 + 1), "--ecu-row": String(Math.floor(i / cols) * 2 + 1) });
      s.el.toggleClass("is-active", s === this.active && this.sessions.length > 1);
    });
    for (let i = this.sessions.length; i < cols * rows; i++) {
      const tile = g.createDiv({ cls: "ecu-add-tile" });
      tile.setCssProps({ "--ecu-col": String((i % cols) * 2 + 1), "--ecu-row": String(Math.floor(i / cols) * 2 + 1) });
      const inner = tile.createDiv({ cls: "ecu-add-tile-inner" });
      setIcon(inner.createSpan(), "plus");
      inner.createSpan({ text: t("tile.new") });
      tile.addEventListener("click", () => this.addSession({ cwd: this.active && this.active.cwd }, { keepSizes: true }));
    }
    for (let c = 0; c < cols - 1; c++) this.makeGutter("col", c, rows);
    for (let r = 0; r < rows - 1; r++) this.makeGutter("row", r, cols);
    this.updateToolbar();
    g.win.requestAnimationFrame(() => this.sessions.forEach((s) => s.fitNow()));
  }

  makeGutter(kind, idx, span) {
    const g = this.gridEl;
    const el = g.createDiv({ cls: `ecu-gutter ecu-gutter-${kind}` });
    if (kind === "col") el.setCssProps({ "--ecu-col": String(idx * 2 + 2), "--ecu-row": `1 / ${span * 2}` });
    else el.setCssProps({ "--ecu-row": String(idx * 2 + 2), "--ecu-col": `1 / ${span * 2}` });
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
      const doc = el.ownerDocument;
      const shield = doc.body.createDiv({ cls: `ecu-drag-shield is-${kind}` });
      const move = (ev) => {
        const d = (((kind === "col" ? ev.clientX : ev.clientY) - start) / Math.max(px, 1)) * total;
        const a = Math.max(min, Math.min(a0 + b0 - min, a0 + d));
        sizes[idx] = a;
        sizes[idx + 1] = a0 + b0 - a;
        const tpl = sizes.map((f) => `minmax(0, ${f}fr)`).join(" 5px ");
        g.setCssProps({ [kind === "col" ? "--ecu-grid-cols" : "--ecu-grid-rows"]: tpl });
      };
      const up = () => {
        doc.removeEventListener("mousemove", move);
        doc.removeEventListener("mouseup", up);
        shield.remove();
        this.sessions.forEach((s) => s.fitNow());
        this.app.workspace.requestSaveLayout();
      };
      doc.addEventListener("mousemove", move);
      doc.addEventListener("mouseup", up);
    });
  }

  updateToolbar() {
    if (!this.captionEl) return;
    const n = this.sessions.length;
    const a = this.active;
    this.captionEl.setText(n > 1 ? t("toolbar.sessions", { n }) : `${t("view.terminal")}  ${a ? a.captionText() : ""}`);
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
    this.api = {
      version: 1,
      openTool: (o) => this.openTool(o),
      toolLeaf: (id) => this.toolLeaf(id),
      sendToTool: (id, text, o) => this.sendToTool(id, text, o),
      toolText: (id, lines) => this.toolText(id, lines),
    };
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    setUiLang(this.settings.uiLang);
    const stored = this.settings.history;
    const kept = this.settings.rememberCommands && Array.isArray(stored) ? stored.filter((h) => h && typeof h.cmd === "string" && !isSecretCommand(h.cmd)) : [];
    this.settings.history = kept;
    if (!Array.isArray(stored) || kept.length !== stored.length) await this.saveData(this.settings);
    this.lastTerm = null;
    this.termScope = new Scope();
    this.termKeys = [];

    this.registerView(VIEW, (leaf) => new EcuTerminalView(leaf, this));

    this.addCommand({
      id: "toggle",
      name: t("cmd.toggle"),
      callback: () => this.toggle(),
    });

    this.addCommand({
      id: "split-right",
      name: t("cmd.splitRight"),
      callback: () => this.split("vertical"),
    });

    this.addCommand({
      id: "split-down",
      name: t("cmd.splitDown"),
      callback: () => this.split("horizontal"),
    });

    this.addCommand({
      id: "restart",
      name: t("cmd.restart"),
      callback: () => this.restart(),
    });

    this.addCommand({
      id: "move",
      name: t("cmd.move"),
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
        const name = folder && folder.path !== "/" ? folder.name : t("menu.vaultFolder");
        menu.addItem((i) =>
          i
            .setTitle(t("menu.openHere", { name }))
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
            .setTitle(t("menu.openInNoteFolder"))
            .setIcon("terminal")
            .setSection("ecu-terminal")
            .onClick(() => this.openAt(file ? file.parent : null))
        );
      })
    );
    this.addCommand({
      id: "open-panel",
      name: t("cmd.openPanel"),
      callback: () => this.openPanel(),
    });
    this.addCommand({
      id: "open-here",
      name: t("cmd.openHere"),
      callback: () => {
        const f = this.app.workspace.getActiveFile();
        this.openAt(f ? f.parent : null);
      },
    });

    this.addCommand({
      id: "close-others",
      name: t("common.closeOthers"),
      callback: () => {
        const l = this.activeTermLeaf();
        if (l && l.view.active) l.view.closeMany(l.view.active);
      },
    });
    this.addCommand({
      id: "close-all",
      name: t("cmd.closeAll"),
      callback: () => {
        const l = this.activeTermLeaf();
        if (l) l.view.closeMany(null);
      },
    });

    this.addCommand({
      id: "capture-last",
      name: t("common.captureLast"),
      callback: () => this.capture(this.activeTermLeaf(), "last"),
    });
    this.addCommand({
      id: "capture-selection",
      name: t("cmd.captureSelection"),
      callback: () => this.capture(this.activeTermLeaf(), "selection"),
    });

    this.watchedWins = new WeakSet();
    this.watchWindow(window);
    this.registerEvent(this.app.workspace.on("window-open", (ww, win) => this.watchWindow(win)));

    this.navButtons = [];
    this.winFocused = true;
    this.registerDomEvent(window, "focus", () => (this.winFocused = true));
    this.registerDomEvent(window, "blur", () => (this.winFocused = false));
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.addNavButtons();
        this.syncTermTabs();
        this.syncHiddenMarks();
      })
    );

    this.app.workspace.onLayoutReady(async () => {
      this.addNavButtons();
      this.syncTermTabs();
      for (const leaf of this.app.workspace.getLeavesOfType(LEGACY_VIEW)) {
        const st = leaf.getViewState();
        await leaf.setViewState({ type: VIEW, active: false, state: { cwd: st.state && st.state.cwd } });
      }
      if (this.settings.hidden && this.leaves().length) this.applyHidden(true);
      this.workspaceWins().forEach((w) => this.watchWindow(w));
    });

    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        if (!this.leaves().length && this.settings.hidden) this.saveHidden(false);
      })
    );
  }

  recordCommand(cmd, host, cwd) {
    cmd = String(cmd || "").replace(/\s+$/, "");
    if (!cmd.trim() || /^\s/.test(cmd) || cmd.length > 400) return;
    if (!this.settings.rememberCommands || isSecretCommand(cmd) || TRIVIAL_RE.test(cmd.trim())) return;
    host = host || "";
    const list = (this.settings.history || []).filter((h) => !(h.cmd === cmd && (h.host || "") === host));
    list.unshift({ cmd, host, cwd: cwd || "", t: Date.now() });
    this.settings.history = list.slice(0, 40);
    clearTimeout(this.histTimer);
    this.histTimer = setTimeout(() => {
      this.histTimer = null;
      this.saveData(this.settings);
    }, 1500);
    this.app.workspace.trigger("ecu-terminal:history");
  }

  recentCommands() {
    return (this.settings.history || []).slice();
  }

  async clearHistory() {
    clearTimeout(this.histTimer);
    this.settings.history = [];
    await this.saveData(this.settings);
    this.app.workspace.trigger("ecu-terminal:history");
  }

  assignedHotkeys(id) {
    try {
      const hm = this.app.hotkeyManager;
      if (!hm || typeof hm.getHotkeys !== "function") return [];
      const own = hm.getHotkeys(id);
      const keys = own !== undefined ? own : typeof hm.getDefaultHotkeys === "function" ? hm.getDefaultHotkeys(id) : null;
      return Array.isArray(keys) ? keys.filter((h) => h && hotkeyKey(h)) : [];
    } catch (e) {
      return [];
    }
  }

  termHotkeys() {
    const out = [];
    const add = (id, fn) => {
      for (const h of this.assignedHotkeys(id)) out.push({ modifiers: Array.isArray(h.modifiers) ? h.modifiers : [], key: hotkeyKey(h), fn });
    };
    add(this.manifest.id + ":toggle", () => this.toggle());
    add(this.manifest.id + ":move", () => this.move());
    add("command-palette:open", () => this.app.commands.executeCommandById("command-palette:open"));
    return out;
  }

  isTermHotkey(e) {
    return this.termKeys.some((h) => hotkeyMatches(h, e, IS_MAC));
  }

  enterTermScope() {
    if (this.scopeOn) return;
    this.termKeys = this.termHotkeys();
    this.termScope = new Scope();
    for (const h of this.termKeys) this.termScope.register(h.modifiers, h.key, () => (h.fn(), false));
    this.app.keymap.pushScope(this.termScope);
    this.scopeOn = true;
  }

  leaveTermScope() {
    if (!this.scopeOn) return;
    this.app.keymap.popScope(this.termScope);
    this.scopeOn = false;
  }

  onunload() {
    if (this.histTimer) {
      clearTimeout(this.histTimer);
      this.histTimer = null;
      this.saveData(this.settings);
    }
    this.leaveTermScope();
    this.unmarkAll(HIDDEN);
    this.unmarkAll(BEFORE_HIDDEN);
    for (const el of this.termTabEls || []) el.classList.remove(TERM_TABS);
    this.termTabEls = null;
    (this.navButtons || []).forEach((b) => b.remove());
  }

  addNavButtons() {
    for (const leaf of this.app.workspace.getLeavesOfType("file-explorer")) {
      const bar = leaf.view && leaf.view.containerEl.querySelector(".nav-header .nav-buttons-container");
      if (!bar || bar.querySelector(".ecu-term-navbtn")) continue;
      const b = bar.createDiv({ cls: "clickable-icon nav-action-button ecu-term-navbtn", attr: { "aria-label": t("nav.button") } });
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
    menu.addItem((i) => i.setTitle(t("nav.panel")).setIcon("square-terminal").onClick(() => this.openPanel()));
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
    menu.addItem((i) => i.setTitle(t("menu.newKey", { key: KEY.split })).setIcon("plus").onClick(() => this.split()));
    if (sessions.length > 1) menu.addItem((i) => i.setTitle(t("common.closeAllN", { n: sessions.length })).setIcon("x-square").onClick(() => v.closeMany(null)));
    menu.addSeparator();
    menu.addItem((i) => i.setTitle(open ? t("nav.hideKey") : t("nav.showKey")).setIcon(open ? "eye-off" : "terminal").onClick(() => this.toggle()));
    menu.addItem((i) => i.setTitle(t("nav.newInVault")).setIcon("folder-open").onClick(() => this.openAt(null)));
    if (v && v.sessions) {
      menu.addSeparator();
      for (const [k, label] of Object.entries(LAYOUTS)) {
        menu.addItem((i) => {
          i.setTitle(label).setIcon(k === "auto" ? "layout-grid" : k === "cols" ? "columns-3" : "rows-3").onClick(() => v.setLayout(k));
          if (i.setChecked) i.setChecked(v.layout === k);
        });
      }
      menu.addItem((i) => {
        i.setTitle(t("common.broadcast")).setIcon("radio-tower").onClick(() => v.setBroadcast(!v.broadcast));
        if (i.setChecked) i.setChecked(!!v.broadcast);
      });
    }
    menu.addSeparator();
    const toBottom = this.settings.side !== "bottom";
    menu.addItem((i) => i.setTitle(toBottom ? t("common.moveBottom") : t("common.moveRight")).setIcon(toBottom ? "panel-bottom" : "panel-right").onClick(() => this.move()));
    menu.addItem((i) =>
      i
        .setTitle(t("nav.settings"))
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
    if (sess && sess.command) return;
    const s = this.settings;
    if (!s.notify || !info || info.ms < (Number(s.notifyAfter) || 10) * 1000) return;
    const appFocused = this.appFocused(sess);
    const seen = appFocused && sess.isVisible() && !this.isHidden();
    if (s.notifyMode !== "always" && seen) return;
    const ok = info.exit == null ? null : info.exit === 0;
    const where = info.host ? ` · ${info.host}` : "";
    const title = (ok === false ? t("notify.failed", { code: info.exit }) : ok ? t("notify.doneOk") : t("notify.done")) + where;
    const body = `${info.cmd || t("notify.cmdFallback")}\n${fmtDuration(info.ms)}`;
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
      f.createDiv({ text: `${info.cmd || t("notify.cmdFallback")} · ${fmtDuration(info.ms)}`, cls: "ecu-notice-body" });
    });
    const notice = new Notice(frag, 8000);
    if (notice.noticeEl) notice.noticeEl.addEventListener("click", () => this.bringToFront(sess));
  }

  appFocused(sess) {
    const doc = sess && sess.el.doc;
    if (doc && doc !== document) return doc.hasFocus();
    try {
      const w = nodeRequire("@electron/remote").getCurrentWindow();
      return w.isFocused() && w.isVisible() && !w.isMinimized();
    } catch (e) {
      return this.winFocused !== false && document.hasFocus();
    }
  }

  async bringToFront(sess) {
    const win = sess && sess.el.win;
    try {
      if (win && win !== window) {
        win.focus();
      } else {
        const remote = nodeRequire("@electron/remote");
        const w = remote.getCurrentWindow();
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
      }
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

  engineReady() {
    return !!ptyDir(this.pluginDir());
  }

  async installEngine() {
    if (!this.installing) {
      this.installing = installEngine(this.pluginDir()).finally(() => (this.installing = null));
    }
    await this.installing;
    for (const l of this.allLeaves()) if (l.view && l.view.engineInstalled) l.view.engineInstalled();
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

  isPanelLeaf(l) {
    if (l.view && l.view.isPanel) return true;
    try {
      const st = l.getViewState();
      return !!(st && st.state && st.state.panel);
    } catch (e) {
      return false;
    }
  }

  leaves() {
    return this.allLeaves().filter((l) => !this.isPanelLeaf(l) && !this.toolId(l));
  }

  toolId(l) {
    if (l.view && l.view.tool) return l.view.tool.id;
    try {
      const st = l.getViewState();
      return (st && st.state && st.state.tool && st.state.tool.id) || "";
    } catch (e) {
      return "";
    }
  }

  toolLeaf(id) {
    return this.allLeaves().find((l) => this.toolId(l) === id) || null;
  }

  async openTool(o) {
    const ws = this.app.workspace;
    let leaf = this.toolLeaf(o.id);
    if (leaf) {
      if (leaf.loadIfDeferred) await leaf.loadIfDeferred();
      ws.revealLeaf(leaf);
      this.focusTerminal(leaf);
      return { leaf, created: false };
    }
    const base = this.noteLeaf();
    if (o.place === "tab") leaf = ws.getLeaf("tab");
    else {
      const dir = o.place === "bottom" ? "horizontal" : "vertical";
      leaf = base ? ws.createLeafBySplit(base, dir) : ws.getLeaf("split", dir);
    }
    const session = { cwd: o.cwd || "", command: o.command || "", resumeCommand: o.resumeCommand || "" };
    await leaf.setViewState({ type: VIEW, active: true, state: { tool: { id: o.id, title: o.title || "", icon: o.icon || "" }, sessions: [session] } });
    ws.revealLeaf(leaf);
    this.focusTerminal(leaf);
    return { leaf, created: true };
  }

  toolText(id, lines) {
    const leaf = this.toolLeaf(id);
    const s = leaf && leaf.view && leaf.view.active;
    if (!s || !s.term) return null;
    const b = s.term.buffer.active;
    const out = [];
    const end = b.baseY + b.cursorY + 1;
    for (let i = Math.max(0, end - (lines || 30)); i < Math.max(end, b.length); i++) {
      const l = b.getLine(i);
      if (l) out.push(l.translateToString(true));
    }
    return { text: out.join("\n"), idleMs: s.lastDataAt ? Date.now() - s.lastDataAt : 0, running: !!s.ptyProc, commandSentMs: s.commandSentAt ? Date.now() - s.commandSentAt : -1 };
  }

  async sendToTool(id, text, opts) {
    opts = opts || {};
    const leaf = this.toolLeaf(id);
    if (!leaf) return false;
    if (leaf.loadIfDeferred) await leaf.loadIfDeferred();
    const win = leaf.view.containerEl.win || window;
    const sleep = (ms) => new Promise((r) => win.setTimeout(r, ms));
    let s = null;
    for (let i = 0; i < 100; i++) {
      s = leaf.view.active;
      if (s && s.ptyProc && (!s.command || s.commandSentAt)) break;
      await sleep(100);
    }
    if (!s || !s.ptyProc) return false;
    if (s.command && s.commandSentAt) {
      for (let i = 0; i < 80; i++) {
        const now = Date.now();
        if (now - s.commandSentAt > 1500 && s.lastDataAt && now - s.lastDataAt > 700) break;
        await sleep(100);
      }
    }
    const paste = s.term && s.term.modes && s.term.modes.bracketedPasteMode;
    s.ptyProc.write(paste ? "\x1b[200~" + text + "\x1b[201~" : text);
    if (opts.enter) s.ptyProc.write("\r");
    if (opts.focus !== false) {
      this.app.workspace.revealLeaf(leaf);
      this.focusTerminal(leaf);
    }
    return true;
  }

  allLeaves() {
    return this.app.workspace.getLeavesOfType(VIEW);
  }

  activeTermLeaf() {
    const v = this.app.workspace.getActiveViewOfType(EcuTerminalView);
    if (v) return v.leaf;
    return this.leaf() || this.panelLeaf();
  }

  panelLeaf() {
    return this.allLeaves().find((l) => this.isPanelLeaf(l)) || null;
  }

  async openPanel() {
    let leaf = this.panelLeaf();
    if (!leaf) {
      const ws = this.app.workspace;
      let host = null;
      ws.iterateRootLeaves((l) => {
        if (!host && !this.leaves().includes(l)) host = l;
      });
      const dock = this.leaves().find((l) => this.termGroup(l));
      if (host) {
        ws.setActiveLeaf(host, { focus: false });
        leaf = ws.getLeaf("tab");
      } else if (dock) {
        leaf = ws.createLeafBySplit(dock, this.settings.side === "bottom" ? "horizontal" : "vertical", true);
      } else {
        leaf = ws.getLeaf("tab");
      }
      await leaf.setViewState({ type: VIEW, active: true, state: { panel: true } });
    }
    for (let p = leaf.parent; p && p.containerEl; p = p.parent) p.containerEl.classList.remove(HIDDEN);
    this.syncHiddenMarks();
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

  watchWindow(win) {
    if (!win || this.watchedWins.has(win)) return;
    this.watchedWins.add(win);
    this.registerDomEvent(
      win,
      "keydown",
      (evt) => {
        if (evt.code !== "KeyD" || evt.altKey) return;
        if (IS_MAC ? !evt.metaKey || evt.ctrlKey : !evt.ctrlKey || !evt.shiftKey || evt.metaKey) return;
        const leaf = this.leafFromEl(evt.target);
        if (!leaf) return;
        evt.preventDefault();
        evt.stopPropagation();
        this.split(IS_MAC && evt.shiftKey ? "horizontal" : "vertical", leaf);
      },
      { capture: true }
    );
    this.registerDomEvent(
      win.document,
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
  }

  workspaceWins() {
    const wins = new Set([window]);
    this.app.workspace.iterateAllLeaves((l) => {
      const c = l.getContainer && l.getContainer();
      const w = (c && c.win) || (l.view && l.view.containerEl && l.view.containerEl.win);
      if (w) wins.add(w);
    });
    return [...wins];
  }

  unmarkAll(cls) {
    for (const w of this.workspaceWins()) w.document.querySelectorAll("." + cls).forEach((el) => el.classList.remove(cls));
  }

  termGroup(leaf) {
    const g = leaf.parent;
    if (!g || !g.containerEl || !g.children) return null;
    return g.children.every((c) => c.view && c.view.getViewType() === VIEW && !this.isPanelLeaf(c) && !this.toolId(c)) ? g : null;
  }

  canHide() {
    const all = this.leaves();
    return all.length > 0 && all.every((l) => this.termGroup(l));
  }

  isHidden() {
    return this.leaves().some((l) => l.parent && l.parent.containerEl && l.parent.containerEl.classList.contains(HIDDEN));
  }

  syncHiddenMarks() {
    this.unmarkAll(BEFORE_HIDDEN);
    for (const w of this.workspaceWins()) {
      w.document.querySelectorAll(".workspace-split > ." + HIDDEN).forEach((el) => {
        const prev = el.previousElementSibling;
        if (prev) prev.classList.add(BEFORE_HIDDEN);
      });
    }
  }

  syncTermTabs() {
    const next = new Set();
    for (const l of this.leaves()) {
      const g = this.termGroup(l);
      if (g && g.containerEl) next.add(g.containerEl);
    }
    for (const el of this.termTabEls || []) if (!next.has(el)) el.classList.remove(TERM_TABS);
    next.forEach((el) => el.classList.add(TERM_TABS));
    this.termTabEls = next;
  }

  applyHidden(hidden) {
    if (!hidden) {
      this.unmarkAll(HIDDEN);
      this.syncHiddenMarks();
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
    this.syncHiddenMarks();
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

  move() {
    const busy = this.leaves().flatMap((l) => (l.view && l.view.sessions) || []).filter((s) => s.localRun || s.remoteRun);
    if (!busy.length) return this.moveNow();
    const names = busy.map((s) => (s.localRun || s.remoteRun).cmd).filter(Boolean).slice(0, 3).join(", ");
    new ConfirmModal(
      this.app,
      t("confirm.moveTitle"),
      t(busy.length === 1 ? "confirm.moveBusyOne" : "confirm.moveBusyMany", { n: busy.length, names: names ? ` (${names})` : "" }),
      t("confirm.moveAnyway"),
      () => this.moveNow()
    ).open();
  }

  async moveNow() {
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
    new Notice(this.settings.side === "bottom" ? t("notice.movedBottom") : t("notice.movedRight"));
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
    if (!term) return new Notice(t("notice.noTerminal"));
    const note = this.targetNote();
    if (!note) return new Notice(t("notice.noNote"));
    const lines = bufferLines(term);
    let cap;
    if (mode === "selection") {
      if (!term.hasSelection()) return new Notice(t("notice.noSelection"));
      cap = parseSelection(term.getSelection(), lines);
      term.clearSelection();
    } else {
      cap = leaf.view && leaf.view.lastCommandCapture ? leaf.view.lastCommandCapture() : lastCommand(lines);
      if (!cap) return new Notice(t("notice.noLastCmd"));
    }
    if (!cap.cmd && !cap.output) return new Notice(t("notice.nothing"));
    this.insertIntoNote(note, formatCapture(cap, { localHost: this.localHost || "" }));
    new Notice(t("notice.added", { name: note.view.file ? note.view.file.basename : "" }));
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
    const clip = leaf.view.containerEl.win.navigator.clipboard;
    const menu = new Menu();
    menu.addItem((i) =>
      i.setTitle(t("menu.copy")).setIcon("copy").setDisabled(!term || !term.hasSelection()).onClick(() => {
        clip.writeText(term.getSelection()).catch(() => {});
        term.clearSelection();
      })
    );
    menu.addItem((i) =>
      i.setTitle(t("menu.paste")).setIcon("clipboard-paste").setDisabled(!term).onClick(async () => {
        try {
          term.paste(await clip.readText());
        } catch (e) {
        }
        term.focus();
      })
    );
    menu.addItem((i) =>
      i.setTitle(t("menu.selectAll")).setIcon("text-select").setDisabled(!term).onClick(() => term.selectAll())
    );
    menu.addSeparator();
    const note = this.targetNote();
    const where = note ? ` (${note.view.file ? note.view.file.basename : t("menu.noteFallback")})` : "";
    menu.addItem((i) =>
      i
        .setTitle(t("common.captureLast") + where)
        .setIcon("file-input")
        .setDisabled(!term || !note)
        .onClick(() => this.capture(leaf, "last"))
    );
    menu.addItem((i) =>
      i
        .setTitle(t("menu.captureSelection") + where)
        .setIcon("file-plus")
        .setDisabled(!term || !note || !term.hasSelection())
        .onClick(() => this.capture(leaf, "selection"))
    );
    menu.addItem((i) =>
      i.setTitle(t("menu.clear")).setIcon("eraser").setDisabled(!s).onClick(() => {
        s.pty.write("\f");
        term.focus();
      })
    );
    menu.addSeparator();
    const v = leaf.view;
    menu.addItem((i) => i.setTitle(t("menu.newKey", { key: KEY.split })).setIcon("plus").onClick(() => this.split(null, leaf)));
    menu.addItem((i) => i.setTitle(t("menu.layout")).setIcon("layout-grid").onClick(() => v.layoutMenu(evt)));
    menu.addItem((i) => {
      i.setTitle(t("common.broadcast")).setIcon("radio-tower").onClick(() => v.setBroadcast(!v.broadcast));
      if (i.setChecked) i.setChecked(!!v.broadcast);
    });
    menu.addSeparator();
    const toBottom = this.settings.side !== "bottom";
    menu.addItem((i) =>
      i.setTitle(toBottom ? t("common.moveBottom") : t("common.moveRight")).setIcon(toBottom ? "panel-bottom" : "panel-right").onClick(() => this.move())
    );
    menu.addItem((i) =>
      i.setTitle(t("menu.hide")).setIcon("eye-off").onClick(() => {
        if (!this.isHidden()) this.toggle();
      })
    );
    menu.addItem((i) =>
      i.setTitle(t("common.closeThis")).setIcon("x").onClick(() => {
        if (v.active) v.removeSession(v.active);
        if (v.sessions.length) {
          this.app.workspace.setActiveLeaf(leaf, { focus: true });
          v.focus();
        } else if (!this.allLeaves().includes(leaf)) this.focusNote();
      })
    );
    menu.addItem((i) =>
      i.setTitle(t("common.closeOthers")).setIcon("minus-square").setDisabled(v.sessions.length < 2).onClick(() => v.closeMany(v.active))
    );
    menu.addItem((i) =>
      i.setTitle(t("common.closeAllN", { n: v.sessions.length })).setIcon("x-square").setDisabled(v.sessions.length < 2 && !v.isPanel).onClick(() => v.closeMany(null))
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
      .setName(t("common.language"))
      .setDesc(t("set.uiLangDesc"))
      .addDropdown((d) =>
        d
          .addOption("auto", t("set.uiLangAuto"))
          .addOption("en", t("set.uiLangEn"))
          .addOption("tr", t("set.uiLangTr"))
          .setValue(this.plugin.settings.uiLang || "auto")
          .onChange(async (v) => {
            this.plugin.settings.uiLang = v;
            setUiLang(v);
            await this.plugin.saveData(this.plugin.settings);
            new Notice(t("notice.langChanged"));
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(t("set.side"))
      .setDesc(t("set.sideDesc"))
      .addDropdown((d) =>
        d
          .addOption("right", t("set.sideRight"))
          .addOption("bottom", t("set.sideBottom"))
          .setValue(this.plugin.settings.side)
          .onChange(async (v) => {
            this.plugin.settings.side = v;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    new Setting(containerEl)
      .setName(t("set.size"))
      .setDesc(t("set.sizeDesc"))
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
      .setName(t("set.notePlace"))
      .setDesc(t("set.notePlaceDesc"))
      .addDropdown((d) =>
        d
          .addOption("cursor", t("set.placeCursor"))
          .addOption("end", t("set.placeEnd"))
          .setValue(this.plugin.settings.notePlace)
          .onChange(async (v) => {
            this.plugin.settings.notePlace = v;
            await this.plugin.saveData(this.plugin.settings);
          })
      );

    const p = this.plugin;
    const save = () => p.saveData(p.settings);
    const note = t("set.newOnly");

    new Setting(containerEl).setName(t("set.shell")).setHeading();
    new Setting(containerEl)
      .setName(t("set.shell"))
      .setDesc(t("set.shellDesc", { shell: defaultShell() }))
      .addText((t) => t.setPlaceholder(defaultShell()).setValue(p.settings.shellPath).onChange(async (v) => ((p.settings.shellPath = v.trim()), await save())));
    new Setting(containerEl)
      .setName(t("set.startDir"))
      .addDropdown((d) =>
        d
          .addOption("vault", t("set.startVault"))
          .addOption("home", t("set.startHome"))
          .addOption("custom", t("set.startCustom"))
          .setValue(p.settings.startDir)
          .onChange(async (v) => {
            p.settings.startDir = v;
            await save();
            this.display();
          })
      );
    if (p.settings.startDir === "custom")
      new Setting(containerEl)
        .setName(t("set.startCustom"))
        .addText((t) => t.setPlaceholder("/Users/…").setValue(p.settings.customDir).onChange(async (v) => ((p.settings.customDir = v.trim()), await save())));
    new Setting(containerEl)
      .setName(t("set.engine"))
      .setDesc(t("set.engineDesc", { version: PTY_VERSION, platform: PLATFORM_KEY }))
      .addButton((b) =>
        b.setButtonText(t("engine.redownload")).onClick(async () => {
          b.setDisabled(true);
          b.setButtonText(t("engine.downloading"));
          try {
            await p.installEngine();
            new Notice(t("notice.engineInstalled"));
          } catch (e) {
            new Notice(t("engine.downloadFailed", { error: e && e.message ? e.message : e }));
          }
          b.setDisabled(false);
          b.setButtonText(t("engine.redownload"));
        })
      );
    new Setting(containerEl)
      .setName(t("set.persist"))
      .setDesc(t("set.persistDesc"))
      .addToggle((t) => t.setValue(p.settings.persistBuffer).onChange(async (v) => ((p.settings.persistBuffer = v), await save())));
    new Setting(containerEl)
      .setName(t("set.history"))
      .setDesc(t("set.historyDesc"))
      .addToggle((tg) =>
        tg.setValue(p.settings.rememberCommands).onChange(async (v) => {
          p.settings.rememberCommands = v;
          if (v) await save();
          else await p.clearHistory();
          this.display();
        })
      );
    new Setting(containerEl)
      .setName(t("set.clearHistory"))
      .setDesc(t("set.clearHistoryDesc", { n: (p.settings.history || []).length }))
      .addButton((b) =>
        b
          .setButtonText(t("set.clearHistoryBtn"))
          .setDisabled(!(p.settings.history || []).length)
          .onClick(async () => {
            await p.clearHistory();
            new Notice(t("notice.historyCleared"));
            this.display();
          })
      );

    new Setting(containerEl).setName(t("set.hNotify")).setHeading();
    new Setting(containerEl)
      .setName(t("set.notify"))
      .setDesc(t("set.notifyDesc"))
      .addToggle((t) => t.setValue(p.settings.notify).onChange(async (v) => ((p.settings.notify = v), await save())));
    new Setting(containerEl)
      .setName(t("set.notifyAfter"))
      .setDesc(t("set.notifyAfterDesc"))
      .addSlider((sl) => sl.setLimits(3, 120, 1).setValue(Number(p.settings.notifyAfter) || 10).setDynamicTooltip().onChange(async (v) => ((p.settings.notifyAfter = v), await save())));
    new Setting(containerEl)
      .setName(t("set.notifyMode"))
      .addDropdown((d) =>
        d
          .addOption("away", t("set.notifyAway"))
          .addOption("always", t("set.notifyAlways"))
          .setValue(p.settings.notifyMode)
          .onChange(async (v) => ((p.settings.notifyMode = v), await save()))
      );
    new Setting(containerEl)
      .setName(t("set.sound"))
      .addToggle((t) => t.setValue(p.settings.notifySound).onChange(async (v) => ((p.settings.notifySound = v), await save())));

    new Setting(containerEl).setName(t("set.hLook")).setHeading();
    new Setting(containerEl)
      .setName(t("set.font"))
      .setDesc(note)
      .addText((t) => t.setValue(p.settings.fontFamily).onChange(async (v) => ((p.settings.fontFamily = v), await save())));
    new Setting(containerEl)
      .setName(t("set.fontSize"))
      .addSlider((s) => s.setLimits(10, 22, 1).setValue(p.settings.fontSize).setDynamicTooltip().onChange(async (v) => ((p.settings.fontSize = v), await save(), p.applyToAll())));
    new Setting(containerEl)
      .setName(t("set.cursor"))
      .addDropdown((d) =>
        d
          .addOption("block", t("set.cursorBlock"))
          .addOption("bar", t("set.cursorBar"))
          .addOption("underline", t("set.cursorUnderline"))
          .setValue(p.settings.cursorStyle)
          .onChange(async (v) => ((p.settings.cursorStyle = v), await save(), p.applyToAll()))
      )
      .addToggle((tg) => tg.setTooltip(t("set.cursorBlink")).setValue(p.settings.cursorBlink).onChange(async (v) => ((p.settings.cursorBlink = v), await save(), p.applyToAll())));
    new Setting(containerEl)
      .setName(t("set.copyOnSelect"))
      .setDesc(t("set.copyOnSelectDesc"))
      .addToggle((t) => t.setValue(p.settings.copyOnSelect).onChange(async (v) => ((p.settings.copyOnSelect = v), await save())));
    if (IS_MAC) new Setting(containerEl)
      .setName(t("set.optionMeta"))
      .setDesc(t("set.optionMetaDesc"))
      .addToggle((t) => t.setValue(p.settings.optionIsMeta).onChange(async (v) => ((p.settings.optionIsMeta = v), await save(), p.applyToAll())));
    new Setting(containerEl)
      .setName(t("set.scrollback"))
      .setDesc(`${t("set.scrollbackRange", { min: SCROLLBACK_MIN, max: SCROLLBACK_MAX })} ${note}`)
      .addText((tx) => {
        tx.inputEl.type = "number";
        tx.inputEl.min = String(SCROLLBACK_MIN);
        tx.inputEl.max = String(SCROLLBACK_MAX);
        tx.setValue(String(clampScrollback(p.settings.scrollback, DEFAULTS.scrollback))).onChange(async (v) => {
          const n = clampScrollback(v, null);
          if (n !== null) {
            p.settings.scrollback = n;
            await save();
          }
        });
        tx.inputEl.addEventListener("blur", () => tx.setValue(String(clampScrollback(p.settings.scrollback, DEFAULTS.scrollback))));
      });

    containerEl.createEl("p", {
      text:
        IS_MAC
          ? t("set.helpMac")
          : t("set.helpOther", { paste: KEY.paste }),
      cls: "setting-item-description",
    });
  }
}

module.exports._internals = { PROMPT_RE, splitPrompt, lastCommand, parseSelection, formatCapture, trimOutput };
