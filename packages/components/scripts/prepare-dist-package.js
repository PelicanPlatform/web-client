// scripts/prepare-dist-package.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
);

const distPackageJson = {
  ...packageJson,
  main: "index.js",
  types: "index.d.ts",
  files: [
      "*"
  ],
  exports: {
    ".": {
      import: "./index.js",
      require: "./index.cjs"
    }
  },
};

fs.writeFileSync(
    path.join(__dirname, '../dist/package.json'),
    JSON.stringify(distPackageJson, null, 2)
);

// Copy README to dist
fs.copyFileSync(
    path.join(__dirname, '../README.md'),
    path.join(__dirname, '../dist/README.md')
);


console.log("Dist package.json and README prepared successfully.");
