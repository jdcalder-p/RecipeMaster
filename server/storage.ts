import { db, COLLECTIONS } from './services/firebase';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { Pool } from '@neondatabase/serverless';
import { recipes, mealPlans, shoppingListItems } from '@shared/schema';
import { 
  Recipe, 
  InsertRecipe, 
  MealPlan, 
  InsertMealPlan, 
  ShoppingListItem, 
  InsertShoppingListItem 
} from '@shared/schema';
import { eq, ilike, gte, lte, and, desc } from 'drizzle-orm';

export interface IStorage {
  // Recipe operations
  getRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  searchRecipes(query: string): Promise<Recipe[]>;
  
  // Meal plan operations
  getMealPlans(startDate?: string, endDate?: string): Promise<MealPlan[]>;
  createMealPlan(mealPlan: InsertMealPlan): Promise<MealPlan>;
  updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>): Promise<MealPlan>;
  deleteMealPlan(id: string): Promise<void>;
  
  // Shopping list operations
  getShoppingListItems(): Promise<ShoppingListItem[]>;
  createShoppingListItem(item: InsertShoppingListItem): Promise<ShoppingListItem>;
  updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>): Promise<ShoppingListItem>;
  deleteShoppingListItem(id: string): Promise<void>;
  generateShoppingListFromMealPlan(startDate: string, endDate: string): Promise<ShoppingListItem[]>;
}

export class FirebaseStorage implements IStorage {
  // Recipe operations
  async getRecipes(): Promise<Recipe[]> {
    try {
      console.log('Attempting to fetch recipes from Firestore...');
      const snapshot = await db.collection(COLLECTIONS.RECIPES).get();
      console.log(`Successfully fetched ${snapshot.docs.length} recipes`);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
    } catch (error) {
      console.error('Error fetching recipes:', error);
      // Return empty array instead of throwing while Firebase is being set up
      console.log('Returning empty recipes array while Firebase is being configured');
      return [];
    }
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const doc = await db.collection(COLLECTIONS.RECIPES).doc(id).get();
    if (!doc.exists) return undefined;
    return { id: doc.id, ...doc.data() } as Recipe;
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const docRef = await db.collection(COLLECTIONS.RECIPES).add({
      ...recipe,
      createdAt: new Date(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as Recipe;
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe> {
    await db.collection(COLLECTIONS.RECIPES).doc(id).update(recipe);
    const doc = await db.collection(COLLECTIONS.RECIPES).doc(id).get();
    return { id: doc.id, ...doc.data() } as Recipe;
  }

  async deleteRecipe(id: string): Promise<void> {
    await db.collection(COLLECTIONS.RECIPES).doc(id).delete();
  }

  async searchRecipes(query: string): Promise<Recipe[]> {
    const recipes = await this.getRecipes();
    const lowerQuery = query.toLowerCase();
    return recipes.filter(recipe => 
      recipe.title.toLowerCase().includes(lowerQuery) ||
      recipe.description?.toLowerCase().includes(lowerQuery) ||
      recipe.ingredients.some(ing => ing.toLowerCase().includes(lowerQuery))
    );
  }

  // Meal plan operations
  async getMealPlans(startDate?: string, endDate?: string): Promise<MealPlan[]> {
    try {
      let query = db.collection(COLLECTIONS.MEAL_PLANS).orderBy('date');
      
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }

      const snapshot = await query.get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MealPlan));
    } catch (error) {
      console.error('Error fetching meal plans:', error);
      return [];
    }
  }

  async createMealPlan(mealPlan: InsertMealPlan): Promise<MealPlan> {
    const docRef = await db.collection(COLLECTIONS.MEAL_PLANS).add({
      ...mealPlan,
      createdAt: new Date(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as MealPlan;
  }

  async updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>): Promise<MealPlan> {
    await db.collection(COLLECTIONS.MEAL_PLANS).doc(id).update(mealPlan);
    const doc = await db.collection(COLLECTIONS.MEAL_PLANS).doc(id).get();
    return { id: doc.id, ...doc.data() } as MealPlan;
  }

  async deleteMealPlan(id: string): Promise<void> {
    await db.collection(COLLECTIONS.MEAL_PLANS).doc(id).delete();
  }

  // Shopping list operations
  async getShoppingListItems(): Promise<ShoppingListItem[]> {
    try {
      const snapshot = await db.collection(COLLECTIONS.SHOPPING_LIST).orderBy('category').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingListItem));
    } catch (error) {
      console.error('Error fetching shopping list items:', error);
      return [];
    }
  }

  async createShoppingListItem(item: InsertShoppingListItem): Promise<ShoppingListItem> {
    const docRef = await db.collection(COLLECTIONS.SHOPPING_LIST).add({
      ...item,
      createdAt: new Date(),
    });
    const doc = await docRef.get();
    return { id: doc.id, ...doc.data() } as ShoppingListItem;
  }

  async updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    await db.collection(COLLECTIONS.SHOPPING_LIST).doc(id).update(item);
    const doc = await db.collection(COLLECTIONS.SHOPPING_LIST).doc(id).get();
    return { id: doc.id, ...doc.data() } as ShoppingListItem;
  }

  async deleteShoppingListItem(id: string): Promise<void> {
    await db.collection(COLLECTIONS.SHOPPING_LIST).doc(id).delete();
  }

  async generateShoppingListFromMealPlan(startDate: string, endDate: string): Promise<ShoppingListItem[]> {
    // Get meal plans for the date range
    const mealPlans = await this.getMealPlans(startDate, endDate);
    
    // Get recipes for the meal plans
    const recipeIds = mealPlans.map(mp => mp.recipeId).filter(Boolean);
    const filteredIds = recipeIds.filter(id => id !== null) as string[];
    const uniqueRecipeIds = Array.from(new Set(filteredIds));
    
    const recipes = await Promise.all(
      uniqueRecipeIds.map(id => this.getRecipe(id as string))
    );

    const validRecipes = recipes.filter(Boolean) as Recipe[];
    
    // Aggregate ingredients
    const ingredientMap = new Map<string, { quantity: string, category: string, recipeIds: string[] }>();
    
    validRecipes.forEach(recipe => {
      recipe.ingredients.forEach(ingredient => {
        const key = ingredient.toLowerCase().trim();
        const category = this.categorizeIngredient(ingredient);
        
        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key)!;
          existing.recipeIds.push(recipe.id);
        } else {
          ingredientMap.set(key, {
            quantity: ingredient,
            category,
            recipeIds: [recipe.id]
          });
        }
      });
    });

    // Create shopping list items
    const shoppingListItems: ShoppingListItem[] = [];
    
    const entries = Array.from(ingredientMap.entries());
    for (const [name, data] of entries) {
      const item = await this.createShoppingListItem({
        name: data.quantity,
        quantity: '1',
        category: data.category,
        isCompleted: false,
        recipeId: data.recipeIds[0]
      });
      shoppingListItems.push(item);
    }

    return shoppingListItems;
  }

  private categorizeIngredient(ingredient: string): string {
    const lowerIngredient = ingredient.toLowerCase();
    
    if (lowerIngredient.includes('tomato') || lowerIngredient.includes('onion') || 
        lowerIngredient.includes('garlic') || lowerIngredient.includes('herb') ||
        lowerIngredient.includes('spinach') || lowerIngredient.includes('basil')) {
      return 'Produce';
    }
    
    if (lowerIngredient.includes('cheese') || lowerIngredient.includes('milk') || 
        lowerIngredient.includes('cream') || lowerIngredient.includes('butter') ||
        lowerIngredient.includes('egg')) {
      return 'Dairy & Eggs';
    }
    
    if (lowerIngredient.includes('chicken') || lowerIngredient.includes('beef') || 
        lowerIngredient.includes('pork') || lowerIngredient.includes('fish') ||
        lowerIngredient.includes('meat')) {
      return 'Meat & Seafood';
    }
    
    if (lowerIngredient.includes('pasta') || lowerIngredient.includes('bread') || 
        lowerIngredient.includes('flour') || lowerIngredient.includes('rice')) {
      return 'Pantry';
    }
    
    return 'Other';
  }
}

// PostgreSQL Storage Implementation (simplified)
export class PostgreSQLStorage implements IStorage {
  private db: ReturnType<typeof drizzle>;

  constructor() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.db = drizzle(pool);
  }

  // Recipe operations
  async getRecipes(): Promise<Recipe[]> {
    try {
      return await this.db.select().from(recipes);
    } catch (error) {
      console.error('PostgreSQL error fetching recipes:', error);
      return [];
    }
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    try {
      const result = await this.db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error fetching recipe:', error);
      return undefined;
    }
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    try {
      const { nanoid } = await import('nanoid');
      const recipeData = {
        id: nanoid(),
        title: recipe.title,
        description: recipe.description || null,
        cookTime: recipe.cookTime || null,
        servings: recipe.servings || null,
        category: recipe.category || null,
        difficulty: recipe.difficulty || null,
        rating: recipe.rating || 0,
        imageUrl: recipe.imageUrl || null,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        sourceUrl: recipe.sourceUrl || null,
        isFavorite: recipe.isFavorite || false,
      };
      const result = await this.db.insert(recipes).values(recipeData).returning();
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error creating recipe:', error);
      throw new Error('Failed to create recipe');
    }
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe> {
    try {
      const result = await this.db.update(recipes).set(recipe).where(eq(recipes.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error updating recipe:', error);
      throw new Error('Failed to update recipe');
    }
  }

  async deleteRecipe(id: string): Promise<void> {
    try {
      await this.db.delete(recipes).where(eq(recipes.id, id));
    } catch (error) {
      console.error('PostgreSQL error deleting recipe:', error);
      throw new Error('Failed to delete recipe');
    }
  }

  async searchRecipes(query: string): Promise<Recipe[]> {
    try {
      return await this.db.select().from(recipes)
        .where(ilike(recipes.title, `%${query}%`));
    } catch (error) {
      console.error('PostgreSQL error searching recipes:', error);
      return [];
    }
  }

  // Meal plan operations
  async getMealPlans(startDate?: string, endDate?: string): Promise<MealPlan[]> {
    try {
      let query = this.db.select().from(mealPlans);
      
      const conditions = [];
      if (startDate) conditions.push(gte(mealPlans.date, startDate));
      if (endDate) conditions.push(lte(mealPlans.date, endDate));
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }
      
      return await query;
    } catch (error) {
      console.error('PostgreSQL error fetching meal plans:', error);
      return [];
    }
  }

  async createMealPlan(mealPlan: InsertMealPlan): Promise<MealPlan> {
    try {
      const { nanoid } = await import('nanoid');
      const planData = {
        id: nanoid(),
        date: mealPlan.date,
        mealType: mealPlan.mealType,
        recipeId: mealPlan.recipeId || null,
      };
      const result = await this.db.insert(mealPlans).values(planData).returning();
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error creating meal plan:', error);
      throw new Error('Failed to create meal plan');
    }
  }

  async updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>): Promise<MealPlan> {
    try {
      const result = await this.db.update(mealPlans).set(mealPlan).where(eq(mealPlans.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error updating meal plan:', error);
      throw new Error('Failed to update meal plan');
    }
  }

  async deleteMealPlan(id: string): Promise<void> {
    try {
      await this.db.delete(mealPlans).where(eq(mealPlans.id, id));
    } catch (error) {
      console.error('PostgreSQL error deleting meal plan:', error);
      throw new Error('Failed to delete meal plan');
    }
  }

  // Shopping list operations
  async getShoppingListItems(): Promise<ShoppingListItem[]> {
    try {
      return await this.db.select().from(shoppingListItems);
    } catch (error) {
      console.error('PostgreSQL error fetching shopping list items:', error);
      return [];
    }
  }

  async createShoppingListItem(item: InsertShoppingListItem): Promise<ShoppingListItem> {
    try {
      const { nanoid } = await import('nanoid');
      const itemData = {
        id: nanoid(),
        name: item.name,
        quantity: item.quantity || null,
        category: item.category || null,
        isCompleted: item.isCompleted || false,
        recipeId: item.recipeId || null,
      };
      const result = await this.db.insert(shoppingListItems).values(itemData).returning();
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error creating shopping list item:', error);
      throw new Error('Failed to create shopping list item');
    }
  }

  async updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    try {
      const result = await this.db.update(shoppingListItems).set(item).where(eq(shoppingListItems.id, id)).returning();
      return result[0];
    } catch (error) {
      console.error('PostgreSQL error updating shopping list item:', error);
      throw new Error('Failed to update shopping list item');
    }
  }

  async deleteShoppingListItem(id: string): Promise<void> {
    try {
      await this.db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
    } catch (error) {
      console.error('PostgreSQL error deleting shopping list item:', error);
      throw new Error('Failed to delete shopping list item');
    }
  }

  async generateShoppingListFromMealPlan(startDate: string, endDate: string): Promise<ShoppingListItem[]> {
    try {
      // Get meal plans for the date range
      const mealPlansList = await this.getMealPlans(startDate, endDate);
      
      // Get recipes for the meal plans
      const recipeIds = mealPlansList.map(mp => mp.recipeId).filter(Boolean) as string[];
      if (recipeIds.length === 0) return [];
      
      const recipesList = await this.db.select().from(recipes);
      const filteredRecipes = recipesList.filter(recipe => recipeIds.includes(recipe.id));
      
      // Generate shopping list items from ingredients
      const results = [];
      
      for (const recipe of filteredRecipes) {
        for (const ingredient of recipe.ingredients) {
          const item = await this.createShoppingListItem({
            name: ingredient,
            quantity: "1",
            category: this.categorizeIngredient(ingredient),
            isCompleted: false,
            recipeId: recipe.id,
          });
          results.push(item);
        }
      }
      
      return results;
    } catch (error) {
      console.error('PostgreSQL error generating shopping list:', error);
      return [];
    }
  }

  private categorizeIngredient(ingredient: string): string {
    const categories = [
      { name: "Produce", keywords: ["apple", "banana", "lettuce", "tomato", "onion", "carrot", "potato"] },
      { name: "Dairy", keywords: ["milk", "cheese", "butter", "yogurt", "cream"] },
      { name: "Meat", keywords: ["chicken", "beef", "pork", "fish", "turkey"] },
      { name: "Pantry", keywords: ["flour", "sugar", "salt", "pepper", "oil", "rice", "pasta"] },
    ];
    
    const lowerIngredient = ingredient.toLowerCase();
    for (const category of categories) {
      if (category.keywords.some(keyword => lowerIngredient.includes(keyword))) {
        return category.name;
      }
    }
    
    return "Other";
  }
}

// Temporary in-memory storage for immediate testing
class MemoryStorage implements IStorage {
  private recipes: Recipe[] = [];
  private mealPlans: MealPlan[] = [];
  private shoppingItems: ShoppingListItem[] = [];
  private idCounter = 1;

  async getRecipes(): Promise<Recipe[]> {
    return [...this.recipes];
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    return this.recipes.find(r => r.id === id);
  }

  async createRecipe(recipe: InsertRecipe): Promise<Recipe> {
    const newRecipe: Recipe = {
      ...recipe,
      id: `recipe_${this.idCounter++}`,
      createdAt: new Date(),
    };
    this.recipes.push(newRecipe);
    return newRecipe;
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe> {
    const index = this.recipes.findIndex(r => r.id === id);
    if (index === -1) throw new Error('Recipe not found');
    this.recipes[index] = { ...this.recipes[index], ...recipe };
    return this.recipes[index];
  }

  async deleteRecipe(id: string): Promise<void> {
    const index = this.recipes.findIndex(r => r.id === id);
    if (index !== -1) this.recipes.splice(index, 1);
  }

  async searchRecipes(query: string): Promise<Recipe[]> {
    return this.recipes.filter(r => 
      r.title.toLowerCase().includes(query.toLowerCase())
    );
  }

  async getMealPlans(startDate?: string, endDate?: string): Promise<MealPlan[]> {
    let filtered = [...this.mealPlans];
    if (startDate) filtered = filtered.filter(mp => mp.date >= startDate);
    if (endDate) filtered = filtered.filter(mp => mp.date <= endDate);
    return filtered;
  }

  async createMealPlan(mealPlan: InsertMealPlan): Promise<MealPlan> {
    const newPlan: MealPlan = {
      ...mealPlan,
      id: `plan_${this.idCounter++}`,
      createdAt: new Date(),
    };
    this.mealPlans.push(newPlan);
    return newPlan;
  }

  async updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>): Promise<MealPlan> {
    const index = this.mealPlans.findIndex(mp => mp.id === id);
    if (index === -1) throw new Error('Meal plan not found');
    this.mealPlans[index] = { ...this.mealPlans[index], ...mealPlan };
    return this.mealPlans[index];
  }

  async deleteMealPlan(id: string): Promise<void> {
    const index = this.mealPlans.findIndex(mp => mp.id === id);
    if (index !== -1) this.mealPlans.splice(index, 1);
  }

  async getShoppingListItems(): Promise<ShoppingListItem[]> {
    return [...this.shoppingItems];
  }

  async createShoppingListItem(item: InsertShoppingListItem): Promise<ShoppingListItem> {
    const newItem: ShoppingListItem = {
      ...item,
      id: `item_${this.idCounter++}`,
      createdAt: new Date(),
    };
    this.shoppingItems.push(newItem);
    return newItem;
  }

  async updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    const index = this.shoppingItems.findIndex(si => si.id === id);
    if (index === -1) throw new Error('Shopping item not found');
    this.shoppingItems[index] = { ...this.shoppingItems[index], ...item };
    return this.shoppingItems[index];
  }

  async deleteShoppingListItem(id: string): Promise<void> {
    const index = this.shoppingItems.findIndex(si => si.id === id);
    if (index !== -1) this.shoppingItems.splice(index, 1);
  }

  async generateShoppingListFromMealPlan(startDate: string, endDate: string): Promise<ShoppingListItem[]> {
    const plans = await this.getMealPlans(startDate, endDate);
    const results = [];
    
    for (const plan of plans) {
      if (plan.recipeId) {
        const recipe = await this.getRecipe(plan.recipeId);
        if (recipe) {
          for (const ingredient of recipe.ingredients) {
            const item = await this.createShoppingListItem({
              name: ingredient,
              quantity: "1",
              category: "Other",
              isCompleted: false,
              recipeId: recipe.id,
            });
            results.push(item);
          }
        }
      }
    }
    return results;
  }
}

// Using Firebase storage for production
export const storage = new FirebaseStorage();
