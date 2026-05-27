const path = require('path');
const fs = require('fs');
const { generateInvoicePDF } = require('../src/utils/invoiceUtils');

(async () => {
  try {
    const now = new Date();
    const paymentData = {
      id: `test-${Date.now()}`,
      createdAt: now,
      totalAmount: 250.50,
      paymentMethod: 'CB',
      status: 'COMPLETED',
      registrationFee: 20,
      arabicFee: 0,
      coranScienceFee: 0,
      payerName: 'Parent Test',
      transactions: [
        { id: `tx-${Date.now()}`, createdAt: now, processedAt: now, method: 'CB', amount: 250.5, status: 'SUCCEEDED' }
      ]
    };

    const familyData = {
      user: { firstName: 'Parent', lastName: 'Test', email: 'parent@test.local' },
      familyName: 'Famille Test',
      addressLine1: '1 Rue de Test',
      addressLine2: '',
      postalCode: '75000',
      city: 'Paris',
      phonePrimary: '0102030405',
      children: [
        { id: 'c1', firstName: 'Enfant1', lastName: 'Test', dateOfBirth: new Date(2015, 4, 12) },
        { id: 'c2', firstName: 'Enfant2', lastName: 'Test', dateOfBirth: new Date(2012, 9, 3) }
      ]
    };

    const enrollmentData = [
      {
        id: 'en1',
        class: { level: { pole: { name: 'Pôle A' }, name: 'Niveau 1', code: 'N1' } },
      }
    ];

    console.log('Generating test invoice...');
    const result = await generateInvoicePDF(paymentData, familyData, enrollmentData);
    console.log('Invoice generated:', result);
  } catch (err) {
    console.error('Error generating test invoice:', err);
    process.exit(1);
  }
})();
