import type { Prisma } from "@prisma/client";

/**
 * L-217 — replace a product's option ceilings, or leave them alone.
 *
 * Wholesale replacement, like `options` and `comboSlots`: the form sends the
 * complete set or nothing at all. `undefined` means the caller said nothing and
 * the stored rows stand — C-24's rule, and the reason a partial update cannot
 * quietly restore the six-viande Tacos M by omitting a field.
 *
 * IN `lib/services/` RATHER THAN THE ROUTE that first needed it: both the
 * create and the update paths call it, and a Next route file exports handlers.
 * A helper exported beside them is a shape the framework does not promise to
 * keep accepting.
 */
export async function replaceOptionQuotas(
  tx: Prisma.TransactionClient,
  productId: string,
  quotas: { groupId: string; included: number }[] | undefined,
) {
  if (quotas === undefined) return;
  await tx.productOptionQuota.deleteMany({ where: { productId } });
  for (const q of quotas) {
    await tx.productOptionQuota.create({
      data: { productId, groupId: q.groupId, included: q.included },
    });
  }
}
