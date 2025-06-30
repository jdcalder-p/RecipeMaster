import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Download, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRecipeSchema, InsertRecipe } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";

const formSchema = insertRecipeSchema.extend({
  ingredients: z.array(z.string()).min(1, "At least one ingredient is required"),
  instructions: z.array(z.string()).min(1, "At least one instruction is required"),
});

interface AddRecipeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRecipeModal({ open, onOpenChange }: AddRecipeModalProps) {
  const [importUrl, setImportUrl] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([""]);
  const [instructions, setInstructions] = useState<string[]>([""]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<InsertRecipe>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      cookTime: "",
      servings: undefined,
      category: "",
      difficulty: "",
      rating: 0,
      imageUrl: "",
      ingredients: [],
      instructions: [],
      sourceUrl: "",
      isFavorite: false,
    },
  });

  const importMutation = useMutation({
    mutationFn: async (url: string) => {
      const response = await apiRequest("POST", "/api/recipes/import", { url });
      return response.json();
    },
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({
        title: "Recipe imported successfully!",
        description: `${recipe.title} has been added to your collection.`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import recipe from URL",
        variant: "destructive",
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertRecipe) => {
      const response = await apiRequest("POST", "/api/recipes", data);
      return response.json();
    },
    onSuccess: (recipe) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({
        title: "Recipe created successfully!",
        description: `${recipe.title} has been added to your collection.`,
      });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create recipe",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    reset();
    setIngredients([""]);
    setInstructions([""]);
    setImportUrl("");
  };

  const onSubmit = (data: InsertRecipe) => {
    const filteredIngredients = ingredients.filter(ing => ing.trim() !== "");
    const filteredInstructions = instructions.filter(inst => inst.trim() !== "");
    
    createMutation.mutate({
      ...data,
      ingredients: filteredIngredients,
      instructions: filteredInstructions,
    });
  };

  const handleImport = () => {
    if (!importUrl.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a URL to import from",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate(importUrl);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, ""]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((_, i) => i !== index));
    }
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const addInstruction = () => {
    setInstructions([...instructions, ""]);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      setInstructions(instructions.filter((_, i) => i !== index));
    }
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Recipe</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Import from URL Section */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold text-blue-900 mb-3">Import from URL</h3>
              <div className="flex space-x-3">
                <Input
                  placeholder="https://example.com/recipe-page"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                  variant="secondary"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {importMutation.isPending ? "Importing..." : "Import"}
                </Button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Paste a URL from popular recipe sites to automatically import recipe details.
              </p>
            </CardContent>
          </Card>

          {/* Manual Entry Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <h3 className="font-semibold text-gray-900">Or Create Manually</h3>

            <div>
              <Label htmlFor="title">Recipe Title</Label>
              <Input
                id="title"
                {...register("title")}
                placeholder="Enter recipe name..."
              />
              {errors.title && (
                <p className="text-sm text-destructive mt-1">{errors.title.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Input
                  id="servings"
                  type="number"
                  {...register("servings", { valueAsNumber: true })}
                  placeholder="4"
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select onValueChange={(value) => setValue("category", value)}>
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
              <Label htmlFor="imageUrl">Recipe Image URL</Label>
              <Input
                id="imageUrl"
                {...register("imageUrl")}
                placeholder="https://example.com/image.jpg"
              />
            </div>

            <div>
              <Label>Ingredients</Label>
              <div className="space-y-2">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Input
                      placeholder="e.g., 2 cups flour"
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
              <Label>Instructions</Label>
              <div className="space-y-2">
                {instructions.map((instruction, index) => (
                  <div key={index} className="flex items-start space-x-2">
                    <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium mt-1 flex-shrink-0">
                      {index + 1}
                    </span>
                    <Textarea
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
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={addInstruction}
                className="mt-2"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Step
              </Button>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                {createMutation.isPending ? "Saving..." : "Save Recipe"}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
