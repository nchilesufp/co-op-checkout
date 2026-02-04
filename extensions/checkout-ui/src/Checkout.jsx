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

const CUSTOMER_CODES = [
  { code: '9050', name: 'UFP International' },
  { code: '9219', name: 'UFP Janesville' },
  { code: '9221', name: 'UFP Belchertown' },
  { code: '9223', name: 'UFP Windsor' },
  { code: '9227', name: 'UFP Saginaw' },
  { code: '9228', name: 'UFP Ranson' },
  { code: '9233', name: 'UFP Chandler' },
  { code: '9253', name: 'UFP Hamilton' },
  { code: '9294', name: 'UFP Schertz' },
  { code: '9336', name: 'UFP Lansing' },
  { code: '9378', name: 'UFP White Bear Lake' },
  { code: '9380', name: 'UFP Woodburn' },
  { code: '9381', name: 'UFP Thornton' },
  { code: '9382', name: 'UFP Riverside' },
  { code: '9436', name: 'UFP Rockwell' },
  { code: '9438', name: 'UFP Thomaston' },
  { code: '9523', name: 'UFP Bartow' },
  { code: '9527', name: 'UFP Athens' },
  { code: '9552', name: 'UFP Fairless Hills' },
  { code: 'BMSG', name: 'Sollio Groupe' },
  { code: 'BPOL', name: 'STELLA JONES' },
  { code: 'DKEX', name: 'Deck Expressions' },
  { code: 'DMRN', name: 'CDP Management - Decks Direct' },
  { code: 'GEUS', name: 'Forest Products' },
  { code: 'HAMA', name: 'Hansen Marketing' },
  { code: 'HHSL', name: 'Home Hardware' },
  { code: 'HLVM', name: 'Home Tops' },
  { code: 'LGDI', name: 'Legends' },
  { code: 'LIVB', name: 'LIV' },
  { code: 'MLLB', name: 'McLean Lumber' },
  { code: 'MVIN', name: 'Missouri Vinyl Products' },
  { code: 'PKFS', name: 'Parksite Plunkett-Webster' },
  { code: 'RULM', name: 'Russin Lumber' },
  { code: 'WAUS', name: 'Wausau Supply' },
];

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

  let paymentMethodHandles = {};
  if (shopMetafields.length > 0 && shopMetafields[0].metafield?.value) {
    try {
      paymentMethodHandles = JSON.parse(shopMetafields[0].metafield.value).paymentMethodHandles || {};
    } catch (e) {
      // paymentMethodHandles stays as empty object
    }
  }

  // Detect which payment method is selected by looking up its handle in config
  const selectedOptions = useSelectedPaymentOptions();
  let selectedPaymentType = null;
  for (const option of selectedOptions) {
    if (paymentMethodHandles[option.handle]) {
      selectedPaymentType = paymentMethodHandles[option.handle];
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
        <s-select
          label="Customer Code"
          value={customerCode}
          placeholder="Select your Customer Code"
          onChange={(e) => { setCustomerCode(/** @type {any} */ (e.currentTarget).value); setValidationError(null); }}
        >
          {CUSTOMER_CODES.map(({ code }) => (
            <s-option key={code} value={code}>{code}</s-option>
          ))}
        </s-select>
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
