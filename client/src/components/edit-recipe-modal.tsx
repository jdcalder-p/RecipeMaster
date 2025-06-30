import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Minus, Trash2, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRecipeSchema, InsertRecipe, Recipe } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface EditRecipeModalProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRecipeModal({ recipe, open, onOpenChange }: EditRecipeModalProps) {
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState<string[]>([""]);
  const [servingSize, setServingSize] = useState(4);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ingredientRefs = useRef<(HTMLInputElement | null)[]>([]);
  const instructionRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InsertRecipe>({
    resolver: zodResolver(insertRecipeSchema),
    defaultValues: {
      title: "",
      description: "",
      cookTime: "",
      servings: 4,
      category: "",
      difficulty: "",
      rating: 0,
      imageUrl: "",
      sourceUrl: "",
      isFavorite: false,
    },
  });

  // Populate form when recipe changes
  useEffect(() => {
    if (recipe && open) {
      reset({
        title: recipe.title,
        description: recipe.description || "",
        cookTime: recipe.cookTime || "",
        servings: recipe.servings || 4,
        category: recipe.category || "",
        difficulty: recipe.difficulty || "",
        rating: recipe.rating || 0,
        imageUrl: recipe.imageUrl || "",
        sourceUrl: recipe.sourceUrl || "",
        isFavorite: recipe.isFavorite || false,
      });
      
      setIngredients(recipe.ingredients || [""]);
      setInstructions(recipe.instructions || [""]);
      setServingSize(recipe.servings || 4);
      setValue("servings", recipe.servings || 4);
    }
  }, [recipe, open, reset, setValue]);

  const updateMutation = useMutation({
    mutationFn: async (data: InsertRecipe) => {
      if (!recipe) throw new Error("No recipe to update");
      return apiRequest("PATCH", `/api/recipes/${recipe.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recipes"] });
      toast({
        title: "Success",
        description: "Recipe updated successfully!",
      });
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update recipe. Please try again.",
        variant: "destructive",
      });
      console.error("Update recipe error:", error);
    },
  });

  const onSubmit = (data: InsertRecipe) => {
    const filteredIngredients = ingredients.filter(ingredient => ingredient.trim() !== "");
    const filteredInstructions = instructions.filter(instruction => instruction.trim() !== "");
    
    if (filteredIngredients.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one ingredient.",
        variant: "destructive",
      });
      return;
    }
    
    if (filteredInstructions.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one instruction.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      ...data,
      ingredients: filteredIngredients,
      instructions: filteredInstructions,
      servings: servingSize,
    });
  };

  const addIngredient = () => {
    const newIngredients = [...ingredients, ""];
    setIngredients(newIngredients);
    setTimeout(() => {
      const lastIndex = newIngredients.length - 1;
      ingredientRefs.current[lastIndex]?.focus();
    }, 0);
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const addInstruction = () => {
    const newInstructions = [...instructions, ""];
    setInstructions(newInstructions);
    setTimeout(() => {
      const lastIndex = newInstructions.length - 1;
      instructionRefs.current[lastIndex]?.focus();
    }, 0);
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      setInstructions(instructions.filter((_, i) => i !== index));
    }
  };

  if (!recipe) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Recipe</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="title">Recipe Title *</Label>
              <Input
                id="title"
                {...register("title")}
                placeholder="Enter recipe title..."
              />
              {errors.title && (
                <p className="text-sm text-red-500 mt-1">{errors.title.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                {...register("imageUrl")}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div>
              <Label htmlFor="sourceUrl">Source URL</Label>
              <Input
                id="sourceUrl"
                {...register("sourceUrl")}
                placeholder="https://example.com/recipe"
              />
            </div>
            <div>
              <Label htmlFor="cookTime">Cook Time</Label>
              <Input
                id="cookTime"
                {...register("cookTime")}
                placeholder="e.g., 30 min"
              />
            </div>
            <div>
              <Label htmlFor="servings">Servings</Label>
              <div className="flex items-center space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newSize = Math.max(1, servingSize - 1);
                    setServingSize(newSize);
                    setValue("servings", newSize);
                  }}
                  className="h-8 w-8 p-0"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-[2rem] text-center font-medium">{servingSize}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const newSize = servingSize + 1;
                    setServingSize(newSize);
                    setValue("servings", newSize);
                  }}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Input
                  type="hidden"
                  {...register("servings", { valueAsNumber: true, value: servingSize })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="category">Category</Label>
              <Select onValueChange={(value) => setValue("category", value)} defaultValue={recipe.category || ""}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Breakfast">Breakfast</SelectItem>
                  <SelectItem value="Lunch">Lunch</SelectItem>
                  <SelectItem value="Dinner">Dinner</SelectItem>
                  <SelectItem value="Dessert">Dessert</SelectItem>
                  <SelectItem value="Snacks">Snacks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Brief description of the recipe..."
              rows={3}
            />
          </div>

          <div>
            <Label>Ingredients *</Label>
            <div className="space-y-2">
              {ingredients.map((ingredient, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <Input
                    ref={(el) => { ingredientRefs.current[index] = el; }}
                    placeholder="e.g., 1 cup flour"
                    value={ingredient}
                    onChange={(e) => updateIngredient(index, e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeIngredient(index)}
                    disabled={ingredients.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={addIngredient}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Ingredient
            </Button>
          </div>

          <div>
            <Label>Instructions *</Label>
            <div className="space-y-2">
              {instructions.map((instruction, index) => (
                <Card key={index} className="p-3">
                  <div className="space-y-3">
                    <div className="flex items-start space-x-2">
                      <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium mt-1 flex-shrink-0">
                        {index + 1}
                      </span>
                      <Textarea
                        ref={(el) => { instructionRefs.current[index] = el; }}
                        placeholder="Describe the cooking step..."
                        value={instruction}
                        onChange={(e) => updateInstruction(index, e.target.value)}
                        className="flex-1"
                        rows={2}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeInstruction(index)}
                        disabled={instructions.length === 1}
                        className="mt-1"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="ml-8">
                      <Label className="text-xs text-muted-foreground">Optional step image (URL)</Label>
                      <Input
                        placeholder="https://example.com/step-image.jpg"
                        className="mt-1"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={addInstruction}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Instruction
            </Button>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <Save className="h-4 w-4 mr-2" />
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}