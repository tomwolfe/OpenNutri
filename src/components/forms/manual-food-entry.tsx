'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useEncryption } from '@/hooks/useEncryption';
import { LogItem } from '@/stores/use-nutrition-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Search, Plus, Trash2 } from 'lucide-react';

interface USDAFood {
  fdcId: number;
  description: string;
  dataType: string;
  servingSize?: number;
  servingSizeUnit?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface SelectedFood {
  food: USDAFood;
  servingGrams: number;
}

interface ManualFoodEntryFormProps {
  mealType: string;
  onEntryComplete?: () => void;
}

export function ManualFoodEntryForm({ mealType, onEntryComplete }: ManualFoodEntryFormProps) {
  const { data: session } = useSession();
  const { encryptLog, isReady } = useEncryption();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<USDAFood[]>([]);
  const [selectedFoods, setSelectedFoods] = useState<SelectedFood[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        setError('');
        fetch(`/api/food/usda?query=${encodeURIComponent(searchQuery)}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.error) {
              setError(data.error);
              setSearchResults([]);
            } else {
              setSearchResults(data.foods.slice(0, 10));
            }
          })
          .catch(() => {
            setError('Failed to search. Please try again.');
          })
          .finally(() => {
            setIsSearching(false);
          });
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addFood = (food: USDAFood) => {
    const defaultServing = food.servingSize || 100;
    setSelectedFoods([...selectedFoods, { food, servingGrams: defaultServing }]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeFood = (index: number) => {
    setSelectedFoods(selectedFoods.filter((_, i) => i !== index));
  };

  const updateServing = (index: number, grams: number) => {
    const updated = [...selectedFoods];
    updated[index].servingGrams = grams;
    setSelectedFoods(updated);
  };

  const calculateTotals = () => {
    return selectedFoods.reduce(
      (totals, { food, servingGrams }) => {
        const multiplier = servingGrams / 100;
        return {
          calories: totals.calories + Math.round(food.calories * multiplier),
          protein: totals.protein + Math.round(food.protein * multiplier * 10) / 10,
          carbs: totals.carbs + Math.round(food.carbs * multiplier * 10) / 10,
          fat: totals.fat + Math.round(food.fat * multiplier * 10) / 10,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  };

  const handleSubmit = async () => {
    if (!session?.user?.id || selectedFoods.length === 0) return;

    setIsSubmitting(true);
    setError('');

    try {
      const totals = calculateTotals();
      const items = selectedFoods.map(({ food, servingGrams }) => ({
        foodName: food.description,
        servingGrams,
        calories: Math.round(food.calories * (servingGrams / 100)),
        protein: Math.round(food.protein * (servingGrams / 100) * 10) / 10,
        carbs: Math.round(food.carbs * (servingGrams / 100) * 10) / 10,
        fat: Math.round(food.fat * (servingGrams / 100) * 10) / 10,
        source: 'USDA' as const,
      }));

      // E2E Encryption: Encrypt the items array before sending
      let encryptedData = null;
      let encryptionIv = null;

      if (isReady) {
        try {
          // Encrypt the entire items array as a JSON string
          const encryptionResult = await encryptLog(items as unknown as LogItem[]);
          encryptedData = encryptionResult.encryptedData;
          encryptionIv = encryptionResult.iv;
        } catch (err) {
          console.error('Encryption failed, saving in plaintext...', err);
        }
      }
      
      const response = await fetch('/api/log/food', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealType,
          items,
          totalCalories: totals.calories,
          encryptedData,
          encryptionIv,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save food log');
      }

      setSelectedFoods([]);
      onEntryComplete?.();
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const totals = calculateTotals();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Food Manually</CardTitle>
        <CardDescription>
          Search USDA database and add foods to your {mealType}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search foods (e.g., apple, chicken breast)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 animate-spin -translate-y-1/2" />
          )}
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Food</TableHead>
                  <TableHead className="w-24">Cal/100g</TableHead>
                  <TableHead className="w-20">Add</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map((food) => (
                  <TableRow key={food.fdcId}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{food.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {food.dataType}
                          {food.servingSize && ` • ${food.servingSize}${food.servingSizeUnit} serving`}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{Math.round(food.calories)}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => addFood(food)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Selected Foods */}
        {selectedFoods.length > 0 && (
          <div className="space-y-2">
            <Label>Selected Foods</Label>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Food</TableHead>
                    <TableHead className="w-32">Serving (g)</TableHead>
                    <TableHead className="w-24">Calories</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedFoods.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="text-sm">{item.food.description}</div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.servingGrams}
                          onChange={(e) =>
                            updateServing(index, parseInt(e.target.value) || 0)
                          }
                          className="h-8 w-24"
                        />
                      </TableCell>
                      <TableCell>
                        {Math.round(
                          item.food.calories * (item.servingGrams / 100)
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFood(index)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end gap-4 rounded-md bg-muted p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Calories:</span>{' '}
                <span className="font-medium">{totals.calories}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Protein:</span>{' '}
                <span className="font-medium">{totals.protein}g</span>
              </div>
              <div>
                <span className="text-muted-foreground">Carbs:</span>{' '}
                <span className="font-medium">{totals.carbs}g</span>
              </div>
              <div>
                <span className="text-muted-foreground">Fat:</span>{' '}
                <span className="font-medium">{totals.fat}g</span>
              </div>
            </div>

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedFoods.length === 0}
              className="w-full"
            >
              {isSubmitting ? 'Saving...' : `Add to ${mealType}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
