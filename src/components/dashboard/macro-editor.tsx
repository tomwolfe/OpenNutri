'use client';

import { useCallback } from 'react';
import { X, Edit2, Loader2, Save } from 'lucide-react';
import { DraftItem, MEAL_TYPES, MealType } from '@/types/food';

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
}: MacroEditorProps) {
  const updateItemField = useCallback((index: number, field: keyof DraftItem, value: number | string) => {
    const newItems = items.map((item, i) => {
      if (i !== index) return item;

      if (field === 'calories') {
        const ratio = Number(value) / (item.calories || 1);
        return {
          ...item,
          calories: Number(value),
          protein: item.protein * ratio,
          carbs: item.carbs * ratio,
          fat: item.fat * ratio,
        };
      }

      return { ...item, [field]: value };
    });
    onUpdateItems(newItems);
  }, [items, onUpdateItems]);

  const calculatedTotal = items.reduce((sum, item) => sum + item.calories, 0);

  return (
    <div className="space-y-4">
      {/* Meal type selector */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Meal Type
        </label>
        <select
          value={selectedMealType}
          onChange={(e) => onUpdateMealType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          {MEAL_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      {/* Detected items with editing */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-900">
            Food Items ({items.length})
          </h4>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onToggleEditing}
              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Edit2 className="w-3 h-3" />
              {isEditing ? 'Done' : 'Edit'}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={onAddItem}
                className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
              >
                + Add Item
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {items.map((item, index) => (
            <div
              key={index}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {item.foodName}
                  </p>
                  {item.isEnhancing && (
                    <span className="text-xs text-blue-600 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Matching USDA...
                    </span>
                  )}
                </div>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-gray-600">Food Name</label>
                    <input
                      type="text"
                      value={item.foodName}
                      onChange={(e) => updateItemField(index, 'foodName', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">Calories</label>
                    <input
                      type="number"
                      value={item.calories}
                      onChange={(e) => updateItemField(index, 'calories', e.target.value)}
                      className="w-full px-2 py-1 text-sm border rounded"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-gray-600">Protein (g)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={item.protein.toFixed(1)}
                        onChange={(e) =>
                          updateItemField(index, 'protein', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Carbs (g)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={item.carbs.toFixed(1)}
                        onChange={(e) =>
                          updateItemField(index, 'carbs', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">Fat (g)</label>
                      <input
                        type="number"
                        step="0.1"
                        value={item.fat.toFixed(1)}
                        onChange={(e) =>
                          updateItemField(index, 'fat', parseFloat(e.target.value) || 0)
                        }
                        className="w-full px-2 py-1 text-sm border rounded"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500">
                  {item.calories} cal • P: {item.protein.toFixed(1)}g • C:{' '}
                  {item.carbs.toFixed(1)}g • F: {item.fat.toFixed(1)}g
                </p>
              )}

              <span className="inline-block mt-2 text-xs px-2 py-1 bg-gray-200 rounded">
                {item.source.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Total and save button */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-medium text-blue-900">Total Calories:</span>
          <span className="text-lg font-bold text-blue-900">
            {calculatedTotal.toFixed(0)} cal
          </span>
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saveInProgress}
          className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saveInProgress ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save to Log
            </>
          )}
        </button>
      </div>
    </div>
  );
}
