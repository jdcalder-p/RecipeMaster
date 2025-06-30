import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRecipeSchema, insertMealPlanSchema, insertShoppingListItemSchema } from "@shared/schema";
import { RecipeScraper } from "./services/scraper";
import { verifyFirebaseToken } from "./firebaseAuth";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // No setup required for Firebase auth

  // Auth routes
  app.get('/api/auth/user', verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Recipe routes
  app.get("/api/recipes", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const { search } = req.query;
      let recipes;
      
      if (search && typeof search === 'string') {
        recipes = await storage.searchRecipes(search, userId);
      } else {
        recipes = await storage.getRecipes(userId);
      }
      
      res.json(recipes);
    } catch (error) {
      console.error("Error fetching recipes:", error);
      res.status(500).json({ message: "Failed to fetch recipes" });
    }
  });

  app.get("/api/recipes/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const recipe = await storage.getRecipe(req.params.id, userId);
      if (!recipe) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error) {
      console.error("Error fetching recipe:", error);
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  app.post("/api/recipes", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const recipeData = insertRecipeSchema.parse(req.body);
      const recipe = await storage.createRecipe(recipeData, userId);
      res.status(201).json(recipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      console.error("Error creating recipe:", error);
      res.status(500).json({ message: "Failed to create recipe" });
    }
  });

  app.post("/api/recipes/import", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const { url } = req.body;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }

      // Scrape recipe from URL
      const scrapedData = await RecipeScraper.scrapeRecipe(url);
      
      // Validate and create recipe
      const recipeData = insertRecipeSchema.parse({
        ...scrapedData,
        sourceUrl: url
      });
      
      const recipe = await storage.createRecipe(recipeData, userId);
      res.status(201).json(recipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      console.error("Error importing recipe:", error);
      res.status(500).json({ message: "Failed to import recipe from URL" });
    }
  });

  app.patch("/api/recipes/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const updates = req.body;
      const recipe = await storage.updateRecipe(req.params.id, updates, userId);
      res.json(recipe);
    } catch (error) {
      console.error("Error updating recipe:", error);
      res.status(500).json({ message: "Failed to update recipe" });
    }
  });

  app.delete("/api/recipes/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      await storage.deleteRecipe(req.params.id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting recipe:", error);
      res.status(500).json({ message: "Failed to delete recipe" });
    }
  });

  // Meal plan routes
  app.get("/api/meal-plans", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const { startDate, endDate } = req.query;
      const mealPlans = await storage.getMealPlans(
        userId,
        startDate as string,
        endDate as string
      );
      res.json(mealPlans);
    } catch (error) {
      console.error("Error fetching meal plans:", error);
      res.status(500).json({ message: "Failed to fetch meal plans" });
    }
  });

  app.post("/api/meal-plans", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const mealPlanData = insertMealPlanSchema.parse(req.body);
      const mealPlan = await storage.createMealPlan(mealPlanData, userId);
      res.status(201).json(mealPlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid meal plan data", errors: error.errors });
      }
      console.error("Error creating meal plan:", error);
      res.status(500).json({ message: "Failed to create meal plan" });
    }
  });

  app.patch("/api/meal-plans/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const updates = req.body;
      const mealPlan = await storage.updateMealPlan(req.params.id, updates, userId);
      res.json(mealPlan);
    } catch (error) {
      console.error("Error updating meal plan:", error);
      res.status(500).json({ message: "Failed to update meal plan" });
    }
  });

  app.delete("/api/meal-plans/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      await storage.deleteMealPlan(req.params.id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting meal plan:", error);
      res.status(500).json({ message: "Failed to delete meal plan" });
    }
  });

  // Shopping list routes
  app.get("/api/shopping-list", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const items = await storage.getShoppingListItems(userId);
      res.json(items);
    } catch (error) {
      console.error("Error fetching shopping list:", error);
      res.status(500).json({ message: "Failed to fetch shopping list" });
    }
  });

  app.post("/api/shopping-list", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const itemData = insertShoppingListItemSchema.parse(req.body);
      const item = await storage.createShoppingListItem(itemData, userId);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid shopping list item data", errors: error.errors });
      }
      console.error("Error creating shopping list item:", error);
      res.status(500).json({ message: "Failed to create shopping list item" });
    }
  });

  app.patch("/api/shopping-list/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const updates = req.body;
      const item = await storage.updateShoppingListItem(req.params.id, updates, userId);
      res.json(item);
    } catch (error) {
      console.error("Error updating shopping list item:", error);
      res.status(500).json({ message: "Failed to update shopping list item" });
    }
  });

  app.delete("/api/shopping-list/:id", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      await storage.deleteShoppingListItem(req.params.id, userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting shopping list item:", error);
      res.status(500).json({ message: "Failed to delete shopping list item" });
    }
  });

  app.post("/api/shopping-list/generate", verifyFirebaseToken, async (req: any, res) => {
    try {
      const userId = req.user.uid;
      const { startDate, endDate } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const items = await storage.generateShoppingListFromMealPlan(startDate, endDate, userId);
      
      // Save generated items to shopping list
      const savedItems = [];
      for (const item of items) {
        const savedItem = await storage.createShoppingListItem({
          name: item.name,
          quantity: item.quantity,
          category: item.category,
          isCompleted: false,
          recipeId: item.recipeId,
        }, userId);
        savedItems.push(savedItem);
      }
      
      res.status(201).json(savedItems);
    } catch (error) {
      console.error("Error generating shopping list:", error);
      res.status(500).json({ message: "Failed to generate shopping list" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}