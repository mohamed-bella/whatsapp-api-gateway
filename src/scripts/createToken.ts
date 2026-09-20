import { tokenService } from '../auth/tokenService';
import { prisma } from '../database/prisma';

async function main() {
  const tokenName = process.argv[2] || 'Default Client';
  console.log(`\n🔑 Creating API Token for: "${tokenName}"...`);

  try {
    const result = await tokenService.createToken(tokenName);
    console.log('\n======================================================');
    console.log('✅ API Token created successfully!');
    console.log(`Name:        ${result.name}`);
    console.log(`ID:          ${result.id}`);
    console.log(`Token:       ${result.rawToken}`);
    console.log('======================================================');
    console.log('⚠️  Store this token securely! It will NOT be shown again.\n');
  } catch (err: any) {
    console.error('❌ Failed to create token:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
