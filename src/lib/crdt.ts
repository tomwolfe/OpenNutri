/**
 * CRDT Utilities for OpenNutri
 * 
 * Powered by Yjs for conflict-free replicated data types.
 * Enables multi-device synchronization without data loss.
 */

import * as Y from 'yjs';

/**
 * Creates a Yjs Doc from an object
 */
export function createYDoc(data: Record<string, any>): Y.Doc {
  const doc = new Y.Doc();
  const map = doc.getMap('data');
  
  Object.entries(data).forEach(([key, value]) => {
    map.set(key, value);
  });
  
  return doc;
}

/**
 * Encodes a Yjs Doc state as Base64 string for storage/transmission
 */
export function encodeYDoc(doc: Y.Doc): string {
  const update = Y.encodeStateAsUpdate(doc);
  return Buffer.from(update).toString('base64');
}

/**
 * Decodes a Base64 update and applies it to a Yjs Doc
 */
export function applyYUpdate(doc: Y.Doc, base64Update: string): void {
  const update = Buffer.from(base64Update, 'base64');
  Y.applyUpdate(doc, update);
}

/**
 * Merges two Yjs updates (Base64) into a single result
 */
export function mergeYUpdates(update1: string | null, update2: string | null): string | null {
  if (!update1) return update2;
  if (!update2) return update1;

  const doc = new Y.Doc();
  applyYUpdate(doc, update1);
  applyYUpdate(doc, update2);
  
  return encodeYDoc(doc);
}

/**
 * Extracts data from a Yjs update
 */
export function getYData<T = any>(base64Update: string): T {
  const doc = new Y.Doc();
  applyYUpdate(doc, base64Update);
  return doc.getMap('data').toJSON() as T;
}

/**
 * Merges server and local updates using CRDT logic
 */
export function mergeCrdt(
  localUpdate: string | null,
  serverUpdate: string | null,
  localFallback: Record<string, any>,
  serverFallback: Record<string, any>
): { mergedUpdate: string; mergedData: any } {
  const doc = new Y.Doc();
  
  // 1. Start with server state (as baseline)
  if (serverUpdate) {
    applyYUpdate(doc, serverUpdate);
  } else {
    // If no server update, seed with server fallback data
    const map = doc.getMap('data');
    Object.entries(serverFallback).forEach(([k, v]) => map.set(k, v));
  }

  // 2. Apply local state
  if (localUpdate) {
    applyYUpdate(doc, localUpdate);
  } else {
    // If no local update, apply local fallback data as local changes
    const map = doc.getMap('data');
    Object.entries(localFallback).forEach(([k, v]) => {
      // Only set if different or missing to avoid unnecessary history
      if (map.get(k) !== v) map.set(k, v);
    });
  }

  return {
    mergedUpdate: encodeYDoc(doc),
    mergedData: doc.getMap('data').toJSON()
  };
}
