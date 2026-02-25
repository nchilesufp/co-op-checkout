import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import {
  useSelectedPaymentOptions,
  useBuyerJourneyIntercept,
  useApplyAttributeChange,
  useApplyNoteChange,
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
  const [coopRadioAnswer, setCoopRadioAnswer] = useState('');
  const [notes, setNotes] = useState('');
  const hasAttemptedProceed = useRef(false);

  // Payment method handles are configured per-store via Checkout Editor settings.
  // Falls back to hardcoded defaults if settings are not configured.
  const settings = shopify.settings.value;
  const coopHandle = String(settings.coop_payment_handle || 'custom-manual-payment-d8fbfb9b8f6ff61a1e835fd6452beaec');
  const plantHandle = String(settings.plant_payment_handle || 'custom-manual-payment-56cf4b0afa456be23003a3c1792143a1');

  // Optional Co-op radio field — only shown if the label setting is configured
  const coopRadioLabel = String(settings.coop_radio_label || '');
  const showCoopRadio = Boolean(coopRadioLabel);

  const paymentMethodHandles = {
    [coopHandle]: 'co-op',
    [plantHandle]: 'plant',
  };

  // Detect which payment method is selected by looking up its handle
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
  const applyNoteChange = useApplyNoteChange();

  // Track previous payment type to detect switches
  const prevPaymentType = useRef(selectedPaymentType);

  // Reset form fields when switching between Co-op and Plant
  useEffect(() => {
    if (prevPaymentType.current !== selectedPaymentType) {
      if (selectedPaymentType === 'co-op') {
        setPlantNumber('');
        setCoopRadioAnswer('');
      } else if (selectedPaymentType === 'plant') {
        setCustomerCode('');
        setCoopRadioAnswer('');
      }
      prevPaymentType.current = selectedPaymentType;
    }
  }, [selectedPaymentType]);

  // Validate required fields before checkout can proceed
  useBuyerJourneyIntercept(({ canBlockProgress }) => {
    if (!canBlockProgress || !selectedPaymentType) {
      return { behavior: 'allow' };
    }

    const needsCoOpCode = selectedPaymentType === 'co-op' && !customerCode.trim();
    const needsPlantNumber = selectedPaymentType === 'plant' && !plantNumber.trim();
    const needsCoOpRadio = selectedPaymentType === 'co-op' && showCoopRadio && !coopRadioAnswer;

    if (needsCoOpCode || needsPlantNumber || needsCoOpRadio) {
      // On first intercept call, block silently (no error shown on initial load)
      // On subsequent calls, show the error message
      if (!hasAttemptedProceed.current) {
        hasAttemptedProceed.current = true;
        return { behavior: 'block', reason: 'Required fields missing' };
      }

      if (needsCoOpCode) {
        return {
          behavior: 'block',
          reason: 'Missing Co-op Customer Code',
          errors: [{ message: 'Please select your Customer Code to proceed.' }],
        };
      }
      if (needsCoOpRadio) {
        return {
          behavior: 'block',
          reason: 'Missing Co-op radio answer',
          errors: [{ message: `Please answer the "${coopRadioLabel}" question to proceed.` }],
        };
      }
      if (needsPlantNumber) {
        return {
          behavior: 'block',
          reason: 'Missing Plant Number',
          errors: [{ message: 'Please enter your Plant Number to proceed.' }],
        };
      }
    }

    return { behavior: 'allow' };
  });

  // Sync form values to order attributes
  useEffect(() => {
    if (!selectedPaymentType || !instructions.attributes.canUpdateAttributes) return;

    // Format type as sentence case: "Co-op" or "Plant"
    const formattedType = selectedPaymentType === 'co-op' ? 'Co-op' : 'Plant';
    applyAttributeChange({ type: 'updateAttribute', key: 'Payment Type', value: formattedType });

    if (selectedPaymentType === 'co-op') {
      // Set Customer Code, clear Plant Number
      if (customerCode) {
        const customerEntry = CUSTOMER_CODES.find((c) => c.code === customerCode);
        const formattedCode = customerEntry ? `${customerCode} ${customerEntry.name}` : customerCode;
        applyAttributeChange({ type: 'updateAttribute', key: 'Customer Code', value: formattedCode });
      }
      applyAttributeChange({ type: 'updateAttribute', key: 'Plant Number', value: '' });

      if (showCoopRadio) {
        applyAttributeChange({ type: 'updateAttribute', key: 'Big Box Order', value: coopRadioAnswer });
      }
    }

    if (selectedPaymentType === 'plant') {
      // Set Plant Number, clear Customer Code
      if (plantNumber) {
        applyAttributeChange({ type: 'updateAttribute', key: 'Plant Number', value: plantNumber });
      }
      applyAttributeChange({ type: 'updateAttribute', key: 'Customer Code', value: '' });
    }
  }, [selectedPaymentType, customerCode, plantNumber, coopRadioAnswer]);

  // Sync notes to standard cart note (shows as "Notes from customer" on order)
  useEffect(() => {
    if (!selectedPaymentType) return;
    applyNoteChange({ type: 'updateNote', note: notes });
  }, [notes, selectedPaymentType]);

  // Clear attributes when switching away from co-op/plant
  useEffect(() => {
    if (selectedPaymentType || !instructions.attributes.canUpdateAttributes) return;

    const keysToClean = ['Payment Type', 'Customer Code', 'Plant Number', 'Big Box Order'];
    keysToClean.forEach((key) => {
      applyAttributeChange({ type: 'updateAttribute', key, value: '' });
    });
    applyNoteChange({ type: 'updateNote', note: '' });
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

      {isCoOp ? (
        <>
          <s-select
            label="Customer Code"
            value={customerCode}
            placeholder="Select your Customer Code"
            onChange={(e) => setCustomerCode(/** @type {any} */ (e.currentTarget).value)}
          >
            {CUSTOMER_CODES.map(({ code }) => (
              <s-option key={code} value={code}>{code}</s-option>
            ))}
          </s-select>

          {showCoopRadio && (
            <s-choice-list
              label={coopRadioLabel}
              values={coopRadioAnswer ? [coopRadioAnswer] : []}
              onChange={(e) => setCoopRadioAnswer(/** @type {any} */ (e.currentTarget).values?.[0] || '')}
            >
              <s-choice value="true">Yes</s-choice>
              <s-choice value="false">No</s-choice>
            </s-choice-list>
          )}
        </>
      ) : (
        <s-text-field
          label="Plant #"
          value={plantNumber}
          onInput={(e) => setPlantNumber(/** @type {any} */ (e.currentTarget).value)}
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
