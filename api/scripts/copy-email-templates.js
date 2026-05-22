const { cpSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const dest = join(root, 'dist/shared/email/templates');

mkdirSync(dest, { recursive: true });
cpSync(join(root, 'src/shared/email/templates'), dest, { recursive: true });
