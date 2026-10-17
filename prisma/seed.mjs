/**
 * Development seed.
 *
 * Creates a single sign-in and a few family profiles so the app has something
 * to file documents under. It does NOT create documents: those are produced by
 * uploading real files through the app, which is the only honest way to test
 * the OCR and classification pipeline.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = process.env.SEED_EMAIL || "family@example.com";
const DEMO_PASSWORD = process.env.SEED_PASSWORD || "FamilyVault123";
const DEMO_NAME = process.env.SEED_NAME || "The Khan Family";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME },
    create: { email: DEMO_EMAIL, name: DEMO_NAME, passwordHash },
  });

  const members = [
    { name: "Ahmed Khan", relation: "self" },
    { name: "Sana Khan", relation: "spouse" },
    { name: "Zara Khan", relation: "child" },
  ];

  for (const member of members) {
    await prisma.familyMember.upsert({
      where: { userId_name: { userId: user.id, name: member.name } },
      update: { relation: member.relation },
      create: { userId: user.id, ...member },
    });
  }

  console.log(`Seeded ${DEMO_EMAIL} with ${members.length} family profiles.`);
  console.log(`Sign in with: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
