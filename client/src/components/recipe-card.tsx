import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, Star, Heart, Calendar } from "lucide-react";
import { Recipe } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface RecipeCardProps {
  recipe: Recipe;
  onViewRecipe: (recipe: Recipe) => void;
}

export function RecipeCard({ recipe, onViewRecipe }: RecipeCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PUT", `/api/recipes/${recipe.id}`, {
        isFavorite: !recipe.isFavorite
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({
        title: recipe.isFavorite ? "Removed from favorites" : "Added to favorites",
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

  const addToMealPlanMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      return apiRequest("POST", "/api/meal-plans", {
        date: today,
        mealType: "dinner",
        recipeId: parseInt(recipe.id)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meal-plans'] });
      toast({
        title: "Added to meal plan",
        description: `${recipe.title} has been added to today's dinner`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add to meal plan",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="relative">
        <img
          src={recipe.imageUrl || 'https://images.unsplash.com/photo-1546554137-f86b9593a222?w=400&h=250&fit=crop'}
          alt={recipe.title}
          className="w-full h-48 object-cover rounded-t-lg"
        />
        <Button
          variant="ghost"
          size="sm"
          className={`absolute top-2 right-2 h-8 w-8 p-0 bg-white/80 hover:bg-white ${
            recipe.isFavorite ? 'text-red-500' : 'text-gray-600'
          }`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavoriteMutation.mutate();
          }}
          disabled={toggleFavoriteMutation.isPending}
        >
          <Heart className={`h-4 w-4 ${recipe.isFavorite ? 'fill-current' : ''}`} />
        </Button>
      </div>
      
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg text-gray-900 line-clamp-1">{recipe.title}</h3>
        </div>
        
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">
          {recipe.description || "A delicious recipe waiting to be prepared."}
        </p>
        
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <span className="flex items-center">
            <Clock className="h-3 w-3 mr-1" />
            {recipe.cookTime || "N/A"}
          </span>
          <span className="flex items-center">
            <Users className="h-3 w-3 mr-1" />
            {recipe.servings ? `${recipe.servings} servings` : "N/A"}
          </span>
          <span className="flex items-center">
            <Star className="h-3 w-3 mr-1 text-accent" />
            {recipe.rating || "N/A"}
          </span>
        </div>
        
        {recipe.category && (
          <Badge variant="secondary" className="mb-3">
            {recipe.category}
          </Badge>
        )}
        
        <div className="flex items-center space-x-2">
          <Button
            className="flex-1"
            onClick={() => onViewRecipe(recipe)}
          >
            View Recipe
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addToMealPlanMutation.mutate()}
            disabled={addToMealPlanMutation.isPending}
          >
            <Calendar className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
