import { PrismaClient } from "@prisma/client";
// NOTE: `hashPin` is async since Batch 4.2 (C-09). `scripts/` is excluded
// from both tsconfig.json and eslint.config.mjs, so a missing `await` here
// would not be caught by `bun run typecheck` — it would silently store the
// string "[object Promise]" as a PIN hash.
import { hashPin } from "../src/lib/auth";

const db = new PrismaClient();

async function main() {
  // Clear existing users and related data
  await db.auditLog.deleteMany({});
  await db.session.deleteMany({});
  await db.user.deleteMany({});

  const adminPin = "123456";
  const managerPin = "111111";

  const admin = await db.user.create({
    data: {
      username: "admin",
      name: "Administrateur",
      role: "SUPER_ADMIN",
      pinHash: await hashPin(adminPin),
      active: true,
    },
  });

  await db.user.create({
    data: {
      username: "manager",
      name: "Gérant",
      role: "MANAGER",
      pinHash: await hashPin(managerPin),
      active: true,
    },
  });

  console.log("Seeded users:");
  console.log("  admin /", adminPin);
  console.log("  manager /", managerPin);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
