import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Batch 1 seed: idempotently create the single local user.
// Re-running must not create duplicate users (upsert on the fixed id).
const LOCAL_USER = {
  id: "local-user",
  displayName: "Local Learner",
  timezone: "Asia/Shanghai",
};

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
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
