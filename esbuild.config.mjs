import esbuild from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

await esbuild.build({
  entryPoints: ["src/main.js"],
  outfile: "main.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["obsidian", "electron"],
  logLevel: "info",
  legalComments: "eof",
});

const xtermCss = readFileSync("node_modules/@xterm/xterm/css/xterm.css", "utf8");
writeFileSync("styles.css", readFileSync("src/styles.css", "utf8") + "\n" + xtermCss);
