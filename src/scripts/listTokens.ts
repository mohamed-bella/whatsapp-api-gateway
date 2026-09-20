import { tokenService } from '../auth/tokenService';
import { prisma } from '../database/prisma';

async function main() {
  console.log('\n📋 Fetching API Tokens...\n');

  try {
    const tokens = await tokenService.listTokens();
    if (tokens.length === 0) {
      console.log('No tokens found. Run "npm run token:create" to generate one.');
      return;
    }

    console.table(tokens.map((t) => ({
      ID: t.id,
      Name: t.name,
      Prefix: t.tokenPrefix,
      Active: t.active,
      'Last Used': t.lastUsedAt ? t.lastUsedAt.toISOString() : 'Never',
      Created: t.createdAt.toISOString()
    })));
  } catch (err: any) {
    console.error('❌ Failed to list tokens:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
