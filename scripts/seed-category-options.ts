import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // 1. Delete the 2 existing products and their product-specific data
  const existingProducts = await db.product.findMany({
    select: { id: true, name: true },
  });

  for (const p of existingProducts) {
    await db.optionGroup.deleteMany({ where: { productId: p.id } });
    await db.productAddon.deleteMany({ where: { productId: p.id } });
    await db.product.delete({ where: { id: p.id } });
    console.log("Deleted product:", p.name);
  }

  // 2. Clear old category-level options/add-ons to start fresh
  await db.categoryOptionChoice.deleteMany({});
  await db.categoryOptionGroup.deleteMany({});
  await db.categoryAddOn.deleteMany({});
  console.log("Cleared old category options/add-ons");

  // 3. Find categories by name
  const sandwichCat = await db.category.findUnique({ where: { name: "Sandwichs" } });
  const pizzaCat = await db.category.findUnique({ where: { name: "Pizzas" } });

  if (!sandwichCat) {
    console.log("Category 'Sandwichs' not found — skipping sandwich setup");
  } else {
    // Set up Sandwich global options
    // Group 1: Bread type (required, single)
    const breadGroup = await db.categoryOptionGroup.create({
      data: {
        categoryId: sandwichCat.id,
        name: "Pain",
        required: true,
        multiple: false,
        sortOrder: 0,
      },
    });
    await db.categoryOptionChoice.createMany({
      data: [
        { groupId: breadGroup.id, name: "Baguette", priceModifier: 0, sortOrder: 0 },
        { groupId: breadGroup.id, name: "Wrap", priceModifier: 0.5, sortOrder: 1 },
      ],
    });

    // Group 2: Salade (optional, multiple)
    const saladeGroup = await db.categoryOptionGroup.create({
      data: {
        categoryId: sandwichCat.id,
        name: "Salade",
        required: false,
        multiple: true,
        sortOrder: 1,
      },
    });
    await db.categoryOptionChoice.createMany({
      data: [
        { groupId: saladeGroup.id, name: "Laitue", priceModifier: 0, sortOrder: 0 },
        { groupId: saladeGroup.id, name: "Roquette", priceModifier: 0.3, sortOrder: 1 },
        { groupId: saladeGroup.id, name: "Épinard", priceModifier: 0.3, sortOrder: 2 },
        { groupId: saladeGroup.id, name: "Mâche", priceModifier: 0.5, sortOrder: 3 },
      ],
    });

    // Group 3: Sauce (optional, single)
    const sauceGroup = await db.categoryOptionGroup.create({
      data: {
        categoryId: sandwichCat.id,
        name: "Sauce",
        required: false,
        multiple: false,
        sortOrder: 2,
      },
    });
    await db.categoryOptionChoice.createMany({
      data: [
        { groupId: sauceGroup.id, name: "Mayonnaise", priceModifier: 0, sortOrder: 0 },
        { groupId: sauceGroup.id, name: "Ketchup", priceModifier: 0, sortOrder: 1 },
      ],
    });

    // Group 4: Drink (required, single)
    const drinkGroup = await db.categoryOptionGroup.create({
      data: {
        categoryId: sandwichCat.id,
        name: "Boisson",
        required: true,
        multiple: false,
        sortOrder: 3,
      },
    });
    await db.categoryOptionChoice.createMany({
      data: [
        { groupId: drinkGroup.id, name: "Coca-Cola 33cl", priceModifier: 2.5, sortOrder: 0 },
      ],
    });

    // Global add-ons for Sandwichs
    await db.categoryAddOn.createMany({
      data: [
        { categoryId: sandwichCat.id, name: "Fromage supplémentaire", price: 1.0, sortOrder: 0, active: true },
        { categoryId: sandwichCat.id, name: "Bacon", price: 1.5, sortOrder: 1, active: true },
        { categoryId: sandwichCat.id, name: "Avocat", price: 1.0, sortOrder: 2, active: true },
      ],
    });

    console.log("Set up global options & add-ons for 'Sandwichs'");

    // Create a new sandwich product
    const sandwichProduct = await db.product.create({
      data: {
        name: "Chicken Club",
        description: "Poulet grillé, bacon, fromage, sauce maison",
        price: 8.5,
        vatRate: 10,
        categoryId: sandwichCat.id,
        active: true,
        available: true,
        sortOrder: 0,
      },
    });
    console.log("Created product:", sandwichProduct.name);
  }

  if (!pizzaCat) {
    console.log("Category 'Pizzas' not found — skipping pizza setup");
  } else {
    // Set up Pizza global options
    // Group: Size (required, single) with fixed price modifiers across all pizzas
    const sizeGroup = await db.categoryOptionGroup.create({
      data: {
        categoryId: pizzaCat.id,
        name: "Taille",
        required: true,
        multiple: false,
        sortOrder: 0,
      },
    });
    await db.categoryOptionChoice.createMany({
      data: [
        { groupId: sizeGroup.id, name: "Petite", priceModifier: 0, sortOrder: 0 },
        { groupId: sizeGroup.id, name: "Moyenne", priceModifier: 2, sortOrder: 1 },
        { groupId: sizeGroup.id, name: "Grande", priceModifier: 4, sortOrder: 2 },
      ],
    });

    // Global add-ons for Pizzas
    await db.categoryAddOn.createMany({
      data: [
        { categoryId: pizzaCat.id, name: "Champignons", price: 1.0, sortOrder: 0, active: true },
        { categoryId: pizzaCat.id, name: "Olives", price: 0.8, sortOrder: 1, active: true },
        { categoryId: pizzaCat.id, name: "Supplément fromage", price: 1.5, sortOrder: 2, active: true },
      ],
    });

    console.log("Set up global options & add-ons for 'Pizzas'");

    // Create a new pizza product
    const pizzaProduct = await db.product.create({
      data: {
        name: "Margherita",
        description: "Sauce tomate, mozzarella, basilic",
        price: 9.0,
        vatRate: 10,
        categoryId: pizzaCat.id,
        active: true,
        available: true,
        sortOrder: 0,
      },
    });
    console.log("Created product:", pizzaProduct.name);
  }

  console.log("Seed complete!");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
