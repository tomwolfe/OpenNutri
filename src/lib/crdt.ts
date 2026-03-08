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
export function createYDoc(data: Record<string, unknown>): Y.Doc {
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
  let binary = '';
  const len = update.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(update[i]);
  }
  return typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(update).toString('base64');
}

/**
 * Decodes a Base64 update and applies it to a Yjs Doc
 */
export function applyYUpdate(doc: Y.Doc, base64Update: string): void {
  const binaryString = typeof atob !== 'undefined' ? atob(base64Update) : Buffer.from(base64Update, 'base64').toString('binary');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  Y.applyUpdate(doc, bytes);
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
export function getYData<T = unknown>(base64Update: string): T {
  const doc = new Y.Doc();
  applyYUpdate(doc, base64Update);
  return doc.getMap('data').toJSON() as T;
}

/**
 * Merges server and local updates using CRDT logic
 * Supports nested Y.Array for 'items' to prevent array-overwrite conflicts
 */
export function mergeCrdt(
  localUpdate: string | null,
  serverUpdate: string | null,
  localFallback: Record<string, unknown>,
  serverFallback: Record<string, unknown>
): { mergedUpdate: string; mergedData: unknown } {
  const doc = new Y.Doc();
  const map = doc.getMap('data');
  
  // 1. Start with server state (as baseline)
  if (serverUpdate) {
    applyYUpdate(doc, serverUpdate);
  } else {
    // If no server update, seed with server fallback data
    Object.entries(serverFallback).forEach(([k, v]) => {
      if (k === 'items' && Array.isArray(v)) {
        const yArray = new Y.Array();
        yArray.insert(0, v);
        map.set(k, yArray);
      } else {
        map.set(k, v);
      }
    });
  }

  // 2. Apply local state
  if (localUpdate) {
    applyYUpdate(doc, localUpdate);
  } else {
    // If no local update, apply local fallback data as local changes
    Object.entries(localFallback).forEach(([k, v]) => {
      // Handle special case for items array to use Y.Array fragments
      if (k === 'items' && Array.isArray(v)) {
        let yArray = map.get(k);
        if (!(yArray instanceof Y.Array)) {
          yArray = new Y.Array();
          map.set(k, yArray);
        }
        
        // Very simple diffing: if lengths match and items look similar, don't re-insert
        // In a real app, we'd use IDs for items to merge accurately.
        const currentItems = (yArray as Y.Array<unknown>).toArray();
        if (JSON.stringify(currentItems) !== JSON.stringify(v)) {
          (yArray as Y.Array<unknown>).delete(0, (yArray as Y.Array<unknown>).length);
          (yArray as Y.Array<unknown>).insert(0, v);
        }
      } else if (map.get(k) !== v) {
        map.set(k, v);
      }
    });
  }

  return {
    mergedUpdate: encodeYDoc(doc),
    mergedData: doc.getMap('data').toJSON()
  };
}
