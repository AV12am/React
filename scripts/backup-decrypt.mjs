// Розшифрувати резервну копію: BACKUP_KEY=… node scripts/backup-decrypt.mjs rc-2026-10-12.json.enc > backup.json
import { readFileSync } from 'node:fs';
import { decryptBackup } from './lib/backup.mjs';

const [file] = process.argv.slice(2);
if (!file || !process.env.BACKUP_KEY) {
  console.error('Використання: BACKUP_KEY=<фраза> node scripts/backup-decrypt.mjs <файл.json.enc> > backup.json');
  process.exit(1);
}
process.stdout.write(JSON.stringify(decryptBackup(readFileSync(file), process.env.BACKUP_KEY), null, 2));
