// Route staged files to the correct package-level ESLint/Prettier
// This ensures each subpackage uses its own flat config and prettier config.

const path = require('path');

/** @type {import('lint-staged').Config} */
module.exports = {
  '**/*.{ts,tsx,js,jsx}': (files) => {
    const byPkg = files.reduce((acc, abs) => {
      const f = path.relative(process.cwd(), abs);
      const match = f.match(/^(packages\/[^/]+)/);
      const pkg = match ? match[1] : '.';
      acc[pkg] ||= [];
      acc[pkg].push(f);
      return acc;
    }, /** @type {Record<string,string[]>} */({}));

    const cmds = [];
    for (const [pkg, fpaths] of Object.entries(byPkg)) {
      const pkgRelative = fpaths.map((p) => (pkg === '.' ? p : path.relative(pkg, p)));
      const filesArg = pkgRelative.map((p) => `'${p}'`).join(' ');
      // Run ESLint (fix) and then Prettier for JS/TS files inside each package
      const prefix = pkg === '.' ? '' : `-C ${pkg} `;
      cmds.push(`pnpm ${prefix}exec eslint --fix ${filesArg}`);
      const prettierCmd = pkg === '.'
        ? `pnpm exec prettier --no-config --write ${filesArg}`
        : `pnpm ${prefix}exec prettier --write ${filesArg}`;
      cmds.push(prettierCmd);
    }
    return cmds;
  },
  '**/*.{json,md,mdx,css,scss,less}': (files) => {
    const byPkg = files.reduce((acc, abs) => {
      const f = path.relative(process.cwd(), abs);
      const match = f.match(/^(packages\/[^/]+)/);
      const pkg = match ? match[1] : '.';
      acc[pkg] ||= [];
      acc[pkg].push(f);
      return acc;
    }, /** @type {Record<string,string[]>} */({}));

    const cmds = [];
    for (const [pkg, fpaths] of Object.entries(byPkg)) {
      const pkgRelative = fpaths.map((p) => (pkg === '.' ? p : path.relative(pkg, p)));
      const filesArg = pkgRelative.map((p) => `'${p}'`).join(' ');
      const prefix = pkg === '.' ? '' : `-C ${pkg} `;
      const prettierCmd = pkg === '.'
        ? `pnpm exec prettier --no-config --write ${filesArg}`
        : `pnpm ${prefix}exec prettier --write ${filesArg}`;
      cmds.push(prettierCmd);
    }
    return cmds;
  },
};


