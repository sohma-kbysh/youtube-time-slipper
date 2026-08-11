// Build script for YouTube Time Slipper.
//
// Bundles the three extension entry points with esbuild and copies the static
// assets into dist/, which is the directory loaded via chrome://extensions.
//
//   src/content/index.ts        -> dist/content.js     (IIFE: content scripts
//                                                       are not ES modules)
//   src/background/service-worker.ts -> dist/background.js (ESM: the manifest
//                                                       declares type=module)
//   src/popup/popup.ts          -> dist/popup.js        (IIFE)

import { build, context } from "esbuild";
import { cp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const watch = process.argv.includes("--watch");
const dev = watch || process.argv.includes("--dev");

/** @type {import("esbuild").BuildOptions} */
const shared = {
  bundle: true,
  target: ["chrome120"],
  logLevel: "info",
  sourcemap: dev ? "inline" : false,
  minify: !dev,
  legalComments: "none",
  define: {
    __DEV__: JSON.stringify(dev)
  }
};

const bundles = [
  {
    ...shared,
    entryPoints: [path.join(root, "src/content/index.ts")],
    outfile: path.join(dist, "content.js"),
    format: "iife",
    platform: "browser"
  },
  {
    ...shared,
    entryPoints: [path.join(root, "src/background/service-worker.ts")],
    outfile: path.join(dist, "background.js"),
    format: "esm",
    platform: "browser"
  },
  {
    ...shared,
    entryPoints: [path.join(root, "src/popup/popup.ts")],
    outfile: path.join(dist, "popup.js"),
    format: "iife",
    platform: "browser"
  }
];

async function copyStatic() {
  await mkdir(dist, { recursive: true });

  // The manifest version is the single source of truth for the extension
  // version; package.json is kept in sync by hand.
  await cp(path.join(root, "manifest.json"), path.join(dist, "manifest.json"));

  await cp(path.join(root, "src/popup/popup.html"), path.join(dist, "popup.html"));
  await cp(path.join(root, "src/popup/popup.css"), path.join(dist, "popup.css"));
  await cp(path.join(root, "src/content/content.css"), path.join(dist, "content.css"));

  await cp(path.join(root, "public/icons"), path.join(dist, "icons"), {
    recursive: true
  });
}

async function verify() {
  const manifest = JSON.parse(await readFile(path.join(dist, "manifest.json"), "utf8"));
  const required = [
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
    ...manifest.content_scripts[0].css,
    manifest.action.default_popup,
    ...Object.values(manifest.icons)
  ];

  const missing = [];
  for (const rel of required) {
    try {
      await readFile(path.join(dist, rel));
    } catch {
      missing.push(rel);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `dist/ is missing files referenced by manifest.json: ${missing.join(", ")}`
    );
  }
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await copyStatic();

  if (watch) {
    for (const options of bundles) {
      const ctx = await context(options);
      await ctx.watch();
    }
    await writeFile(path.join(dist, ".watch"), new Date().toISOString());
    console.log("watching… (dist/ is loadable via chrome://extensions)");
    return;
  }

  await Promise.all(bundles.map((options) => build(options)));
  await verify();
  console.log(`built ${path.relative(process.cwd(), dist)}${path.sep}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
