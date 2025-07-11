import { z } from "zod";

// Remove PostgreSQL-specific imports and keep only the types we need

export const insertRecipeSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  cookTime: z.string().optional(),
  servings: z.number().optional(),
  category: z.string().optional(),
  difficulty: z.string().optional(),
  rating: z.number().default(0),
  imageUrl: z.string().optional(),
  ingredients: z.array(z.object({
    sectionName: z.string().optional(),
    items: z.array(z.object({
      name: z.string().min(1, "Ingredient name is required"),
      quantity: z.string().optional(),
      unit: z.string().optional(),
    })).min(1, "At least one ingredient is required"),
  })).min(1, "At least one ingredient section is required"),
  instructions: z.array(z.object({
    sectionName: z.string().optional(),
    steps: z.array(z.object({
      text: z.string().min(1, "Instruction text is required"),
      imageUrl: z.string().optional(),
    })).min(1, "At least one step is required"),
  })).min(1, "At least one instruction section is required"),
  sourceUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  isFavorite: z.boolean().default(false),
});

export const insertMealPlanSchema = z.object({
  date: z.string().min(1, "Date is required"), // YYYY-MM-DD format
  mealType: z.string().min(1, "Meal type is required"), // breakfast, lunch, dinner
  recipeId: z.string().optional(),
});

export const insertShoppingListItemSchema = z.object({
  name: z.string().min(1, "Name is required"),
  quantity: z.string().optional(),
  category: z.string().optional(),
  isCompleted: z.boolean().default(false),
  recipeId: z.string().optional(),
});

// Type definitions for Firebase
export type UpsertUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

export type User = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: Date;
  updatedAt?: Date;
};

export type Recipe = {
  id: string;
  userId: string;
  title: string;
  description?: string;
  cookTime?: string;
  servings?: number;
  category?: string;
  difficulty?: string;
  rating: number;
  imageUrl?: string;
  ingredients: {
    sectionName?: string;
    items: {
      name: string;
      quantity?: string;
      unit?: string;
    }[];
  }[];
  instructions: {
    sectionName?: string;
    steps: {
      text: string;
      imageUrl?: string;
    }[];
  }[];
  sourceUrl?: string;
  videoUrl?: string;
  isFavorite: boolean;
  createdAt: Date;
};

export type MealPlan = {
  id: string;
  userId: string;
  date: string; // YYYY-MM-DD format
  mealType: string; // breakfast, lunch, dinner
  recipeId?: string;
  createdAt: Date;
};

export type ShoppingListItem = {
  id: string;
  userId: string;
  name: string;
  quantity?: string;
  category?: string;
  isCompleted: boolean;
  recipeId?: string;
  createdAt: Date;
};

export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type InsertShoppingListItem = z.infer<typeof insertShoppingListItemSchema>;