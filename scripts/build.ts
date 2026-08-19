/**
 * dsh-model-balance 同款构建脚本（esbuild）。
 *
 * - Host 入口（src/host/index.ts）→ lib/index.js（ESM，bundle，external 化
 *   @deepseek-ai/dsh-home-paths 与 node 内置模块）
 * - Client 入口（src/client/index.ts）→ lib/client.js（browser bundle +
 *   DSH 工厂包装 window.__ModuleLoader__.load）
 *
 * Usage:  npx tsx scripts/build.ts
 */

import { build } from 'esbuild';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'lib');

/** 把打包后的 client 代码缩进并包进 DSH 工厂。 */
function wrapClientFactory(code: string, id: string): string {
  const indented = code
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : '\t\t' + line))
    .join('\n');
  return `window.__ModuleLoader__.load({
\tid: ${JSON.stringify(id)},
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${indented}
\t\treturn module.exports;
\t}
});
`;
}

async function main() {
  console.log('Cleaning lib/ …');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  // 1) Host entry → lib/index.js
  console.log('Building host entry …');
  await build({
    entryPoints: [resolve(ROOT, 'src/host/index.ts')],
    outfile: resolve(OUT, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'es2022',
    format: 'esm',
    sourcemap: true,
    // @deepseek-ai/dsh-home-paths 由 dsh 宿主提供，运行时从其 node_modules 解析
    external: ['@deepseek-ai/dsh-home-paths'],
  });

  // 2) Client entry → lib/client.js（bundle + factory-wrap）
  console.log('Building client entry …');
  const clientResult = await build({
    entryPoints: [resolve(ROOT, 'src/client/index.ts')],
    write: false,
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    format: 'cjs',
    sourcemap: false,
    minify: false,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    // react 由 DSH loader 的 require("react") 解析
    external: ['react', 'react/jsx-runtime'],
  });

  const clientCode = clientResult.outputFiles[0].text;
  writeFileSync(resolve(OUT, 'client.js'), wrapClientFactory(clientCode, 'dsh-multi-user'), 'utf8');

  console.log('Build complete ✓');
  console.log('  Host:   lib/index.js');
  console.log('  Client: lib/client.js');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
