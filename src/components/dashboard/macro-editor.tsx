'use client';

import { useCallback, useState } from 'react';
import { X, Edit2, Loader2, Save, ChevronDown, Check, AlertCircle } from 'lucide-react';
import { DraftItem, MEAL_TYPES } from '@/types/food';
import { cn } from '@/lib/utils';

interface MacroEditorProps {
  items: DraftItem[];
  selectedMealType: string;
  isEditing: boolean;
  saveInProgress: boolean;
  onUpdateItems: (items: DraftItem[]) => void;
  onUpdateMealType: (mealType: string) => void;
  onToggleEditing: () => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onSave: () => void;
  isReadOnly?: boolean;
}

export function MacroEditor({
  items,
  selectedMealType,
  isEditing,
  saveInProgress,
  onUpdateItems,
  onUpdateMealType,
  onToggleEditing,
  onAddItem,
  onRemoveItem,
  onSave,
  isReadOnly = false,
}: MacroEditorProps) {
  const [openAlternatives, setOpenAlternatives] = useState<number | null>(null);

  const updateItemField = useCallback((index: number, field: keyof DraftItem, value: string | number) => {
    const newItems = items.map((item, i) => {
      if (i !== index) return item;

      if (field === 'calories') {
        const val = Number(value);
        const oldCal = item.calories || 1;
        const ratio = val / oldCal;
        return {
          ...item,
          calories: val,
          protein: item.protein * ratio,
          carbs: item.carbs * ratio,
          fat: item.fat * ratio,
        };
      }

      if (field === 'servingGrams') {
        const val = Number(value);
        const oldGrams = item.servingGrams || 100;
        const ratio = val / oldGrams;
        return {
          ...item,
          servingGrams: val,
          calories: item.calories * ratio,
          protein: item.protein * ratio,
          carbs: item.carbs * ratio,
          fat: item.fat * ratio,
        };
      }

      return { ...item, [field]: value };
    });
    onUpdateItems(newItems);
  }, [items, onUpdateItems]);

  const selectAlternative = (itemIndex: number, alt: NonNullable<DraftItem['alternatives']>[number]) => {
    const newItems = [...items];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      foodName: alt.description,
      calories: alt.calories,
      protein: alt.protein,
      carbs: alt.carbs,
      fat: alt.fat,
      source: 'USDA',
      usdaMatch: {
        fdcId: alt.fdcId,
        description: alt.description,
        similarity: alt.similarity,
      },
    };
    onUpdateItems(newItems);
    setOpenAlternatives(null);
  };

  const calculatedTotal = items.reduce((sum, item) => sum + (item.calories || 0), 0);

  return (
    <div className="space-y-4">
      {/* Meal type selector */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Meal Type
        </label>
        <select
          value={selectedMealType}
          onChange={(e) => onUpdateMealType(e.target.value)}
          disabled={isReadOnly || saveInProgress}
          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        >
          {MEAL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Detected items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Detected Foods ({items.length})
          </h4>
          {!isReadOnly && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onToggleEditing}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <Edit2 className="w-3 h-3" />
                {isEditing ? 'Done' : 'Edit'}
              </button>
              {isEditing && (
                <button
                  type="button"
                  onClick={onAddItem}
                  className="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1"
                >
                  + Add
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
          {items.map((item, index) => {
            const isLowConfidence = item.usdaMatch?.similarity && item.usdaMatch.similarity < 0.7;
            const hasAlternatives = item.alternatives && item.alternatives.length > 0;

            return (
              <div
                key={index}
                className={cn(
                  "p-3 rounded-lg border transition-all",
                  isLowConfidence ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200",
                  isReadOnly && "opacity-80"
                )}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {item.foodName}
                      </p>
                      {item.isEnhancing && (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                      )}
                    </div>
                    {isLowConfidence && !isEditing && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-amber-700 font-medium">
                        <AlertCircle className="w-3 h-3" />
                        <span>Low confidence match ({Math.round(item.usdaMatch!.similarity! * 100)}%)</span>
                      </div>
                    )}
                  </div>
                  {isEditing && !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveItem(index)}
                      className="text-red-500 hover:text-red-700 ml-2"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-3 mt-2">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-gray-400">Food Name</label>
                      <input
                        type="text"
                        value={item.foodName}
                        onChange={(e) => updateItemField(index, 'foodName', e.target.value)}
                        className="w-full px-2 py-1.5 text-sm border rounded bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 mt-2">
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400">Grams</label>
                        <input
                          type="number"
                          value={Math.round(item.servingGrams || 100)}
                          onChange={(e) => updateItemField(index, 'servingGrams', parseInt(e.target.value) || 0)}
                          className="w-full px-1.5 py-1 text-xs border rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400">Cals</label>
                        <input
                          type="number"
                          value={Math.round(item.calories)}
                          onChange={(e) => updateItemField(index, 'calories', parseInt(e.target.value) || 0)}
                          className="w-full px-1.5 py-1 text-xs border rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400">P (g)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={item.protein.toFixed(1)}
                          onChange={(e) => updateItemField(index, 'protein', parseFloat(e.target.value) || 0)}
                          className="w-full px-1.5 py-1 text-xs border rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400">C (g)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={item.carbs.toFixed(1)}
                          onChange={(e) => updateItemField(index, 'carbs', parseFloat(e.target.value) || 0)}
                          className="w-full px-1.5 py-1 text-xs border rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] uppercase font-bold text-gray-400">F (g)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={item.fat.toFixed(1)}
                          onChange={(e) => updateItemField(index, 'fat', parseFloat(e.target.value) || 0)}
                          className="w-full px-1.5 py-1 text-xs border rounded bg-white"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-600 font-medium">
                      {Math.round(item.calories)} cal • P: {item.protein.toFixed(1)}g • C:{' '}
                      {item.carbs.toFixed(1)}g • F: {item.fat.toFixed(1)}g
                    </p>
                    
                    {hasAlternatives && !isReadOnly && (
                      <div className="relative mt-2">
                        <button
                          type="button"
                          onClick={() => setOpenAlternatives(openAlternatives === index ? null : index)}
                          className="flex items-center gap-1 text-[11px] text-blue-600 font-bold hover:text-blue-800 transition-colors"
                        >
                          <span>Did you mean...?</span>
                          <ChevronDown className={cn("w-3 h-3 transition-transform duration-200", openAlternatives === index && "rotate-180")} />
                        </button>
                        
                        {openAlternatives === index && (
                          <div className="absolute z-20 left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto py-1 ring-1 ring-black ring-opacity-5">
                            <div className="px-3 py-1.5 border-b bg-gray-50">
                              <span className="text-[10px] font-bold text-gray-400 uppercase">Select Match</span>
                            </div>
                            {item.alternatives?.map((alt) => (
                              <button
                                key={alt.fdcId}
                                onClick={() => selectAlternative(index, alt)}
                                className="w-full px-3 py-2.5 text-left text-xs hover:bg-blue-50 flex flex-col gap-0.5 border-b border-gray-50 last:border-0"
                              >
                                <span className="font-bold text-gray-900 leading-tight">{alt.description}</span>
                                <div className="flex justify-between items-center mt-0.5">
                                  <span className="text-[10px] text-gray-500">
                                    {alt.calories} cal • {Math.round(alt.similarity * 100)}% match
                                  </span>
                                  {item.usdaMatch?.fdcId === alt.fdcId && (
                                    <Check className="w-3 h-3 text-green-600" />
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Total and save button */}
      {!isReadOnly && (
        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-bold text-blue-900 uppercase tracking-wider">Estimated Total</span>
            <span className="text-xl font-black text-blue-900">
              {calculatedTotal.toFixed(0)} <span className="text-xs font-medium">cal</span>
            </span>
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={saveInProgress || items.length === 0}
            className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all active:scale-[0.98] font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
          >
            {saveInProgress ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Log this Meal
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
