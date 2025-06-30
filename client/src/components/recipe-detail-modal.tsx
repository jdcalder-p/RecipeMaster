import { useState } from "react";
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

  // Helper function to scale ingredient quantities
  const scaleIngredient = (ingredient: string, multiplier: number): string => {
    // Extract numbers from ingredient strings using regex
    const numberPattern = /(\d+\.?\d*|\d*\.?\d+)/g;
    return ingredient.replace(numberPattern, (match) => {
      const num = parseFloat(match);
      const scaled = num * multiplier;
      // Round to 2 decimal places and remove trailing zeros
      return (scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(2).replace(/\.?0+$/, ''));
    });
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
              <div className="space-y-2">
                {recipe.ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="flex-1">{scaleIngredient(ingredient, portionMultiplier)}</span>
                  </div>
                ))}
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
                    <p className="text-gray-700 leading-relaxed">{instruction}</p>
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
