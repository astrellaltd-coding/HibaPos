const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
async function main() {
  const products = await db.product.findMany({ select: { id: true, name: true, categoryId: true } });
  const categories = await db.category.findMany({ select: { id: true, name: true } });
  console.log('Categories:', categories.length);
  categories.forEach(c => console.log('  -', c.name, '(' + c.id + ')'));
  console.log('Products:', products.length);
  products.forEach(p => console.log('  -', p.name, '(' + p.id + ')', 'cat:', p.categoryId));
}
main().then(() => db.$disconnect()).catch(e => { console.error(e); db.$disconnect(); });
