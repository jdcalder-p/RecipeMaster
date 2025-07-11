import { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Star, Heart, ShoppingCart, Edit, Divide, X } from "lucide-react";
import { Recipe } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RecipeDetailModalProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditRecipe?: (recipe: Recipe) => void;
}

export function RecipeDetailModal({ recipe, open, onOpenChange, onEditRecipe }: RecipeDetailModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [portionMultiplier, setPortionMultiplier] = useState(1);

  // Reset portion multiplier when modal opens
  useEffect(() => {
    if (open) {
      setPortionMultiplier(1);
    }
  }, [open]);

  // Helper function to parse ingredient text into components
  const parseIngredientText = (text: string): { name: string; quantity?: string; unit?: string } => {
    const cleanText = text.trim();
    
    // Common units pattern
    const unitPattern = /\b(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|sprigs?|dashes?|pinches?|cans?|jars?|bottles?|bags?|boxes?|packages?|heads?|bulbs?|stalks?|bunches?)\b/i;
    
    // Try to match: quantity + unit + ingredient
    const fullPattern = /^(\d+(?:\s*\/\s*\d+)?(?:\.\d+)?(?:\s*\d+(?:\s*\/\s*\d+)?)*|\d*[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚])\s*(cups?|tbsp|tablespoons?|tsp|teaspoons?|lbs?|pounds?|oz|ounces?|g|grams?|kg|kilograms?|ml|milliliters?|l|liters?|pints?|quarts?|gallons?|cloves?|pieces?|slices?|strips?|sprigs?|dashes?|pinches?|cans?|jars?|bottles?|bags?|boxes?|packages?|heads?|bulbs?|stalks?|bunches?)\s+(.+)/i;
    
    // Try to match: quantity + ingredient (no unit)
    const quantityPattern = /^(\d+(?:\s*\/\s*\d+)?(?:\.\d+)?(?:\s*\d+(?:\s*\/\s*\d+)?)*|\d*[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚])\s+(.+)/;
    
    const fullMatch = cleanText.match(fullPattern);
    if (fullMatch) {
      return {
        quantity: fullMatch[1].trim(),
        unit: fullMatch[2].trim(),
        name: fullMatch[3].trim()
      };
    }
    
    const quantityMatch = cleanText.match(quantityPattern);
    if (quantityMatch) {
      return {
        quantity: quantityMatch[1].trim(),
        name: quantityMatch[2].trim()
      };
    }
    
    // No quantity found, return as is
    return {
      name: cleanText
    };
  };

  // Helper function to scale ingredient quantities
  const scaleIngredientItem = (item: { name: string; quantity?: string; unit?: string }, multiplier: number): string => {
    const { name, quantity, unit } = item;

    if (!quantity) {
      return name;
    }

    // Handle Unicode fractions
    const unicodeFractions: { [key: string]: number } = {
      '¼': 0.25,
      '½': 0.5, 
      '¾': 0.75,
      '⅓': 1/3,
      '⅔': 2/3,
      '⅛': 0.125,
      '⅜': 0.375,
      '⅝': 0.625,
      '⅞': 0.875,
      '⅙': 1/6,
      '⅚': 5/6
    };

    // Check for range quantities like "1 to 2", "1-2", "1 or 2"
    const rangeMatch = quantity.trim().match(/^(\d+(?:\.\d+)?(?:[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚])?(?:\/\d+)?)\s+(?:to|-|or)\s+(\d+(?:\.\d+)?(?:[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚])?(?:\/\d+)?)$/i);

    if (rangeMatch) {
      // Parse both parts of the range
      const parseQuantityPart = (part: string): number => {
        if (unicodeFractions[part]) {
          return unicodeFractions[part];
        }
        if (/\d+[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚]/.test(part)) {
          const match = part.match(/^(\d+)([¼½¾⅓⅔⅛⅜⅝⅞⅙⅚])$/);
          if (match) {
            return parseInt(match[1]) + unicodeFractions[match[2]];
          }
        }
        if (part.includes('/')) {
          const [num, denom] = part.split('/').map(Number);
          return num / denom;
        }
        return parseFloat(part);
      };

      const firstValue = parseQuantityPart(rangeMatch[1]);
      const secondValue = parseQuantityPart(rangeMatch[2]);

      // Scale both values
      const scaledFirst = firstValue * multiplier;
      const scaledSecond = secondValue * multiplier;

      // Convert both scaled values to fraction format
      const formatNumber = (num: number): string => {
        const tolerance = 0.001;
        const commonFractions = [
          { decimal: 1/4, fraction: '¼' },
          { decimal: 1/3, fraction: '⅓' },
          { decimal: 1/2, fraction: '½' },
          { decimal: 2/3, fraction: '⅔' },
          { decimal: 3/4, fraction: '¾' },
          { decimal: 1/8, fraction: '⅛' },
          { decimal: 3/8, fraction: '⅜' },
          { decimal: 5/8, fraction: '⅝' },
          { decimal: 7/8, fraction: '⅞' },
          { decimal: 1/6, fraction: '⅙' },
          { decimal: 5/6, fraction: '⅚' },
        ];

        const wholePart = Math.floor(num);
        const fractionalPart = num - wholePart;

        // Check if the entire number matches a common fraction
        for (const { decimal, fraction } of commonFractions) {
          if (Math.abs(num - decimal) < tolerance) {
            return fraction;
          }
        }

        // Check if just the fractional part matches
        for (const { decimal, fraction } of commonFractions) {
          if (Math.abs(fractionalPart - decimal) < tolerance) {
            return wholePart > 0 ? `${wholePart} ${fraction}` : fraction;
          }
        }

        // Try to convert to simple fraction
        if (fractionalPart > 0) {
          for (let denom = 2; denom <= 16; denom++) {
            const numerator = Math.round(fractionalPart * denom);
            if (Math.abs(fractionalPart - numerator / denom) < tolerance) {
              const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
              const commonDivisor = gcd(numerator, denom);
              const finalNum = numerator / commonDivisor;
              const finalDenom = denom / commonDivisor;

              if (finalDenom !== 1) {
                return wholePart > 0 ? `${wholePart} ${finalNum}/${finalDenom}` : `${finalNum}/${finalDenom}`;
              }
            }
          }
        }

        // For whole numbers
        if (num % 1 === 0) {
          return num.toString();
        }

        // As decimal if we can't convert to a nice fraction
        return num.toFixed(2).replace(/\.?0+$/, '');
      };

      const scaledQuantity = `${formatNumber(scaledFirst)} to ${formatNumber(scaledSecond)}`;
      return `${scaledQuantity}${unit ? ' ' + unit : ''} ${name}`;
    }

    // Parse the entire quantity string to extract the numeric value for non-range quantities
    let totalQuantity = 0;

    // Check if the entire quantity is a single Unicode fraction
    if (unicodeFractions[quantity.trim()]) {
      totalQuantity = unicodeFractions[quantity.trim()];
    }
    // Handle mixed Unicode fractions like "1½", "2¾", etc.
    else if (/\d+[¼½¾⅓⅔⅛⅜⅝⅞⅙⅚]/.test(quantity.trim())) {
      const match = quantity.trim().match(/^(\d+)([¼½¾⅓⅔⅛⅜⅝⅞⅙⅚])$/);
      if (match) {
        const wholePart = parseInt(match[1]);
        const fractionPart = unicodeFractions[match[2]];
        totalQuantity = wholePart + fractionPart;
      }
    }
    // Handle mixed numbers like "1 1/2"
    else if (quantity.includes(' ') && quantity.includes('/')) {
      const parts = quantity.trim().split(' ');
      const whole = parseInt(parts[0]);
      const [numerator, denominator] = parts[1].split('/').map(Number);
      totalQuantity = whole + (numerator / denominator);
    }
    // Handle simple fractions like "1/2"
    else if (quantity.includes('/')) {
      const [numerator, denominator] = quantity.split('/').map(Number);
      totalQuantity = numerator / denominator;
    }
    // Handle decimal numbers
    else {
      const match = quantity.match(/(\d+\.?\d*)/);
      if (match) {
        totalQuantity = parseFloat(match[1]);
      }
    }

    const scaled = totalQuantity * multiplier;

    // Convert scaled result back to fraction format
    const scaledQuantity = (() => {
      const tolerance = 0.001;

      // Common fractions to check - prioritize Unicode fractions for better display
      const commonFractions = [
        { decimal: 1/4, fraction: '¼' },
        { decimal: 1/3, fraction: '⅓' },
        { decimal: 1/2, fraction: '½' },
        { decimal: 2/3, fraction: '⅔' },
        { decimal: 3/4, fraction: '¾' },
        { decimal: 1/8, fraction: '⅛' },
        { decimal: 3/8, fraction: '⅜' },
        { decimal: 5/8, fraction: '⅝' },
        { decimal: 7/8, fraction: '⅞' },
        { decimal: 1/6, fraction: '⅙' },
        { decimal: 5/6, fraction: '⅚' },
      ];

      // Check if scaled value is close to a common fraction
      const wholePart = Math.floor(scaled);
      const fractionalPart = scaled - wholePart;

      // First check if the entire scaled value (including whole part) matches a common fraction
      for (const { decimal, fraction } of commonFractions) {
        if (Math.abs(scaled - decimal) < tolerance) {
          return fraction;
        }
      }

      // Then check if just the fractional part matches
      for (const { decimal, fraction } of commonFractions) {
        if (Math.abs(fractionalPart - decimal) < tolerance) {
          return wholePart > 0 ? `${wholePart} ${fraction}` : fraction;
        }
      }

      // If no common fraction matches, try to convert to simple fraction
      if (fractionalPart > 0) {
        // Try to find a simple fraction representation
        for (let denom = 2; denom <= 16; denom++) {
          const numerator = Math.round(fractionalPart * denom);
          if (Math.abs(fractionalPart - numerator / denom) < tolerance) {
            const simplifiedNum = numerator;
            const simplifiedDenom = denom;

            // Reduce the fraction
            const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
            const commonDivisor = gcd(simplifiedNum, simplifiedDenom);
            const finalNum = simplifiedNum / commonDivisor;
            const finalDenom = simplifiedDenom / commonDivisor;

            if (finalDenom !== 1) {
              return wholePart > 0 ? `${wholePart} ${finalNum}/${finalDenom}` : `${finalNum}/${finalDenom}`;
            }
          }
        }
      }

      // For whole numbers
      if (scaled % 1 === 0) {
        return scaled.toString();
      }

      // If we can't convert to a nice fraction, return as decimal but only as last resort
      return scaled.toFixed(2).replace(/\.?0+$/, '');
    })();

    return `${scaledQuantity}${unit ? ' ' + unit : ''} ${name}`;
  };

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      if (!recipe) return;
      return apiRequest("PUT", `/api/recipes/${recipe.id}`, {
        isFavorite: !recipe.isFavorite
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({
        title: recipe?.isFavorite ? "Removed from favorites" : "Added to favorites",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update favorite status",
        variant: "destructive",
      });
    },
  });

  const addToShoppingListMutation = useMutation({
    mutationFn: async () => {
      if (!recipe) return;

      // Add each ingredient as a shopping list item
      const promises = recipe.ingredients.map(ingredient => 
        apiRequest("POST", "/api/shopping-list", {
          name: ingredient,
          quantity: "1",
          category: "Other",
          isCompleted: false,
          recipeId: recipe.id
        })
      );

      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
      toast({
        title: "Added to shopping list",
        description: `${recipe?.ingredients.length} ingredients added to your shopping list`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add ingredients to shopping list",
        variant: "destructive",
      });
    },
  });

  if (!recipe) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        <div className="relative">
          <img
            src={recipe.imageUrl || 'https://images.unsplash.com/photo-1546554137-f86b9593a222?w=800&h=400&fit=crop'}
            alt={recipe.title}
            className="w-full h-64 object-cover"
          />
        </div>

        <div className="p-6">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">{recipe.title}</h1>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                onClick={() => onEditRecipe?.(recipe)}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => toggleFavoriteMutation.mutate()}
                disabled={toggleFavoriteMutation.isPending}
              >
                <Heart className={`h-4 w-4 mr-2 ${recipe.isFavorite ? 'fill-current text-red-500' : ''}`} />
                {recipe.isFavorite ? 'Saved' : 'Save'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => addToShoppingListMutation.mutate()}
                disabled={addToShoppingListMutation.isPending}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Add to List
              </Button>
            </div>
          </div>

          {recipe.description && (
            <p className="text-gray-600 mb-6">{recipe.description}</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Clock className="mx-auto h-5 w-5 text-primary mb-1" />
              <div className="font-semibold">{recipe.cookTime || "N/A"}</div>
              <div className="text-sm text-gray-600">Cook Time</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Users className="mx-auto h-5 w-5 text-primary mb-1" />
              <div className="font-semibold">{recipe.servings || "N/A"}</div>
              <div className="text-sm text-gray-600">Servings</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <Star className="mx-auto h-5 w-5 text-accent mb-1" />
              <div className="font-semibold">{recipe.rating || "N/A"}</div>
              <div className="text-sm text-gray-600">Rating</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="font-semibold">{recipe.difficulty || "Easy"}</div>
              <div className="text-sm text-gray-600">Difficulty</div>
            </div>
          </div>

          {recipe.category && (
            <div className="mb-6">
              <Badge variant="secondary">{recipe.category}</Badge>
            </div>
          )}

          {recipe.videoUrl && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Video</h3>
              <div className="aspect-video w-full rounded-lg overflow-hidden">
                {recipe.videoUrl.includes('youtube.com') || recipe.videoUrl.includes('youtu.be') ? (
                  <iframe
                    src={recipe.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                    title="Recipe video"
                    className="w-full h-full"
                    allowFullScreen
                  />
                ) : recipe.videoUrl.includes('vimeo.com') ? (
                  <iframe
                    src={recipe.videoUrl.replace('vimeo.com/', 'player.vimeo.com/video/')}
                    title="Recipe video"
                    className="w-full h-full"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={recipe.videoUrl}
                    controls
                    className="w-full h-full object-cover"
                  >
                    Your browser does not support the video tag.
                  </video>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Ingredients</h2>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPortionMultiplier(0.25)}
                    className={portionMultiplier === 0.25 ? "bg-primary text-white" : ""}
                  >
                    ¼x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPortionMultiplier(0.5)}
                    className={portionMultiplier === 0.5 ? "bg-primary text-white" : ""}
                  >
                    ½x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPortionMultiplier(1)}
                    className={portionMultiplier === 1 ? "bg-primary text-white" : ""}
                  >
                    1x
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPortionMultiplier(2)}
                    className={portionMultiplier === 2 ? "bg-primary text-white" : ""}
                  >
                    2x
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && (
                  typeof recipe.ingredients[0] === 'string' 
                    ? // Legacy format: array of strings - parse them into proper format
                      recipe.ingredients.map((ingredient, index) => {
                        const parsed = parseIngredientText(ingredient);
                        const scaled = scaleIngredientItem(parsed, portionMultiplier);
                        return (
                          <div key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="flex-1">{scaled}</span>
                          </div>
                        );
                      })
                    : // New format: array of sections with items
                      recipe.ingredients.map((section, sectionIndex) => (
                        <div key={sectionIndex}>
                          {section.sectionName && (
                            <h4 className="font-semibold text-gray-800 mb-2">{section.sectionName}</h4>
                          )}
                          <div className="space-y-2">
                            {section.items.map((item, itemIndex) => (
                              <div key={itemIndex} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-primary focus:ring-primary"
                                />
                                <span className="flex-1">{scaleIngredientItem(item, portionMultiplier)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                )}
              </div>
              {recipe.ingredients.length === 0 && (
                <p className="text-gray-500 text-sm">No ingredients listed</p>
              )}
            </div>

            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Instructions</h2>
              <div className="space-y-1">
                {recipe.instructions.map((section, sectionIndex) => {
                  let stepCounter = recipe.instructions
                    .slice(0, sectionIndex)
                    .reduce((acc, sec) => acc + (sec.steps?.length || 0), 0);

                  return (
                    <div key={sectionIndex} className="space-y-1">
                      {section.sectionName && (
                        <h3 className="text-lg font-medium text-gray-800 border-b border-gray-200 pb-1 mt-2 first:mt-0">
                          {section.sectionName}
                        </h3>
                      )}
                      <div className="space-y-1">
                        {(section.steps || []).map((step, stepIndex) => {
                          stepCounter++;
                          return (
                            <div key={stepIndex} className="flex items-start space-x-3 py-1">
                              <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-0.5">
                                {stepCounter}
                              </span>
                              <div className="flex-1">
                                <p className="text-gray-700 leading-relaxed">
                                  {typeof step === 'string' ? step : step.text}
                                </p>
                                {typeof step === 'object' && step.imageUrl && step.imageUrl !== 'data:image/svg+xml,%3Csvg%20xmlns=\'http://www.w3.org/2000/svg\'%20viewBox=\'0%200%20300%20169\'%3E%3C/svg%3E' && (
                                  <img 
                                    src={step.imageUrl} 
                                    alt={`Step ${stepCounter}`}
                                    className="rounded-lg max-w-full h-auto mt-2"
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {recipe.instructions.length === 0 && (
                <p className="text-gray-500 text-sm">No instructions provided</p>
              )}
            </div>
          </div>

          {recipe.sourceUrl && (
            <div className="mt-8 pt-6 border-t">
              <p className="text-sm text-gray-600">
                Source: <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{recipe.sourceUrl}</a>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}