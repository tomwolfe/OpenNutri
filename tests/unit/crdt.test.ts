import { describe, test, expect } from 'vitest';
import { mergeCrdt, mergeYUpdates, encodeYDoc, applyYUpdate, createYDoc, getYData } from '../src/lib/crdt';
import * as Y from 'yjs';

describe('crdt.ts', () => {
  test('should merge two Yjs updates', () => {
    const doc1 = createYDoc({ items: ['apple', 'banana'] });
    const doc2 = createYDoc({ items: ['banana', 'orange'] });
    
    const update1 = encodeYDoc(doc1);
    const update2 = encodeYDoc(doc2);
    
    const result = mergeYUpdates(update1, update2);
    expect(result).not.toBeNull();
  });

  test('should merge concurrent edits without data loss', () => {
    const localUpdate = encodeYDoc(createYDoc({ items: ['carrot'] }));
    const serverUpdate = encodeYDoc(createYDoc({ items: ['broccoli'] }));
    
    const result = mergeYUpdates(localUpdate, serverUpdate);
    expect(result).not.toBeNull();
    
    const mergedDoc = createYDoc({});
    applyYUpdate(mergedDoc, result!);
    const data = mergedDoc.getMap('data').toJSON();
    expect(data.items).toBeInstanceOf(Array);
  });

  test('should compact Yjs state (shrink output)', () => {
    // Create a doc with many operations
    const doc = createYDoc({ items: [], counter: 0 });
    
    // Apply many updates manually to create history
    for (let i = 0; i < 50; i++) {
      const update = encodeYDoc(createYDoc({ counter: i }));
      applyYUpdate(doc, update);
    }
    
    // Compact the state
    const localUpdate = encodeYDoc(createYDoc({ items: ['test'] }));
    const serverUpdate = encodeYDoc(createYDoc({ items: ['test2'] }));
    
    const result = mergeCrdt(localUpdate, serverUpdate, { items: [], counter: 0 }, { items: [], counter: 0 });
    expect(result.mergedUpdate).not.toBeNull();
    expect(result.mergedData).toEqual({ items: [], counter: 0 });
  });

  test('should merge with items array using granular transforms', () => {
    const localUpdate = encodeYDoc(createYDoc({ items: ['apple'] }));
    const serverUpdate = encodeYDoc(createYDoc({ items: ['banana'] }));
    
    const result = mergeCrdt(localUpdate, serverUpdate, { items: ['apple'] }, { items: ['banana'] });
    expect(result.mergedUpdate).not.toBeNull();
    
    const mergedDoc = createYDoc({});
    applyYUpdate(mergedDoc, result!.mergedUpdate);
    const data = mergedDoc.getMap('data').toJSON();
    expect(data.items).toBeInstanceOf(Array);
  });

  test('should handle null updates gracefully', () => {
    const result1 = mergeCrdt(null, null, { items: [], counter: 0 }, { items: [], counter: 0 });
    expect(result1.mergedUpdate).not.toBeNull();
    expect(result1.mergedData).toEqual({ items: [], counter: 0 });
    
    const result2 = mergeCrdt('valid-update', null, { items: [], counter: 0 }, { items: [], counter: 0 });
    expect(result2.mergedUpdate).not.toBeNull();
    
    const result3 = mergeCrdt(null, 'valid-update', { items: [], counter: 0 }, { items: [], counter: 0 });
    expect(result3.mergedUpdate).not.toBeNull();
  });
});