import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRecipeSchema, insertMealPlanSchema, insertShoppingListItemSchema } from "@shared/schema";
import { RecipeScraper } from "./services/scraper";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Recipe routes
  app.get("/api/recipes", async (req, res) => {
    try {
      const { search } = req.query;
      let recipes;
      
      if (search && typeof search === 'string') {
        recipes = await storage.searchRecipes(search);
      } else {
        recipes = await storage.getRecipes();
      }
      
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recipes" });
    }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    try {
      const recipeData = insertRecipeSchema.parse(req.body);
      const recipe = await storage.createRecipe(recipeData);
      res.status(201).json(recipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create recipe" });
    }
  });

  app.put("/api/recipes/:id", async (req, res) => {
    try {
      const recipeData = insertRecipeSchema.partial().parse(req.body);
      const recipe = await storage.updateRecipe(req.params.id, recipeData);
      res.json(recipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update recipe" });
    }
  });

  app.delete("/api/recipes/:id", async (req, res) => {
    try {
      await storage.deleteRecipe(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete recipe" });
    }
  });

  // Recipe scraping route
  app.post("/api/recipes/import", async (req, res) => {
    try {
      const { url } = req.body;
      
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ message: "URL is required" });
      }

      const scrapedData = await RecipeScraper.scrapeRecipe(url);
      
      if (!scrapedData.title) {
        return res.status(400).json({ message: "Could not extract recipe data from the provided URL" });
      }

      const recipeData = {
        ...scrapedData,
        sourceUrl: url,
        ingredients: scrapedData.ingredients || [],
        instructions: scrapedData.instructions || [],
      };

      const validatedData = insertRecipeSchema.parse(recipeData);
      const recipe = await storage.createRecipe(validatedData);
      
      res.status(201).json(recipe);
    } catch (error) {
      console.error('Recipe import error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      res.status(400).json({ 
        message: error instanceof Error ? error.message : "Failed to import recipe from URL" 
      });
    }
  });

  // Meal plan routes
  app.get("/api/meal-plans", async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      const mealPlans = await storage.getMealPlans(
        startDate as string, 
        endDate as string
      );
      res.json(mealPlans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch meal plans" });
    }
  });

  app.post("/api/meal-plans", async (req, res) => {
    try {
      const mealPlanData = insertMealPlanSchema.parse(req.body);
      const mealPlan = await storage.createMealPlan(mealPlanData);
      res.status(201).json(mealPlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid meal plan data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create meal plan" });
    }
  });

  app.put("/api/meal-plans/:id", async (req, res) => {
    try {
      const mealPlanData = insertMealPlanSchema.partial().parse(req.body);
      const mealPlan = await storage.updateMealPlan(req.params.id, mealPlanData);
      res.json(mealPlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid meal plan data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update meal plan" });
    }
  });

  app.delete("/api/meal-plans/:id", async (req, res) => {
    try {
      await storage.deleteMealPlan(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete meal plan" });
    }
  });

  // Shopping list routes
  app.get("/api/shopping-list", async (req, res) => {
    try {
      const items = await storage.getShoppingListItems();
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shopping list" });
    }
  });

  app.post("/api/shopping-list", async (req, res) => {
    try {
      const itemData = insertShoppingListItemSchema.parse(req.body);
      const item = await storage.createShoppingListItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid shopping list item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create shopping list item" });
    }
  });

  app.put("/api/shopping-list/:id", async (req, res) => {
    try {
      const itemData = insertShoppingListItemSchema.partial().parse(req.body);
      const item = await storage.updateShoppingListItem(req.params.id, itemData);
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid shopping list item data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update shopping list item" });
    }
  });

  app.delete("/api/shopping-list/:id", async (req, res) => {
    try {
      await storage.deleteShoppingListItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete shopping list item" });
    }
  });

  app.post("/api/shopping-list/generate", async (req, res) => {
    try {
      const { startDate, endDate } = req.body;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const items = await storage.generateShoppingListFromMealPlan(startDate, endDate);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate shopping list" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
