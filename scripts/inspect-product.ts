const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const product = await db.product.findFirst({
    where: { name: "Chicken Club" },
    include: {
      category: { include: { optionGroups: { include: { choices: true } }, addOns: true } },
      options: { include: { choices: true } },
      productAddons: { include: { addon: true } },
    },
  });
  console.log('Product:', product.name);
  console.log('Category options:', product.category.optionGroups.length);
  console.log('Category add-ons:', product.category.addOns.length);
  console.log('Product-specific options:', product.options.length);
  console.log('Product-specific add-ons:', product.productAddons.length);
}
main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect(); });
