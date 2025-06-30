import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMealPlan } from "@/hooks/use-meal-plan";
import { useRecipes } from "@/hooks/use-recipes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, addWeeks, startOfWeek, addDays } from "date-fns";

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;

export function MealPlanning() {
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const weekStart = format(currentWeek, 'yyyy-MM-dd');
  const weekEnd = format(addDays(currentWeek, 6), 'yyyy-MM-dd');

  const { data: mealPlans = [] } = useMealPlan(weekStart, weekEnd);
  const { data: recipes = [] } = useRecipes();

  const generateShoppingListMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/shopping-list/generate", {
        startDate: weekStart,
        endDate: weekEnd
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
      toast({
        title: "Shopping list generated",
        description: "Your shopping list has been updated with ingredients from this week's meal plan",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate shopping list",
        variant: "destructive",
      });
    },
  });

  const addMealPlanMutation = useMutation({
    mutationFn: async ({ date, mealType, recipeId }: { date: string, mealType: string, recipeId: number }) => {
      return apiRequest("POST", "/api/meal-plans", {
        date,
        mealType,
        recipeId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meal-plans'] });
      toast({
        title: "Meal added to plan",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add meal to plan",
        variant: "destructive",
      });
    },
  });

  const getMealForSlot = (date: string, mealType: string) => {
    const meal = mealPlans.find(mp => mp.date === date && mp.mealType === mealType);
    if (!meal) return null;
    
    const recipe = recipes.find(r => r.id === meal.recipeId?.toString());
    return recipe;
  };

  const getWeekStats = () => {
    const plannedMeals = mealPlans.length;
    const totalCookTime = mealPlans.reduce((total, meal) => {
      const recipe = recipes.find(r => r.id === meal.recipeId?.toString());
      if (recipe?.cookTime) {
        const minutes = parseInt(recipe.cookTime.replace(/\D/g, '')) || 0;
        return total + minutes;
      }
      return total;
    }, 0);
    const avgCookTime = plannedMeals > 0 ? Math.round(totalCookTime / plannedMeals) : 0;
    const totalServings = mealPlans.reduce((total, meal) => {
      const recipe = recipes.find(r => r.id === meal.recipeId?.toString());
      return total + (recipe?.servings || 0);
    }, 0);

    return { plannedMeals, avgCookTime, totalServings };
  };

  const stats = getWeekStats();

  const previousWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, -1));
  };

  const nextWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, 1));
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Meal Planning</h2>
        <div className="flex items-center space-x-3">
          <Button variant="outline" onClick={previousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-medium text-gray-900 min-w-[200px] text-center">
            {format(currentWeek, 'MMM d')} - {format(addDays(currentWeek, 6), 'MMM d, yyyy')}
          </span>
          <Button variant="outline" onClick={nextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
        {DAYS_OF_WEEK.map((day, index) => {
          const date = format(addDays(currentWeek, index), 'yyyy-MM-dd');
          
          return (
            <Card key={day} className="min-h-[400px]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{day}</CardTitle>
                <p className="text-sm text-gray-500">{format(addDays(currentWeek, index), 'MMM d')}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {MEAL_TYPES.map(mealType => {
                  const recipe = getMealForSlot(date, mealType);
                  
                  return (
                    <div key={mealType}>
                      <div className="text-sm text-gray-600 font-medium capitalize mb-1">{mealType}</div>
                      <div className="min-h-[60px] border-2 border-dashed border-gray-200 rounded-lg p-2 hover:border-primary transition-colors">
                        {recipe ? (
                          <div className="bg-blue-50 border border-blue-200 rounded p-2">
                            <div className="text-xs font-medium text-blue-900 line-clamp-1">{recipe.title}</div>
                            <div className="text-xs text-blue-700">
                              {recipe.cookTime} • {recipe.servings} servings
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-gray-500 h-auto p-1"
                              onClick={() => {
                                // For demo purposes, add a random recipe
                                if (recipes.length > 0) {
                                  const randomRecipe = recipes[Math.floor(Math.random() * recipes.length)];
                                  addMealPlanMutation.mutate({
                                    date,
                                    mealType,
                                    recipeId: parseInt(randomRecipe.id)
                                  });
                                }
                              }}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add meal
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Week Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.plannedMeals}</div>
              <div className="text-sm text-gray-600">Planned Meals</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary">{stats.avgCookTime} min</div>
              <div className="text-sm text-gray-600">Avg Cook Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{stats.totalServings}</div>
              <div className="text-sm text-gray-600">Total Servings</div>
            </div>
          </div>
          <Button
            className="w-full mt-4"
            variant="secondary"
            onClick={() => generateShoppingListMutation.mutate()}
            disabled={generateShoppingListMutation.isPending || stats.plannedMeals === 0}
          >
            <Plus className="h-4 w-4 mr-2" />
            {generateShoppingListMutation.isPending ? "Generating..." : "Generate Shopping List for This Week"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
