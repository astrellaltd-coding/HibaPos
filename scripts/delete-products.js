const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  await prisma.productAddon.deleteMany();
  await prisma.optionChoice.deleteMany();
  await prisma.optionGroup.deleteMany();
  await prisma.product.deleteMany();
  console.log('All products deleted.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
