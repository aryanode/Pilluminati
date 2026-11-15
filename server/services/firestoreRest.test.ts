import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeDocument,
  encodeDocumentFields,
  SERVER_TIMESTAMP,
} from './firestoreRest.ts';

test('encodeDocumentFields separates SERVER_TIMESTAMP from typed Firestore values', () => {
  const { fields, serverTimestampFields } = encodeDocumentFields({
    id: 'med_123',
    supplyDays: 30,
    active: true,
    authorizedUids: ['u1', 'u2'],
    expiresAt: new Date('2026-11-16T00:00:00.000Z'),
    createdAt: SERVER_TIMESTAMP,
    updatedAt: SERVER_TIMESTAMP,
  });

  assert.deepEqual(serverTimestampFields, ['createdAt', 'updatedAt']);
  assert.deepEqual(fields.id, { stringValue: 'med_123' });
  assert.deepEqual(fields.supplyDays, { integerValue: '30' });
  assert.deepEqual(fields.active, { booleanValue: true });
  assert.deepEqual(fields.expiresAt, { timestampValue: '2026-11-16T00:00:00.000Z' });
  assert.equal('createdAt' in fields, false);
});

test('decodeDocument decodes Firestore REST document fields cleanly', () => {
  const decoded = decodeDocument<{ name: string; supplyDays: number; active: boolean }>({
    name: 'projects/p/databases/d/documents/medications/med_abc',
    fields: {
      name: { stringValue: 'Lisinopril' },
      supplyDays: { integerValue: '30' },
      active: { booleanValue: true },
    },
  });

  assert.equal(decoded.id, 'med_abc');
  assert.equal(decoded.name, 'Lisinopril');
  assert.equal(decoded.supplyDays, 30);
  assert.equal(decoded.active, true);
});
