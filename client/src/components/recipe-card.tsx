import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Clock, Users, Star, Heart, Calendar, Trash2, Archive, Play } from "lucide-react";
import { Recipe } from "@shared/schema";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, startOfWeek } from "date-fns";
import { useMealPlan } from "@/hooks/use-meal-plan";

interface RecipeCardProps {
  recipe: Recipe;
  onViewRecipe: (recipe: Recipe) => void;
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const;

export function RecipeCard({ recipe, onViewRecipe }: RecipeCardProps) {
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedMealType, setSelectedMealType] = useState<string>("");
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Fetch all meal plans for this recipe
  const { data: allMealPlans = [] } = useMealPlan();
  const recipeMealPlans = allMealPlans.filter(plan => plan.recipeId === recipe.id);

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
    mutationFn: async ({ date, mealType }: { date: string, mealType: string }) => {
      return apiRequest("POST", "/api/meal-plans", {
        date,
        mealType,
        recipeId: recipe.id
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meal-plans'] });
      setSelectedDate("");
      setSelectedMealType("");
      toast({
        title: "Added to meal plan",
        description: `${recipe.title} has been scheduled`,
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

  const handleScheduleRecipe = () => {
    if (selectedDate && selectedMealType) {
      addToMealPlanMutation.mutate({ date: selectedDate, mealType: selectedMealType });
    }
  };

  const previousWeek = () => {
    setCurrentWeek(prev => addDays(prev, -7));
  };

  const nextWeek = () => {
    setCurrentWeek(prev => addDays(prev, 7));
  };

  const deleteMealPlanMutation = useMutation({
    mutationFn: async (mealPlanId: string) => {
      return apiRequest("DELETE", `/api/meal-plans/${mealPlanId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meal-plans'] });
      toast({
        title: "Meal removed from plan",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove meal from plan",
        variant: "destructive",
      });
    },
  });

  const handleRemoveMealPlan = (mealPlanId: string) => {
    deleteMealPlanMutation.mutate(mealPlanId);
  };

  const deleteRecipeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/recipes/${recipe.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({
        title: "Recipe deleted",
        description: "Recipe has been permanently deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete recipe",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete "${recipe.title}"? This action cannot be undone.`)) {
      deleteRecipeMutation.mutate();
    }
  };

  return (
    <Card className="hover:shadow-md transition-shadow">
      <div className="relative">
        <img
          src={recipe.imageUrl || 'https://images.unsplash.com/photo-1546554137-f86b9593a222?w=400&h=250&fit=crop'}
          alt={recipe.title}
          className="w-full h-48 object-cover rounded-t-lg"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = 'https://images.unsplash.com/photo-1546554137-f86b9593a222?w=400&h=250&fit=crop';
          }}
        />
        {recipe.videoUrl && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/60 rounded-full p-3 transition-transform hover:scale-110">
              <Play className="h-8 w-8 text-white fill-current" />
            </div>
          </div>
        )}
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
            onClick={(e) => {
              e.stopPropagation();
              setIsScheduleDialogOpen(true);
            }}
          >
            <Calendar className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleteRecipeMutation.isPending}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
      
      {/* Schedule Recipe Dialog */}
      <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule "{recipe.title}"</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Week Navigation */}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={previousWeek}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium">
                {format(currentWeek, 'MMM d')} - {format(addDays(currentWeek, 6), 'MMM d, yyyy')}
              </span>
              <Button variant="outline" size="sm" onClick={nextWeek}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Day Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Select Day</label>
              <div className="grid grid-cols-7 gap-1">
                {DAYS_OF_WEEK.map((day, index) => {
                  const date = format(addDays(currentWeek, index), 'yyyy-MM-dd');
                  const isSelected = selectedDate === date;
                  const hasScheduledMeal = recipeMealPlans.some(plan => plan.date === date);
                  const scheduledMeals = recipeMealPlans.filter(plan => plan.date === date);
                  
                  return (
                    <Button
                      key={day}
                      variant={isSelected ? "default" : "outline"}
                      size="sm"
                      className={`h-auto p-2 flex flex-col relative ${
                        hasScheduledMeal && !isSelected 
                          ? 'bg-blue-50 border-blue-200 hover:bg-blue-100' 
                          : ''
                      }`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span className="text-xs">{day.slice(0, 3)}</span>
                      <span className="text-xs">{format(addDays(currentWeek, index), 'd')}</span>
                      {hasScheduledMeal && (
                        <div className="absolute -top-1 -right-1 flex">
                          {scheduledMeals.map((meal, mealIndex) => (
                            <div
                              key={meal.id}
                              className={`h-2 w-2 rounded-full ${
                                meal.mealType === 'breakfast' ? 'bg-yellow-400' :
                                meal.mealType === 'lunch' ? 'bg-orange-400' :
                                'bg-purple-400'
                              }`}
                              style={{ marginLeft: mealIndex > 0 ? '-2px' : '0' }}
                              title={`${meal.mealType.charAt(0).toUpperCase() + meal.mealType.slice(1)}`}
                            />
                          ))}
                        </div>
                      )}
                    </Button>
                  );
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-yellow-400"></div>
                  <span>Breakfast</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-orange-400"></div>
                  <span>Lunch</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-purple-400"></div>
                  <span>Dinner</span>
                </div>
              </div>
            </div>
            
            {/* Meal Type Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">Select Meal</label>
              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a meal type" />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((mealType) => (
                    <SelectItem key={mealType} value={mealType}>
                      {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-2">
              <Button
                className="flex-1"
                onClick={handleScheduleRecipe}
                disabled={!selectedDate || !selectedMealType || addToMealPlanMutation.isPending}
              >
                {addToMealPlanMutation.isPending ? "Scheduling..." : "Schedule Recipe"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedDate("");
                  setSelectedMealType("");
                }}
              >
                Clear
              </Button>
            </div>

            {/* Existing Meal Plans */}
            {recipeMealPlans.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Currently Scheduled:</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {recipeMealPlans
                    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                    .map((mealPlan) => (
                      <div
                        key={mealPlan.id}
                        className="flex items-center justify-between bg-gray-50 rounded-lg p-2"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {format(new Date(mealPlan.date), 'EEE, MMM d')}
                          </div>
                          <div className="text-xs text-gray-600 capitalize">
                            {mealPlan.mealType}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleRemoveMealPlan(mealPlan.id)}
                          disabled={deleteMealPlanMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
