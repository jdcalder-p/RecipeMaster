import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Minus, Trash2, Save, GripVertical, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRecipeSchema, InsertRecipe, Recipe } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";

// Utility function to standardize units
const standardizeUnit = (unit: string): string => {
  if (!unit) return "";
  const unitLower = unit.toLowerCase().trim();

  const unitMap: { [key: string]: string } = {
    // Cup variations
    'c': 'Cup',
    'cup': 'Cup', 
    'cups': 'Cup',

    // Tablespoon variations  
    'tbsp': 'Tbsp',
    'tablespoon': 'Tbsp',
    'tablespoons': 'Tbsp',
    't': 'Tbsp',

    // Teaspoon variations
    'tsp': 'tsp',
    'teaspoon': 'tsp',
    'teaspoons': 'tsp',

    // Ounce variations
    'oz': 'oz',
    'ounce': 'oz',
    'ounces': 'oz',

    // Other common units
    'lb': 'lb',
    'lbs': 'lb',
    'pound': 'lb',
    'pounds': 'lb',
  };

  return unitMap[unitLower] || unit;
};

const formSchema = insertRecipeSchema.omit({ instructions: true, ingredients: true }).extend({
  ingredients: z.array(z.object({
    sectionName: z.string().optional(),
    items: z.array(z.object({
      name: z.string().min(1, "Ingredient name is required"),
      quantity: z.string().optional(),
      unit: z.string().optional(),
    })).min(1, "At least one ingredient is required"),
  })).min(1, "At least one ingredient section is required"),
  instructions: z.array(z.object({
    text: z.string().min(1, "Instruction text is required"),
    imageUrl: z.string().optional(),
  })).min(1, "At least one instruction is required"),
});

interface EditRecipeModalProps {
  recipe: Recipe | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditRecipeModal({ recipe, open, onOpenChange }: EditRecipeModalProps) {
  const [ingredientSections, setIngredientSections] = useState<{
    sectionName?: string;
    items: { name: string; quantity?: string; unit?: string; }[];
  }[]>([{ items: [{ name: "" }] }]);
  const [instructions, setInstructions] = useState<{ text: string; imageUrl?: string }[]>([{ text: "" }]);
  const [servingSize, setServingSize] = useState(4);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sectionNameRefs = useRef<(HTMLInputElement | null)[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
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

      // Convert recipe ingredients to editable format
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        setIngredientSections(recipe.ingredients);
      } else {
        setIngredientSections([{ items: [{ name: "" }] }]);
      }

      // Handle both old string format and new section format with steps
      if (recipe.instructions && recipe.instructions.length > 0) {
        let formattedInstructions: { text: string; imageUrl?: string }[] = [];

        recipe.instructions.forEach((instruction: any) => {
          if (typeof instruction === 'string') {
            // Old format: direct string
            formattedInstructions.push({ text: instruction });
          } else if (instruction.steps && Array.isArray(instruction.steps)) {
            // New format: section with steps array
            instruction.steps.forEach((step: any) => {
              if (typeof step === 'string') {
                formattedInstructions.push({ text: step });
              } else if (step.text) {
                formattedInstructions.push({ 
                  text: step.text, 
                  imageUrl: step.imageUrl 
                });
              }
            });
          } else if (instruction.text) {
            // Direct object with text property
            formattedInstructions.push({ 
              text: instruction.text, 
              imageUrl: instruction.imageUrl 
            });
          }
        });

        // Filter out empty instructions and section headers that are too short
        const validInstructions = formattedInstructions.filter(inst => 
          inst.text && 
          inst.text.trim().length > 0 &&
          !inst.text.match(/^(makes?\s+\d+|serves?\s+\d+)/i) // Filter out serving size headers
        );

        if (validInstructions.length > 0) {
          setInstructions(validInstructions);
        } else {
          setInstructions([{ text: "" }]);
        }
      } else {
        setInstructions([{ text: "" }]);
      }
      setServingSize(recipe.servings || 4);
      setValue("servings", recipe.servings || 4);
    }
  }, [recipe, open, reset, setValue]);

  // Sync ingredients and instructions state with form
  useEffect(() => {
    setValue("ingredients", ingredientSections);
  }, [ingredientSections, setValue]);

  useEffect(() => {
    setValue("instructions", instructions);
  }, [instructions, setValue]);

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
    onError: (error: any) => {
      console.error("Update recipe error:", error);

      // Extract specific error message from the response
      let errorMessage = "Failed to update recipe. Please try again.";

      if (error?.message) {
        if (error.message.includes("401")) {
          errorMessage = "You are not authorized to update this recipe.";
        } else if (error.message.includes("400")) {
          errorMessage = "Invalid recipe data. Please check all required fields.";
        } else if (error.message.includes("500")) {
          errorMessage = "Server error. Please try again later.";
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Update Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    console.log("Form submission data:", data);
    console.log("Form errors:", errors);
    console.log("Ingredient sections:", ingredientSections);
    console.log("Instructions:", instructions);

    // Check if title is empty (required field)
    if (!data.title || data.title.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Recipe title is required.",
        variant: "destructive",
      });
      return;
    }

    const filteredSections = ingredientSections
      .map(section => ({
        ...section,
        items: section.items
          .filter(item => item.name.trim() !== "")
          .map(item => ({
            ...item,
            name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
            unit: item.unit ? standardizeUnit(item.unit) : item.unit
          }))
      }))
      .filter(section => section.items.length > 0);

    const filteredInstructions = instructions.filter(instruction => instruction.text.trim() !== "");

    if (filteredSections.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one ingredient.",
        variant: "destructive",
      });
      return;
    }

    if (filteredInstructions.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one instruction.",
        variant: "destructive",
      });
      return;
    }

    // Format instructions for backend compatibility
    const formattedInstructions = [{
      steps: filteredInstructions
    }];

    console.log("Submitting recipe update:", {
      ...data,
      ingredients: filteredSections,
      instructions: formattedInstructions,
      servings: servingSize,
    });

    updateMutation.mutate({
      ...data,
      ingredients: filteredSections,
      instructions: formattedInstructions,
      servings: servingSize,
    });
  };

  const addIngredientSection = () => {
    const newIndex = ingredientSections.length;
    setIngredientSections([...ingredientSections, { items: [{ name: "" }] }]);
    // Auto-focus on the new section name field
    setTimeout(() => {
      if (sectionNameRefs.current[newIndex]) {
        sectionNameRefs.current[newIndex]?.focus();
      }
    }, 100);
  };

  const removeIngredientSection = (sectionIndex: number) => {
    if (ingredientSections.length > 1) {
      setIngredientSections(ingredientSections.filter((_, i) => i !== sectionIndex));
    }
  };

  const updateSectionName = (sectionIndex: number, name: string) => {
    const newSections = [...ingredientSections];
    newSections[sectionIndex].sectionName = name || undefined;
    setIngredientSections(newSections);
  };

  const addIngredientToSection = (sectionIndex: number) => {
    const newSections = [...ingredientSections];
    newSections[sectionIndex].items.push({ name: "" });
    setIngredientSections(newSections);
  };

  const removeIngredientFromSection = (sectionIndex: number, itemIndex: number) => {
    const newSections = [...ingredientSections];
    if (newSections[sectionIndex].items.length > 1) {
      newSections[sectionIndex].items.splice(itemIndex, 1);
      setIngredientSections(newSections);
    }
  };

  const updateIngredientItem = (sectionIndex: number, itemIndex: number, field: string, value: string) => {
    const newSections = [...ingredientSections];
    (newSections[sectionIndex].items[itemIndex] as any)[field] = value;
    setIngredientSections(newSections);
  };

  const addInstruction = () => {
    setInstructions([...instructions, { text: "" }]);
  };

  const updateInstruction = (index: number, field: 'text' | 'imageUrl', value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = { ...newInstructions[index], [field]: value };
    setInstructions(newInstructions);
  };

  const removeInstruction = (index: number) => {
    if (instructions.length > 1) {
      setInstructions(instructions.filter((_, i) => i !== index));
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (type === "section") {
      // Reorder sections
      const newSections = Array.from(ingredientSections);
      const [reorderedSection] = newSections.splice(source.index, 1);
      newSections.splice(destination.index, 0, reorderedSection);
      setIngredientSections(newSections);
    } else if (type === "ingredient") {
      // Handle ingredient reordering within and between sections
      const sourceDroppableId = source.droppableId;
      const destDroppableId = destination.droppableId;

      if (sourceDroppableId === destDroppableId) {
        // Same section
        const sectionIndex = parseInt(sourceDroppableId.split('-')[1]);
        const newSections = [...ingredientSections];
        const [reorderedItem] = newSections[sectionIndex].items.splice(source.index, 1);
        newSections[sectionIndex].items.splice(destination.index, 0, reorderedItem);
        setIngredientSections(newSections);
      } else {
        // Different sections
        const sourceSectionIndex = parseInt(sourceDroppableId.split('-')[1]);
        const destSectionIndex = parseInt(destDroppableId.split('-')[1]);
        const newSections = [...ingredientSections];
        const [movedItem] = newSections[sourceSectionIndex].items.splice(source.index, 1);
        newSections[destSectionIndex].items.splice(destination.index, 0, movedItem);
        setIngredientSections(newSections);
      }
    } else if (type === "instruction") {
      // Handle instruction reordering
      const newInstructions = Array.from(instructions);
      const [reorderedInstruction] = newInstructions.splice(source.index, 1);
      newInstructions.splice(destination.index, 0, reorderedInstruction);
      setInstructions(newInstructions);
    }
  };

  if (!recipe) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Recipe</DialogTitle>
        </DialogHeader>

        <DragDropContext onDragEnd={onDragEnd}>
          <div className="space-y-6">
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
                    <p className="text-sm text-red-600 mt-1">{errors.title.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="cookTime">Cook Time</Label>
                  <Input
                    id="cookTime"
                    {...register("cookTime")}
                    placeholder="e.g., 30 minutes"
                  />
                </div>
                <div>
                  <Label htmlFor="servings">Servings</Label>
                  <Input
                    id="servings"
                    type="number"
                    value={servingSize}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || 1;
                      setServingSize(value);
                      setValue("servings", value);
                    }}
                    min="1"
                    max="50"
                  />
                </div>
                <div>
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select onValueChange={(value) => setValue("difficulty", value)} defaultValue={recipe.difficulty || ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Easy">Easy</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Hard">Hard</SelectItem>
                    </SelectContent>
                  </Select>
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
                <Label htmlFor="imageUrl">Recipe Image URL</Label>
                <Input
                  id="imageUrl"
                  {...register("imageUrl")}
                  placeholder="https://example.com/recipe-image.jpg"
                />
                {recipe.imageUrl && (
                  <div className="mt-2">
                    <img 
                      src={recipe.imageUrl} 
                      alt="Recipe preview"
                      className="w-32 h-32 object-cover rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>

              <div>
                <Label>Ingredients *</Label>
                <div className="flex items-center justify-between mb-4">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addIngredientSection}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Section
                  </Button>
                </div>

                <Droppable droppableId="sections" type="section">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-4"
                    >
                      {ingredientSections.map((section, sectionIndex) => (
                        <Draggable
                          key={sectionIndex}
                          draggableId={`section-${sectionIndex}`}
                          index={sectionIndex}
                        >
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-4 ${snapshot.isDragging ? 'bg-blue-50 shadow-lg' : ''}`}
                            >
                              <div className="space-y-3">
                                <div className="flex items-center space-x-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="cursor-grab hover:bg-gray-100 p-1 rounded"
                                  >
                                    <GripVertical className="h-4 w-4 text-gray-400" />
                                  </div>
                                  <Input
                                    ref={(el) => sectionNameRefs.current[sectionIndex] = el}
                                    placeholder="Section name (optional, e.g., 'Cake', 'Frosting')"
                                    value={section.sectionName || ""}
                                    onChange={(e) => updateSectionName(sectionIndex, e.target.value)}
                                    className="flex-1"
                                  />
                                  {ingredientSections.length > 1 && (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => removeIngredientSection(sectionIndex)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>

                                <Droppable droppableId={`section-${sectionIndex}`} type="ingredient">
                                  {(provided) => (
                                    <div
                                      {...provided.droppableProps}
                                      ref={provided.innerRef}
                                      className="space-y-2 pl-4 border-l-2 border-gray-200"
                                    >
                                      {section.items.map((item, itemIndex) => (
                                        <Draggable
                                          key={`${sectionIndex}-${itemIndex}`}
                                          draggableId={`ingredient-${sectionIndex}-${itemIndex}`}
                                          index={itemIndex}
                                        >
                                          {(provided, snapshot) => (
                                            <div
                                              ref={provided.innerRef}
                                              {...provided.draggableProps}
                                              className={`flex items-center space-x-2 ${snapshot.isDragging ? 'bg-blue-50 shadow-md rounded p-2' : ''}`}
                                            >
                                              <div
                                                {...provided.dragHandleProps}
                                                className="cursor-grab hover:bg-gray-100 p-1 rounded"
                                              >
                                                <GripVertical className="h-3 w-3 text-gray-400" />
                                              </div>
                                              <Input
                                                placeholder="Quantity"
                                                value={item.quantity || ""}
                                                onChange={(e) => updateIngredientItem(sectionIndex, itemIndex, 'quantity', e.target.value)}
                                                className="w-20"
                                              />
                                              <Input
                                                placeholder="Unit"
                                                value={item.unit || ""}
                                                onChange={(e) => updateIngredientItem(sectionIndex, itemIndex, 'unit', e.target.value)}
                                                className="w-20"
                                              />
                                              <Input
                                                placeholder="Ingredient name"
                                                value={item.name}
                                                onChange={(e) => updateIngredientItem(sectionIndex, itemIndex, 'name', e.target.value)}
                                                className="flex-1"
                                              />
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeIngredientFromSection(sectionIndex, itemIndex)}
                                                disabled={section.items.length === 1}
                                              >
                                                <Minus className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          )}
                                        </Draggable>
                                      ))}
                                      {provided.placeholder}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => addIngredientToSection(sectionIndex)}
                                        className="mt-2"
                                      >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Add Ingredient
                                      </Button>
                                    </div>
                                  )}
                                </Droppable>
                              </div>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>

              <div>
                <Label>Instructions *</Label>
                <Droppable droppableId="instructions" type="instruction">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2"
                    >
                      {instructions.map((instruction, index) => (
                        <Draggable
                          key={index}
                          draggableId={`instruction-${index}`}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <Card
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`p-3 ${snapshot.isDragging ? 'bg-blue-50 shadow-lg' : ''}`}
                            >
                              <div className="space-y-3">
                                <div className="flex items-start space-x-2">
                                  <div
                                    {...provided.dragHandleProps}
                                    className="cursor-grab hover:bg-gray-100 p-1 rounded mt-1"
                                  >
                                    <GripVertical className="h-4 w-4 text-gray-400" />
                                  </div>
                                  <span className="bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-sm font-medium mt-1 flex-shrink-0">
                                    {index + 1}
                                  </span>
                                  <Textarea
                                    placeholder="Enter instruction..."
                                    value={instruction.text}
                                    onChange={(e) => updateInstruction(index, 'text', e.target.value)}
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
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="ml-12">
                                  <Input
                                    placeholder="Optional photo URL for this step..."
                                    value={instruction.imageUrl || ""}
                                    onChange={(e) => updateInstruction(index, 'imageUrl', e.target.value)}
                                    className="text-sm"
                                  />
                                  {instruction.imageUrl && (
                                    <div className="mt-2">
                                      <img 
                                        src={instruction.imageUrl} 
                                        alt={`Step ${index + 1} preview`}
                                        className="rounded-lg max-w-full h-32 object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            </Card>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
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

              <div className="flex justify-end space-x-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>

              {/* Debug info for validation */}
              {Object.keys(errors).length > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <h4 className="text-sm font-medium text-red-800">Form Validation Errors:</h4>
                  <ul className="mt-2 text-sm text-red-700">
                    {Object.entries(errors).map(([field, error]) => (
                      <li key={field}>• {field}: {error?.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </form>
          </div>
        </DragDropContext>
      </DialogContent>
    </Dialog>
  );
}