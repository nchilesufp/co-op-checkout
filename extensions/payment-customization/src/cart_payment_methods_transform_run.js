// @ts-check

/**
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunInput} CartPaymentMethodsTransformRunInput
 * @typedef {import("../generated/api").CartPaymentMethodsTransformRunResult} CartPaymentMethodsTransformRunResult
 */

/**
 * @type {CartPaymentMethodsTransformRunResult}
 */
const NO_CHANGES = {
  operations: [],
};

/**
 * Parses the configuration metafield.
 * Expected format: { "coOpPaymentMethodNames": [...], "plantPaymentMethodNames": [...] }
 * @param {string|null|undefined} value
 * @returns {{ coOpPaymentMethodNames: string[], plantPaymentMethodNames: string[] }}
 */
function parseConfiguration(value) {
  const defaultConfig = { coOpPaymentMethodNames: [], plantPaymentMethodNames: [] };
  if (!value) return defaultConfig;
  try {
    const parsed = JSON.parse(value);
    return {
      coOpPaymentMethodNames: Array.isArray(parsed.coOpPaymentMethodNames)
        ? parsed.coOpPaymentMethodNames
        : [],
      plantPaymentMethodNames: Array.isArray(parsed.plantPaymentMethodNames)
        ? parsed.plantPaymentMethodNames
        : [],
    };
  } catch {
    return defaultConfig;
  }
}

/**
 * Payment Customization Function
 *
 * Hides Co-op and Plant payment methods based on customer entitlements.
 *
 * Entitlement is controlled by two customer boolean metafields:
 * - co_op: true/false
 * - plant: true/false
 *
 * Logic:
 * - If co_op is false or unset: hide Co-op payment methods
 * - If plant is false or unset: hide Plant payment methods
 * - If both are true: show both
 *
 * @param {CartPaymentMethodsTransformRunInput} input
 * @returns {CartPaymentMethodsTransformRunResult}
 */
export function cartPaymentMethodsTransformRun(input) {
  const customer = input?.cart?.buyerIdentity?.customer;

  // Read boolean entitlements from metafields
  // Metafield values come as strings: "true" or "false"
  const isCoopEntitled = customer?.coop?.value === "true";
  const isPlantEntitled = customer?.plant?.value === "true";

  // Parse configuration from PaymentCustomization metafield
  const configMetafieldValue = input?.paymentCustomization?.metafield?.value;
  const config = parseConfiguration(configMetafieldValue);

  // If no config is set, don't hide anything (fail open)
  if (config.coOpPaymentMethodNames.length === 0 && config.plantPaymentMethodNames.length === 0) {
    return NO_CHANGES;
  }

  // Collect payment methods to hide
  /** @type {import("../generated/api").CartPaymentMethodsTransformRunResult["operations"]} */
  const operations = [];

  for (const method of input.paymentMethods ?? []) {
    const isCoOpMethod = config.coOpPaymentMethodNames.includes(method.name);
    const isPlantMethod = config.plantPaymentMethodNames.includes(method.name);

    // Hide Co-op payment methods if customer doesn't have co-op entitlement
    if (isCoOpMethod && !isCoopEntitled) {
      operations.push({
        paymentMethodHide: {
          paymentMethodId: method.id,
        },
      });
    }

    // Hide Plant payment methods if customer doesn't have plant entitlement
    if (isPlantMethod && !isPlantEntitled) {
      operations.push({
        paymentMethodHide: {
          paymentMethodId: method.id,
        },
      });
    }
  }

  if (operations.length === 0) {
    return NO_CHANGES;
  }

  return { operations };
}
