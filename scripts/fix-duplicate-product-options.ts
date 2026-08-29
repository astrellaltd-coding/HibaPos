import { db } from "../src/lib/db";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry");
  
  if (dryRun) {
    console.log("Running in DRY-RUN mode. No changes will be saved.");
  } else {
    console.log("Running in LIVE mode. Deleting duplicate option groups.");
  }

  const products = await db.product.findMany({
    include: {
      category: {
        include: {
          optionGroups: true,
          parent: {
            include: {
              optionGroups: true,
            }
          }
        }
      },
      options: true,
    }
  });

  let totalDeleted = 0;
  let affectedProducts = 0;

  for (const product of products) {
    if (!product.inheritCategoryGlobals) continue;
    
    const effectiveCategory = product.category?.parent ?? product.category;
    const categoryOptionGroups = effectiveCategory?.optionGroups ?? [];
    const categoryGroupNames = new Set(categoryOptionGroups.map(g => g.name.trim().toLowerCase()));
    
    if (categoryGroupNames.size === 0) continue;

    const duplicates = product.options.filter(g => categoryGroupNames.has(g.name.trim().toLowerCase()));
    
    if (duplicates.length > 0) {
      affectedProducts++;
      console.log(`Product "${product.name}" (${product.id}) has ${duplicates.length} duplicate groups: ${duplicates.map(g => g.name).join(', ')}`);
      
      if (!dryRun) {
        for (const dup of duplicates) {
          await db.optionGroup.delete({ where: { id: dup.id } });
          totalDeleted++;
        }
      } else {
        totalDeleted += duplicates.length;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`Affected Products: ${affectedProducts}`);
  console.log(`Total Duplicate Groups ${dryRun ? 'to delete' : 'deleted'}: ${totalDeleted}`);
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
