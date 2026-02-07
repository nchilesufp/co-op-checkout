// @ts-check

/**
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunInput} CartPaymentMethodsTransformRunInput
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunResult} CartPaymentMethodsTransformRunResult
 */

const NO_CHANGES = { operations: [] };

/**
 * Payment Customization Function
 *
 * Hides Co-op and Plant payment methods based on customer entitlements.
 * Payment method names are hardcoded for reliability on production stores
 * where function input debugging is limited.
 *
 * @param {CartPaymentMethodsTransformRunInput} input
 * @returns {CartPaymentMethodsTransformRunResult}
 */
export function cartPaymentMethodsTransformRun(input) {
  const customer = input?.cart?.buyerIdentity?.customer;

  // Defaults: guests & customers without explicit flags are not entitled
  const isCoopEntitled = customer?.coop?.value === "true";
  const isPlantEntitled = customer?.plant?.value === "true";

  /** @type {CartPaymentMethodsTransformRunResult["operations"]} */
  const operations = [];

  for (const method of input.paymentMethods ?? []) {
    const name = method.name.trim().toLowerCase();

    const isCoOpMethod = name === "co-op";
    const isPlantMethod = name === "plant";

    if (isCoOpMethod && !isCoopEntitled) {
      operations.push({
        paymentMethodHide: { paymentMethodId: method.id },
      });
    }

    if (isPlantMethod && !isPlantEntitled) {
      operations.push({
        paymentMethodHide: { paymentMethodId: method.id },
      });
    }
  }

  return operations.length === 0 ? NO_CHANGES : { operations };
}
