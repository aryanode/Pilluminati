import { firebaseConfig } from '../config.ts';
import { ApiError } from '../middleware/errorHandler.ts';

export type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { timestampValue: string }
  | { nullValue: null }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

export interface FirestoreDocument {
  name: string;
  fields?: Record<string, FirestoreValue>;
  createTime?: string;
  updateTime?: string;
}

export interface ServerTimestampMarker {
  readonly __serverTimestamp: true;
}

export const SERVER_TIMESTAMP: ServerTimestampMarker = { __serverTimestamp: true };

export function isServerTimestamp(val: unknown): val is ServerTimestampMarker {
  return Boolean(
    val &&
      typeof val === 'object' &&
      (val as ServerTimestampMarker).__serverTimestamp === true,
  );
}

const DOC_ROOT = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
const REST_BASE = `https://firestore.googleapis.com/v1/${DOC_ROOT}`;

export function buildDocName(collection: string, docId: string): string {
  return `${DOC_ROOT}/${collection}/${docId}`;
}

export function encodeFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: String(val) };
    }
    return { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((item) => encodeFirestoreValue(item)),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v === undefined || isServerTimestamp(v)) continue;
      fields[k] = encodeFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function encodeDocumentFields(data: Record<string, unknown>): {
  fields: Record<string, FirestoreValue>;
  serverTimestampFields: string[];
} {
  const fields: Record<string, FirestoreValue> = {};
  const serverTimestampFields: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (isServerTimestamp(value)) {
      serverTimestampFields.push(key);
      continue;
    }
    fields[key] = encodeFirestoreValue(value);
  }

  return { fields, serverTimestampFields };
}

export function decodeFirestoreValue(val: FirestoreValue): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const out: Record<string, unknown> = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return null;
}

export function decodeDocument<T = Record<string, unknown>>(
  doc: FirestoreDocument,
): T & { id: string } {
  const out: Record<string, unknown> = {};
  if (doc.fields) {
    for (const [k, v] of Object.entries(doc.fields)) {
      out[k] = decodeFirestoreValue(v);
    }
  }
  const id = doc.name.split('/').pop() || String(out.id || '');
  out.id = id;
  return out as T & { id: string };
}

async function mapFirestoreError(resp: Response, pathContext: string): Promise<never> {
  let msg = `Firestore error (${resp.status}) on ${pathContext}`;
  try {
    const body = (await resp.json()) as { error?: { message?: string; status?: string } };
    if (body.error?.message) {
      msg = body.error.message;
    }
  } catch {
    // ignore parse failure
  }

  if (resp.status === 401) {
    throw new ApiError(401, 'AUTH_EXPIRED', 'Session expired. Please sign in again.');
  }
  if (resp.status === 403) {
    throw new ApiError(403, 'FORBIDDEN', msg);
  }
  if (resp.status === 404) {
    throw new ApiError(404, 'NOT_FOUND', `Record not found at ${pathContext}.`);
  }
  if (resp.status === 409) {
    throw new ApiError(409, 'CONFLICT', msg);
  }
  if (resp.status === 400) {
    throw new ApiError(400, 'FIRESTORE_VALIDATION_ERROR', msg);
  }
  throw new ApiError(502, 'FIRESTORE_UNAVAILABLE', msg);
}

function authHeaders(idToken?: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }
  return headers;
}

export async function getFirestoreDoc<T = Record<string, unknown>>(
  collection: string,
  docId: string,
  idToken?: string,
): Promise<(T & { id: string }) | null> {
  const url = `${REST_BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: authHeaders(idToken),
  });
  if (resp.status === 404) return null;
  if (!resp.ok) {
    await mapFirestoreError(resp, `${collection}/${docId}`);
  }
  const doc = (await resp.json()) as FirestoreDocument;
  return decodeDocument<T>(doc);
}

export interface QueryFilter {
  field: string;
  op: 'EQUAL' | 'ARRAY_CONTAINS';
  value: unknown;
}

export async function queryFirestoreCollection<T = Record<string, unknown>>(
  collection: string,
  filters: QueryFilter[],
  idToken: string,
  limit = 100,
): Promise<Array<T & { id: string }>> {
  const fieldFilters = filters.map((f) => ({
    fieldFilter: {
      field: { fieldPath: f.field },
      op: f.op,
      value: encodeFirestoreValue(f.value),
    },
  }));

  const where =
    fieldFilters.length === 1
      ? fieldFilters[0]
      : fieldFilters.length > 1
        ? { compositeFilter: { op: 'AND', filters: fieldFilters } }
        : undefined;

  const resp = await fetch(`${REST_BASE}:runQuery`, {
    method: 'POST',
    headers: authHeaders(idToken),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        ...(where ? { where } : {}),
        limit,
      },
    }),
  });

  if (!resp.ok) {
    await mapFirestoreError(resp, collection);
  }

  const rows = (await resp.json()) as Array<{ document?: FirestoreDocument }>;
  return rows
    .filter((r): r is { document: FirestoreDocument } => Boolean(r.document))
    .map((r) => decodeDocument<T>(r.document));
}

export interface CommitWriteOperation {
  type: 'create' | 'update' | 'delete';
  collection: string;
  docId: string;
  data?: Record<string, unknown>;
}

export async function commitFirestoreWrites(
  operations: CommitWriteOperation[],
  idToken: string,
): Promise<void> {
  if (operations.length === 0) return;

  const writes = operations.map((op) => {
    const name = buildDocName(op.collection, op.docId);
    if (op.type === 'delete') {
      return { delete: name };
    }

    const { fields, serverTimestampFields } = encodeDocumentFields(op.data || {});
    const updateTransforms = serverTimestampFields.map((fieldPath) => ({
      fieldPath,
      setToServerValue: 'REQUEST_TIME',
    }));

    if (op.type === 'create') {
      return {
        update: { name, fields },
        ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
        currentDocument: { exists: false },
      };
    }

    const fieldPaths = Object.keys(fields);
    return {
      update: { name, fields },
      updateMask: { fieldPaths },
      ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
      currentDocument: { exists: true },
    };
  });

  const resp = await fetch(`${REST_BASE}:commit`, {
    method: 'POST',
    headers: authHeaders(idToken),
    body: JSON.stringify({ writes }),
  });

  if (!resp.ok) {
    await mapFirestoreError(
      resp,
      operations.map((o) => `${o.collection}/${o.docId}`).join(','),
    );
  }
}
