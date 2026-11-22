import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist-single');
const publicHtmlPath = path.resolve(rootDir, 'public', 'FOC_DynoLab_V2.html');

function insertBeforeTag(source, tag, content) {
  const idx = source.lastIndexOf(tag);
  if (idx === -1) {
    throw new Error(`Could not find ${tag} in built index.html`);
  }
  return source.slice(0, idx) + content + source.slice(idx);
}

async function main() {
  process.env.NODE_ENV = 'production';
  fs.rmSync(outDir, { recursive: true, force: true });

  await build({
    root: rootDir,
    mode: 'production',
    publicDir: false,
    logLevel: 'warn',
    build: {
      outDir,
      emptyOutDir: true,
      minify: 'esbuild',
      assetsInlineLimit: 100 * 1024 * 1024,
      cssCodeSplit: false,
      sourcemap: false,
      rolldownOptions: {
        output: {
          format: 'iife',
          name: 'FocDynoLabApp',
          codeSplitting: false,
        },
      },
    },
  });

  const htmlPath = path.join(outDir, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const assetsDir = path.join(outDir, 'assets');
  const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];

  const cssFiles = assetFiles.filter((f) => f.endsWith('.css'));
  const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));

  if (jsFiles.length !== 1) {
    throw new Error(`Expected exactly 1 JS bundle, got ${jsFiles.length}: ${jsFiles.join(', ')}`);
  }

  const cssContent = cssFiles
    .map((f) => fs.readFileSync(path.join(assetsDir, f), 'utf8'))
    .join('\n')
    .replace(/<\/style/gi, '<\\/style');

  const rawJs = fs.readFileSync(path.join(assetsDir, jsFiles[0]), 'utf8');
  const jsContent = rawJs.replace(/<\/script/gi, '<\\/script');

  // Remove external Google Fonts links and external module/stylesheet links for instant offline loading
  let singleHtml = html
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>\s*/gi, '')
    .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>\s*/gi, '')
    .replace(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*><\/script>\s*/gi, '');

  // Safe slice-based insertion (avoids String.replace $& / $' / $1 corruption)
  singleHtml = insertBeforeTag(singleHtml, '</head>', `\n    <style>\n${cssContent}\n    </style>\n  `);
  singleHtml = insertBeforeTag(singleHtml, '</body>', `\n    <script>\n${jsContent}\n    </script>\n  `);

  fs.mkdirSync(path.dirname(publicHtmlPath), { recursive: true });
  fs.writeFileSync(publicHtmlPath, singleHtml, 'utf8');
  fs.rmSync(outDir, { recursive: true, force: true });

  const sizeKb = (Buffer.byteLength(singleHtml, 'utf8') / 1024).toFixed(1);
  console.log(`Generated standalone HTML: ${publicHtmlPath} (${sizeKb} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
