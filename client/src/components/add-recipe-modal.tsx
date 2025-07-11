import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Minus, Trash2, Download, Save, GripVertical, X } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertRecipeSchema, InsertRecipe } from "@shared/schema";
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
    'c': 'Cup', 'cup': 'Cup', 'cups': 'Cup',
    'tbsp': 'Tbsp', 'tablespoon': 'Tbsp', 'tablespoons': 'Tbsp', 't': 'Tbsp',
    'tsp': 'tsp', 'teaspoon': 'tsp', 'teaspoons': 'tsp',
    'oz': 'oz', 'ounce': 'oz', 'ounces': 'oz',
    'lb': 'lb', 'lbs': 'lb', 'pound': 'lb', 'pounds': 'lb',
  };
  
  return unitMap[unitLower] || unit;
};

const formSchema = insertRecipeSchema.extend({
  ingredients: z.array(z.object({
    sectionName: z.string().optional(),
    items: z.array(z.object({
      name: z.string().min(1, "Ingredient name is required"),
      quantity: z.string().optional(),
      unit: z.string().optional(),
    })).min(1, "At least one ingredient is required"),
  })).min(1, "At least one ingredient section is required"),
});

interface AddRecipeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddRecipeModal({ open, onOpenChange }: AddRecipeModalProps) {
  const [importUrl, setImportUrl] = useState("");
  const [ingredientSections, setIngredientSections] = useState<{
    sectionName?: string;
    items: { name: string; quantity?: string; unit?: string; }[];
  }[]>([{ items: [{ name: "" }] }]);
  const [instructionSections, setInstructionSections] = useState<{
    sectionName?: string;
    steps: { text: string; imageUrl?: string; }[];
  }[]>([{ steps: [{ text: "" }] }]);
  const [servingSize, setServingSize] = useState(4);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const ingredientRefs = useRef<(HTMLInputElement | null)[]>([]);
  const instructionRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const sectionNameRefs = useRef<(HTMLInputElement | null)[]>([]);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<InsertRecipe>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      cookTime: "",
      servings: 4,
      category: "",
      imageUrl: "",
      ingredients: [{ items: [{ name: "" }] }],
      instructions: [{ steps: [{ text: "" }] }],
    },
  });

  // Sync instruction sections state with form
  useEffect(() => {
    setValue("instructions", instructionSections);
  }, [instructionSections, setValue]);

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
    setIngredientSections([{ items: [{ name: "" }] }]);
    setInstructionSections([{ steps: [{ text: "" }] }]);
    setImportUrl("");
    setValue("ingredients", [{ items: [{ name: "" }] }]);
    setValue("instructions", [{ steps: [{ text: "" }] }]);
  };

  const onSubmit = (data: InsertRecipe) => {
    const filteredSections = ingredientSections.map(section => ({
      ...section,
      items: section.items
        .filter(item => item.name.trim() !== "")
        .map(item => ({
          ...item,
          name: item.name.charAt(0).toUpperCase() + item.name.slice(1),
          unit: item.unit ? standardizeUnit(item.unit) : item.unit
        }))
    })).filter(section => section.items.length > 0);
    
    const filteredInstructionSections = instructionSections.map(section => ({
      ...section,
      steps: section.steps.filter(step => step.text.trim() !== "")
    })).filter(section => section.steps.length > 0);
    
    if (filteredSections.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please add at least one ingredient",
        variant: "destructive",
      });
      return;
    }
    
    if (filteredInstructionSections.length === 0) {
      toast({
        title: "Validation Error", 
        description: "Please add at least one instruction",
        variant: "destructive",
      });
      return;
    }
    
    createMutation.mutate({
      ...data,
      ingredients: filteredSections,
      instructions: filteredInstructionSections,
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

  const addIngredientSection = () => {
    const newIndex = ingredientSections.length;
    setIngredientSections([...ingredientSections, { items: [{ name: "" }] }]);
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
      setValue("ingredients", newSections);
    }
  };

  const updateIngredientItem = (sectionIndex: number, itemIndex: number, field: 'name' | 'quantity' | 'unit', value: string) => {
    const newSections = [...ingredientSections];
    newSections[sectionIndex].items[itemIndex][field] = value;
    setIngredientSections(newSections);
    setValue("ingredients", newSections);
  };

  const addInstructionSection = () => {
    const newSections = [...instructionSections, { steps: [{ text: "" }] }];
    setInstructionSections(newSections);
    setValue("instructions", newSections);
  };

  const removeInstructionSection = (sectionIndex: number) => {
    if (instructionSections.length > 1) {
      const newSections = instructionSections.filter((_, i) => i !== sectionIndex);
      setInstructionSections(newSections);
      setValue("instructions", newSections);
    }
  };

  const updateInstructionSectionName = (sectionIndex: number, name: string) => {
    const newSections = [...instructionSections];
    newSections[sectionIndex].sectionName = name || undefined;
    setInstructionSections(newSections);
    setValue("instructions", newSections);
  };

  const addStepToSection = (sectionIndex: number) => {
    const newSections = [...instructionSections];
    newSections[sectionIndex].steps.push({ text: "" });
    setInstructionSections(newSections);
    setValue("instructions", newSections);
  };

  const removeStepFromSection = (sectionIndex: number, stepIndex: number) => {
    const newSections = [...instructionSections];
    if (newSections[sectionIndex].steps.length > 1) {
      newSections[sectionIndex].steps.splice(stepIndex, 1);
      setInstructionSections(newSections);
      setValue("instructions", newSections);
    }
  };

  const updateInstructionStep = (sectionIndex: number, stepIndex: number, field: 'text' | 'imageUrl', value: string) => {
    const newSections = [...instructionSections];
    newSections[sectionIndex].steps[stepIndex] = { 
      ...newSections[sectionIndex].steps[stepIndex], 
      [field]: value 
    };
    setInstructionSections(newSections);
    setValue("instructions", newSections);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const { source, destination, type } = result;

    if (type === 'section') {
      const newSections = Array.from(ingredientSections);
      const [removed] = newSections.splice(source.index, 1);
      newSections.splice(destination.index, 0, removed);
      setIngredientSections(newSections);
      setValue("ingredients", newSections);
    } else if (type === 'ingredient') {
      const sourceSection = parseInt(source.droppableId.split('-')[1]);
      const destSection = parseInt(destination.droppableId.split('-')[1]);
      
      const newSections = [...ingredientSections];
      const sourceItems = [...newSections[sourceSection].items];
      const [removed] = sourceItems.splice(source.index, 1);
      
      if (sourceSection === destSection) {
        sourceItems.splice(destination.index, 0, removed);
        newSections[sourceSection].items = sourceItems;
      } else {
        const destItems = [...newSections[destSection].items];
        destItems.splice(destination.index, 0, removed);
        newSections[sourceSection].items = sourceItems;
        newSections[destSection].items = destItems;
      }
      
      setIngredientSections(newSections);
      setValue("ingredients", newSections);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <DialogTitle>Add New Recipe</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-6 w-6 p-0 hover:bg-gray-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </DialogHeader>

        <DragDropContext onDragEnd={onDragEnd}>
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

            {/* Manual Recipe Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="title">Recipe Title</Label>
                  <Input
                    id="title"
                    {...register("title")}
                    placeholder="Delicious Recipe Name"
                  />
                  {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title.message}</p>}
                </div>
                <div>
                  <Label htmlFor="cookTime">Cook Time</Label>
                  <Input
                    id="cookTime"
                    {...register("cookTime")}
                    placeholder="30 minutes"
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
                <div className="flex items-center justify-between mb-3">
                  <Label>Ingredients</Label>
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
                <div className="flex items-center justify-between mb-3">
                  <Label>Instructions</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addInstructionSection}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Section
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {instructionSections.map((section, sectionIndex) => (
                    <Card key={sectionIndex} className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Input
                            placeholder="Section name (optional, e.g., 'Prepare the sauce', 'Cook the chicken')"
                            value={section.sectionName || ""}
                            onChange={(e) => updateInstructionSectionName(sectionIndex, e.target.value)}
                            className="flex-1"
                          />
                          {instructionSections.length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeInstructionSection(sectionIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        <div className="space-y-2 pl-4 border-l-2 border-gray-200">
                          {section.steps.map((step, stepIndex) => {
                            const stepNumber = instructionSections
                              .slice(0, sectionIndex)
                              .reduce((acc, sec) => acc + sec.steps.length, 0) + stepIndex + 1;
                            
                            return (
                              <div key={stepIndex} className="border rounded-lg p-3 space-y-3">
                                <div className="flex items-start space-x-2">
                                  <div className="text-sm font-medium text-gray-500 mt-3 min-w-[2rem]">
                                    {stepNumber}.
                                  </div>
                                  <Textarea
                                    placeholder="Describe this step..."
                                    value={step.text}
                                    onChange={(e) => updateInstructionStep(sectionIndex, stepIndex, 'text', e.target.value)}
                                    className="flex-1"
                                    rows={2}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => removeStepFromSection(sectionIndex, stepIndex)}
                                    disabled={section.steps.length === 1}
                                    className="mt-2"
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="ml-8">
                                  <Input
                                    placeholder="Optional photo URL for this step..."
                                    value={step.imageUrl || ""}
                                    onChange={(e) => updateInstructionStep(sectionIndex, stepIndex, 'imageUrl', e.target.value)}
                                    className="text-sm"
                                  />
                                  {step.imageUrl && (
                                    <div className="mt-2">
                                      <img 
                                        src={step.imageUrl} 
                                        alt={`Step ${stepNumber} preview`}
                                        className="rounded-lg max-w-full h-32 object-cover"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                        }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => addStepToSection(sectionIndex)}
                            className="mt-2"
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Step
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
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
                  disabled={createMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {createMutation.isPending ? "Saving..." : "Save Recipe"}
                </Button>
              </div>
            </form>
          </div>
        </DragDropContext>
      </DialogContent>
    </Dialog>
  );
}