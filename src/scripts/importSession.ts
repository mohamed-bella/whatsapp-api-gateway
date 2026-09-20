import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { env } from '../config/env';

async function main() {
  const inputFile = process.argv[2] || path.resolve(process.cwd(), 'whatsapp-session-backup.zip');
  if (!fs.existsSync(inputFile)) {
    console.error('❌ Backup file not found at:', inputFile);
    process.exit(1);
  }

  const authDir = path.resolve(process.cwd(), env.AUTH_DIR);
  if (fs.existsSync(authDir)) {
    fs.rmSync(authDir, { recursive: true, force: true });
  }
  fs.mkdirSync(authDir, { recursive: true });

  const zip = new AdmZip(inputFile);
  zip.extractAllTo(authDir, true);
  console.log('✅ Session imported successfully into:', authDir);
}

main();
