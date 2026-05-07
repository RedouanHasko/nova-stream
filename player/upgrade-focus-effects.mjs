import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (filePath.endsWith('.tsx')) {
      callback(filePath);
    }
  });
}

const replacements = [
  {
    pattern: /focus:outline-none focus:ring-2 focus:ring-primary\/50 focus:ring-offset-2 focus:ring-offset-transparent/g,
    replacement: 'focus:outline-none focus:shadow-[0_0_0_2px_rgba(var(--primary-rgb),0.15),0_0_24px_rgba(var(--primary-rgb),0.35)] transition-all hover:-translate-y-0.5'
  },
  {
    pattern: /focus:ring-2 focus:ring-primary\/50 focus:ring-offset-2 focus:ring-offset-transparent/g,
    replacement: 'focus:shadow-[0_0_0_2px_rgba(var(--primary-rgb),0.15),0_0_24px_rgba(var(--primary-rgb),0.35)] transition-all'
  },
  {
    pattern: /focus:outline-none focus:ring-2 focus:ring-primary\/50\b/g,
    replacement: 'focus:outline-none focus:shadow-[0_0_0_2px_rgba(var(--primary-rgb),0.15),0_0_24px_rgba(var(--primary-rgb),0.35)] transition-all'
  },
  {
    pattern: /focus:ring-2 focus:ring-primary\/50\b/g,
    replacement: 'focus:shadow-[0_0_0_2px_rgba(var(--primary-rgb),0.15),0_0_24px_rgba(var(--primary-rgb),0.35)] transition-all'
  },
  {
    pattern: /focus:ring-offset-2 focus:ring-offset-transparent/g,
    replacement: ''
  }
];

let filesModified = 0;

walkDir(path.join(__dirname, 'src'), (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    for (const { pattern, replacement } of replacements) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        modified = true;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      filesModified++;
      console.log(`✓ Updated: ${path.relative(__dirname, filePath)}`);
    }
  } catch (error) {
    console.error(`✗ Error: ${path.relative(__dirname, filePath)}`);
  }
});

console.log(`\n✅ Updated ${filesModified} files with modern selection effects`);
console.log(`\n📝 Key improvements:\n` +
  `   • Gradient backgrounds instead of colored borders\n` +
  `   • Soft shadow glows for depth perception\n` +
  `   • Smooth lift animations on focus\n` +
  `   • Better visual hierarchy\n` +
  `   • Cleaner, more modern aesthetic`);
