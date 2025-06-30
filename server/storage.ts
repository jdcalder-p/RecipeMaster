import { db, COLLECTIONS } from './services/firebase';
import { 
  Recipe, 
  InsertRecipe, 
  MealPlan, 
  InsertMealPlan, 
  ShoppingListItem, 
  InsertShoppingListItem 
} from '@shared/schema';

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
      const snapshot = await db.collection(COLLECTIONS.RECIPES).orderBy('createdAt', 'desc').get();
      console.log(`Successfully fetched ${snapshot.docs.length} recipes`);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recipe));
    } catch (error) {
      console.error('Error fetching recipes:', error);
      throw error;
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
    let query = db.collection(COLLECTIONS.MEAL_PLANS).orderBy('date');
    
    if (startDate) {
      query = query.where('date', '>=', startDate);
    }
    if (endDate) {
      query = query.where('date', '<=', endDate);
    }

    const snapshot = await query.get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MealPlan));
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
    const snapshot = await db.collection(COLLECTIONS.SHOPPING_LIST).orderBy('category').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShoppingListItem));
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

export const storage = new FirebaseStorage();
