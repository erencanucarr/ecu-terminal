import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { isSecretCommand, splitPrompt, shQuote, shellKind, cleanShellEnv, hotkeyMatches } = require("../src/util.js");

let failed = 0;
let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n  ${e.message}`);
  }
}

const secrets = [
  "mysql -u root -psecret123 app",
  "mysqldump -uroot -phunter2 app > dump.sql",
  "mariadb -u root --password=hunter2",
  "mysql -u root --password hunter2",
  "mongosh -u admin -p hunter2 --authenticationDatabase admin",
  "mongo -p hunter2",
  "redis-cli -h cache -a hunter2 ping",
  "redis-cli --pass hunter2",
  "sshpass -p hunter2 ssh me@host",
  "docker login -u me -p hunter2 registry.example.com",
  "docker login --password hunter2 ghcr.io",
  "podman login -p hunter2 quay.io",
  "curl -u admin:hunter2 https://api.example.com",
  "curl --user admin:hunter2 https://api.example.com",
  "curl --user=admin:hunter2 https://api.example.com",
  'curl -H "Authorization: Basic YWRtaW46aHVudGVy" https://x',
  "git clone https://me:hunter2@github.com/me/repo.git",
  "psql postgres://app:hunter2@db:5432/app",
  "echo ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "git remote add o https://gho_abcdefghijklmnopqrstuvwxyz0123@github.com/x",
  "GH=github_pat_11ABCDEFG0123456789_abcdefghijklmnop ./run.sh",
  "OPENAI=sk-abcdefghijklmnopqrstuvwxyz123456 python app.py",
  "claude --key sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
  "curl -d t=xoxb-1234567890-abcdefghij https://slack.com/api",
  "curl -d t=xoxp-1234567890-abcdefghij https://slack.com/api",
  "aws configure set aws_access_key_id AKIAIOSFODNN7EXAMPLE",
  "git push https://oauth2:glpat-abcdefghijklmnopqrst@gitlab.com/x.git",
  "vault login s.abcdef123",
  "export DB_PASS=hunter2",
  "DB_PASSWORD=hunter2 npm start",
  "export GITHUB_PAT=abc123",
  "export PAT=abc123",
  "export PRIVATE_KEY=abc",
  "export SSH_PRIVATE_KEY=abc",
  "export STRIPE_KEY=abc",
  "export AWS_SECRET_ACCESS_KEY=abc",
  "gpg --batch --passphrase hunter2 -c notes.txt",
  "openssl enc -aes-256-cbc -pass pass:hunter2 -in a -out b",
  "openssl rsa -in key.pem -passin pass:hunter2",
  "openssl enc -d -aes-256-cbc -k hunter2 -in a",
  "htpasswd -b .htpasswd admin hunter2",
  "gh secret set API --body abc",
  "kubectl create secret generic db --from-literal=x=y",
  "echo $API_KEY",
  "curl -H 'Bearer abc' https://x",
  "npm config set //registry.npmjs.org/:_authToken abc",
];

const safe = [
  "mkdir -p src/components",
  "ps -p 1",
  "ssh -p 22 me@example.com",
  "kubectl get secrets",
  "kubectl get secrets -n prod",
  "git log -p",
  "npm pack",
  "export PATH=$PATH:/usr/local/bin",
  "docker run -p 8080:80 nginx",
  "mysql -u root -p",
  "mysql -h db -P 3306 -u root",
  "curl -u admin https://api.example.com",
  "git clone https://github.com/me/repo.git",
  "ssh me@example.com",
  "scp notes.md me@example.com:/tmp",
  "export BYPASS_CACHE=1",
  "ls ~/tasks/disk-cleanup-for-the-old-server-backups",
  "git commit -m 'skip ant tests'",
  "npm run build",
  "rsync -av --progress a/ b/",
  "pass show email",
  "mongosh --port 27017",
  "redis-cli ping",
  "docker login ghcr.io",
];

for (const c of secrets) check(`secret: ${c}`, () => assert.equal(isSecretCommand(c), true));
for (const c of safe) check(`safe: ${c}`, () => assert.equal(isSecretCommand(c), false));

const prompts = [
  ["C:\\Users\\me>dir", "C:\\Users\\me>", "dir"],
  ["C:\\Users\\me>", "C:\\Users\\me>", ""],
  ["C:\\>cd Windows", "C:\\>", "cd Windows"],
  ["C:\\Users\\me> dir /b", "C:\\Users\\me>", "dir /b"],
  ["C:\\Users\\me>echo hi > out.txt", "C:\\Users\\me>", "echo hi > out.txt"],
  ["PS C:\\Users\\me> Get-ChildItem", "PS C:\\Users\\me>", "Get-ChildItem"],
  ["PS C:\\Users\\me>", "PS C:\\Users\\me>", ""],
  ["me@host:~/src$ ls -la", "me@host:~/src$", "ls -la"],
  ["[me@host src]$ make", "[me@host src]$", "make"],
  ["root@box:/# apt update", "root@box:/#", "apt update"],
  ["me@mac notes % git status", "me@mac notes %", "git status"],
  ["(venv) me@host:~$ python", "(venv) me@host:~$", "python"],
  ["~/notes ❯ npm test", "~/notes ❯", "npm test"],
  ["➜  notes git:(main) git pull", "➜", "notes git:(main) git pull"],
];
for (const [line, prompt, cmd] of prompts) {
  check(`prompt: ${line}`, () => assert.deepEqual(splitPrompt(line), { prompt, cmd }));
}
for (const line of ["hello world", "total 48", "drwxr-xr-x  5 me staff 160 .", ""]) {
  check(`not a prompt: ${line}`, () => assert.equal(splitPrompt(line), null));
}

check("shQuote plain", () => assert.equal(shQuote("/home/me/vault/.obsidian/plugins/ecu-terminal/shell/ecu-init.zsh"), "'/home/me/vault/.obsidian/plugins/ecu-terminal/shell/ecu-init.zsh'"));
check("shQuote special", () => assert.equal(shQuote(`/a "b" $HOME \`x\` it's`), `'/a "b" $HOME \`x\` it'\\''s'`));
check("shQuote round-trip in sh", () => {
  const { execFileSync } = require("node:child_process");
  const p = `/tmp/v "q" $HOME \`id\` it's \\n`;
  assert.equal(execFileSync("/bin/sh", ["-c", `printf %s ${shQuote(p)}`]).toString(), p);
});

const kinds = [
  ["/bin/zsh", "darwin", "zsh"],
  ["/bin/bash", "linux", "bash"],
  ["/usr/bin/fish", "linux", "other"],
  ["C:\\Program Files\\Git\\bin\\bash.exe", "win32", "bash"],
  ["C:\\Windows\\System32\\bash.exe", "win32", "other"],
  ["C:\\Windows\\Sysnative\\bash.exe", "win32", "other"],
  ["C:\\Windows\\System32\\wsl.exe", "win32", "other"],
  ["wsl.exe", "win32", "other"],
  ["bash.exe", "win32", "other"],
  ["C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe", "win32", "other"],
  ["C:\\Program Files\\PowerShell\\7\\pwsh.exe", "win32", "pwsh"],
  ["C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", "win32", "powershell"],
  ["C:\\Windows\\System32\\cmd.exe", "win32", "cmd"],
];
for (const [sh, plat, kind] of kinds) check(`shellKind ${plat} ${sh}`, () => assert.equal(shellKind(sh, plat), kind));

check("linux env cleanup", () => {
  const env = cleanShellEnv(
    { ELECTRON_RUN_AS_NODE: "1", ORIGINAL_XDG_CURRENT_DESKTOP: "GNOME", XDG_CURRENT_DESKTOP: "Unity", CHROME_DESKTOP: "obsidian.desktop", GDK_BACKEND: "x11", WAYLAND_DISPLAY: "wayland-0", HOME: "/home/me" },
    "linux"
  );
  assert.deepEqual(env, { XDG_CURRENT_DESKTOP: "GNOME", WAYLAND_DISPLAY: "wayland-0", HOME: "/home/me" });
});
check("linux env keeps user GDK_BACKEND", () => {
  assert.equal(cleanShellEnv({ GDK_BACKEND: "wayland" }, "linux").GDK_BACKEND, "wayland");
  assert.equal(cleanShellEnv({ GDK_BACKEND: "x11" }, "linux").GDK_BACKEND, "x11");
});
check("non-linux env untouched", () => assert.deepEqual(cleanShellEnv({ CHROME_DESKTOP: "x", ELECTRON_NO_ATTACH_CONSOLE: "1" }, "darwin"), { CHROME_DESKTOP: "x" }));

const ev = (key, mods = {}, code) => ({ key, code: code || "Key" + key.toUpperCase(), ctrlKey: !!mods.ctrl, metaKey: !!mods.meta, altKey: !!mods.alt, shiftKey: !!mods.shift });
check("hotkey Mod+J on linux", () => assert.equal(hotkeyMatches({ modifiers: ["Mod"], key: "J" }, ev("j", { ctrl: true }), false), true));
check("hotkey Mod+J vs Ctrl+Shift+J", () => assert.equal(hotkeyMatches({ modifiers: ["Mod"], key: "J" }, ev("J", { ctrl: true, shift: true }), false), false));
check("hotkey Mod+Shift+J", () => assert.equal(hotkeyMatches({ modifiers: ["Mod", "Shift"], key: "J" }, ev("J", { ctrl: true, shift: true }), false), true));
check("hotkey by code", () => assert.equal(hotkeyMatches({ modifiers: ["Ctrl"], code: "KeyP" }, ev("p", { ctrl: true }), false), true));
check("hotkey Mod is Meta on mac", () => assert.equal(hotkeyMatches({ modifiers: ["Mod"], key: "J" }, ev("j", { ctrl: true }), true), false));
check("hotkey non-latin layout", () => assert.equal(hotkeyMatches({ modifiers: ["Mod"], key: "J" }, ev("о", { ctrl: true }, "KeyJ"), false), true));

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
