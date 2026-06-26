import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

// Batch 1 seed: idempotently create the single local user.
// Re-running must not create duplicate users (upsert on the fixed id).
const LOCAL_USER = {
  id: "local-user",
  displayName: "Local Learner",
  timezone: "Asia/Shanghai",
};

// First login account. Username is fixed; the password comes from
// APP_LOGIN_PASSWORD so it stays the same value as the previous password-only
// login. Stored hashed, never in plaintext.
const ADMIN_USERNAME = "admin";

async function main() {
  const user = await prisma.userProfile.upsert({
    where: { id: LOCAL_USER.id },
    update: {
      displayName: LOCAL_USER.displayName,
      timezone: LOCAL_USER.timezone,
    },
    create: LOCAL_USER,
  });

  console.log(`Seed complete. Local user ready: ${user.id} (${user.displayName}).`);

  const adminPassword = process.env.APP_LOGIN_PASSWORD?.trim();
  if (!adminPassword) {
    console.warn(
      "APP_LOGIN_PASSWORD not set — skipping admin account seed. Set it and re-run `pnpm db:seed`.",
    );
    return;
  }

  // Only set the password hash on create, so re-seeding does not silently reset
  // a password that may have been changed after the initial seed.
  const account = await prisma.account.upsert({
    where: { username: ADMIN_USERNAME },
    update: { userProfileId: user.id },
    create: {
      username: ADMIN_USERNAME,
      passwordHash: hashPassword(adminPassword),
      userProfileId: user.id,
    },
  });

  console.log(`Admin account ready: ${account.username} -> ${account.userProfileId}.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
