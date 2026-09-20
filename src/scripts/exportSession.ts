import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { env } from '../config/env';

async function main() {
  const authDir = path.resolve(process.cwd(), env.AUTH_DIR);
  if (!fs.existsSync(authDir)) {
    console.error('❌ No auth directory found at:', authDir);
    process.exit(1);
  }
  const zip = new AdmZip();
  zip.addLocalFolder(authDir);
  const outputFile = process.argv[2] || path.resolve(process.cwd(), 'whatsapp-session-backup.zip');
  zip.writeZip(outputFile);
  console.log('✅ Session exported successfully to:', outputFile);
}

main();
