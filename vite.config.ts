import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { execFileSync } from 'child_process';
import fs from 'fs';

const runGitCommand = (args: string[]): string => {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const readPackageVersion = (): string => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version.trim() : '';
  } catch {
    return '';
  }
};

// Get version from environment, git tag, or package.json
function getVersion(): string {
  // 1. Environment variable (set by GitHub Actions)
  if (process.env.VERSION?.trim()) {
    return process.env.VERSION.trim();
  }

  // 2. Try git tag
  const exactTag = runGitCommand(['describe', '--tags', '--exact-match']);
  if (exactTag) {
    return exactTag;
  }

  const describeTag = runGitCommand(['describe', '--tags', '--always']);
  if (describeTag && /[0-9a-f]{7,}/i.test(describeTag) === false) {
    return describeTag;
  }

  // 3. Fall back to package.json version
  const packageVersion = readPackageVersion();
  if (packageVersion && packageVersion !== '0.0.0') {
    return packageVersion;
  }

  const shortHash = runGitCommand(['rev-parse', '--short', 'HEAD']);
  return shortHash ? `local@${shortHash}` : 'local';
}

function getGitRef(): string {
  const branch = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
  const shortHash = runGitCommand(['rev-parse', '--short', 'HEAD']);

  if (branch && shortHash) {
    return `${branch}@${shortHash}`;
  }

  return branch || shortHash || '';
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true
    })
  ],
  define: {
    __APP_VERSION__: JSON.stringify(getVersion()),
    __APP_GIT_REF__: JSON.stringify(getGitRef()),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  css: {
    modules: {
      localsConvention: 'camelCase',
      generateScopedName: '[name]__[local]___[hash:base64:5]'
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    }
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined
      }
    }
  }
});
