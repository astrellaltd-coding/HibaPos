const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const cats = await db.category.findMany({
    include: {
      optionGroups: { include: { choices: true } },
      addOns: true,
    },
  });
  for (const c of cats) {
    console.log('\nCategory:', c.name);
    console.log('  Options:', c.optionGroups.length);
    for (const g of c.optionGroups) {
      console.log('    -', g.name, '(required:', g.required, ', multiple:', g.multiple, ')');
      for (const ch of g.choices) {
        console.log('      ·', ch.name, ch.priceModifier > 0 ? `(+${ch.priceModifier}€)` : '');
      }
    }
    console.log('  Add-ons:', c.addOns.length);
    for (const a of c.addOns) {
      console.log('    -', a.name, `(${a.price}€)`);
    }
  }
}
main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect(); });
