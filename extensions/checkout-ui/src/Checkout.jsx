import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  useAppMetafields,
  useSelectedPaymentOptions,
  useBuyerJourneyIntercept,
  useApplyAttributeChange,
  useInstructions,
} from '@shopify/ui-extensions/checkout/preact';

// Shopify manual payment method handles are slugified versions of the name.
// e.g. "Co-op" → "co-op", "Plant" → "plant"
function toHandle(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').replace(/^-+/, '');
}

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [customerCode, setCustomerCode] = useState('');
  const [plantNumber, setPlantNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState(null);

  // Read config from Shop metafield (declared in shopify.extension.toml)
  const shopMetafields = useAppMetafields({
    namespace: '$app:co-op-plant-payment',
    key: 'configuration',
    type: 'shop',
  });

  let config = { coOpPaymentMethodNames: [], plantPaymentMethodNames: [] };
  if (shopMetafields.length > 0 && shopMetafields[0].metafield?.value) {
    try {
      config = JSON.parse(shopMetafields[0].metafield.value);
    } catch (e) {
      // config stays as default empty arrays
    }
  }

  // Pre-compute handle sets from config names for matching
  const coOpHandles = config.coOpPaymentMethodNames.map(toHandle);
  const plantHandles = config.plantPaymentMethodNames.map(toHandle);

  // Detect which payment method is selected by comparing handles
  const selectedOptions = useSelectedPaymentOptions();
  let selectedPaymentType = null;
  for (const option of selectedOptions) {
    if (coOpHandles.includes(option.handle)) {
      selectedPaymentType = 'co-op';
      break;
    }
    if (plantHandles.includes(option.handle)) {
      selectedPaymentType = 'plant';
      break;
    }
  }

  const instructions = useInstructions();
  const applyAttributeChange = useApplyAttributeChange();

  // Validate required fields before checkout can proceed
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (!canBlockProgress || !selectedPaymentType) {
      return { behavior: 'allow' };
    }

    if (selectedPaymentType === 'co-op' && !customerCode.trim()) {
      setValidationError('Customer Code is required for Co-op payment.');
      return {
        behavior: 'block',
        reason: 'Missing Co-op Customer Code',
        errors: [{ message: 'Please enter your Co-op Customer Code to proceed.' }],
      };
    }

    if (selectedPaymentType === 'plant' && !plantNumber.trim()) {
      setValidationError('Plant Number is required for Plant payment.');
      return {
        behavior: 'block',
        reason: 'Missing Plant Number',
        errors: [{ message: 'Please enter your Plant Number to proceed.' }],
      };
    }

    setValidationError(null);
    return { behavior: 'allow' };
  });

  // Sync form values to order attributes
  useEffect(() => {
    if (!selectedPaymentType || !instructions.attributes.canUpdateAttributes) return;

    applyAttributeChange({ type: 'updateAttribute', key: 'co_op_type', value: selectedPaymentType });

    if (selectedPaymentType === 'co-op' && customerCode) {
      applyAttributeChange({ type: 'updateAttribute', key: 'co_op_customer_code', value: customerCode });
    }
    if (selectedPaymentType === 'plant' && plantNumber) {
      applyAttributeChange({ type: 'updateAttribute', key: 'co_op_plant_number', value: plantNumber });
    }
    if (notes) {
      applyAttributeChange({ type: 'updateAttribute', key: 'co_op_notes', value: notes });
    }
  }, [selectedPaymentType, customerCode, plantNumber, notes]);

  // Clear attributes when switching away from co-op/plant
  useEffect(() => {
    if (selectedPaymentType || !instructions.attributes.canUpdateAttributes) return;

    ['co_op_type', 'co_op_customer_code', 'co_op_plant_number', 'co_op_notes'].forEach((key) => {
      applyAttributeChange({ type: 'updateAttribute', key, value: '' });
    });
  }, [selectedPaymentType]);

  // Nothing to render if no co-op/plant method selected
  if (!selectedPaymentType) return null;

  if (!instructions.attributes.canUpdateAttributes) {
    return (
      <s-banner heading="Co-op/Plant Payment" tone="warning">
        <s-text>Order attributes cannot be modified for this checkout type.</s-text>
      </s-banner>
    );
  }

  const isCoOp = selectedPaymentType === 'co-op';

  return (
    <s-stack gap="base">
      <s-text type="strong">{isCoOp ? 'Co-op Account Details' : 'Plant Account Details'}</s-text>

      {validationError && (
        <s-banner tone="critical">
          <s-text>{validationError}</s-text>
        </s-banner>
      )}

      {isCoOp ? (
        <s-text-field
          label="Customer Code"
          value={customerCode}
          onInput={(e) => { setCustomerCode(/** @type {any} */ (e.currentTarget).value); setValidationError(null); }}
        />
      ) : (
        <s-text-field
          label="Plant #"
          value={plantNumber}
          onInput={(e) => { setPlantNumber(/** @type {any} */ (e.currentTarget).value); setValidationError(null); }}
        />
      )}

      <s-text-area
        label="Notes (optional)"
        value={notes}
        onInput={(e) => setNotes(/** @type {any} */ (e.currentTarget).value)}
        rows={3}
      />
    </s-stack>
  );
}
