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

  // Helper function to scale ingredient quantities
  const scaleIngredientItem = (item: { name: string; quantity?: string; unit?: string }, multiplier: number): string => {
    const { name, quantity, unit } = item;
    
    if (!quantity) {
      return name;
    }

    // Handle different number formats including fractions
    const scaledQuantity = quantity.replace(/(\d+(?:\s+\d+\/\d+)?|\d+\/\d+|\d+\.?\d*)/g, (match) => {
      let num: number;
      
      // Handle mixed numbers like "1 1/2"
      if (match.includes(' ') && match.includes('/')) {
        const parts = match.split(' ');
        const whole = parseInt(parts[0]);
        const [numerator, denominator] = parts[1].split('/').map(Number);
        num = whole + (numerator / denominator);
      }
      // Handle simple fractions like "1/2"
      else if (match.includes('/')) {
        const [numerator, denominator] = match.split('/').map(Number);
        num = numerator / denominator;
      }
      // Handle decimal numbers
      else {
        num = parseFloat(match);
      }
      
      const scaled = num * multiplier;
      
      // Convert back to fraction format for better readability
      if (match.includes('/')) {
        // For fractions, try to maintain fractional format when possible
        const tolerance = 0.001;
        
        // Common fractions to check
        const commonFractions = [
          { decimal: 1/4, fraction: '1/4' },
          { decimal: 1/3, fraction: '1/3' },
          { decimal: 1/2, fraction: '1/2' },
          { decimal: 2/3, fraction: '2/3' },
          { decimal: 3/4, fraction: '3/4' },
          { decimal: 1/8, fraction: '1/8' },
          { decimal: 3/8, fraction: '3/8' },
          { decimal: 5/8, fraction: '5/8' },
          { decimal: 7/8, fraction: '7/8' },
          { decimal: 1/6, fraction: '1/6' },
          { decimal: 5/6, fraction: '5/6' },
        ];
        
        // Check if scaled value is close to a common fraction
        const wholePart = Math.floor(scaled);
        const fractionalPart = scaled - wholePart;
        
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
        
        // Fall back to whole number if no fractional part
        if (scaled % 1 === 0) {
          return scaled.toString();
        }
      }
      
      // Round to 2 decimal places and remove trailing zeros
      return (scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(2).replace(/\.?0+$/, ''));
    });

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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Ingredients</h2>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPortionMultiplier(0.5)}
                    className={portionMultiplier === 0.5 ? "bg-primary text-white" : ""}
                  >
                    <Divide className="h-4 w-4 mr-1" />
                    1/2
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
                    <X className="h-4 w-4 mr-1" />
                    2
                  </Button>
                </div>
              </div>
              <div className="space-y-4">
                {Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 && (
                  typeof recipe.ingredients[0] === 'string' 
                    ? // Legacy format: array of strings
                      recipe.ingredients.map((ingredient, index) => (
                        <div key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="flex-1">{ingredient}</span>
                        </div>
                      ))
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
              <div className="space-y-4">
                {recipe.instructions.map((instruction, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <span className="bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-medium flex-shrink-0 mt-1">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-gray-700 leading-relaxed mb-2">
                        {typeof instruction === 'string' ? instruction : instruction.text}
                      </p>
                      {typeof instruction === 'object' && instruction.imageUrl && (
                        <img 
                          src={instruction.imageUrl} 
                          alt={`Step ${index + 1}`}
                          className="rounded-lg max-w-full h-auto mt-2"
                        />
                      )}
                    </div>
                  </div>
                ))}
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
