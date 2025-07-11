
import { db, COLLECTIONS } from './services/firebase';
import { nanoid } from 'nanoid';
import {
  Recipe,
  InsertRecipe,
  MealPlan,
  InsertMealPlan,
  ShoppingListItem,
  InsertShoppingListItem,
  User,
  UpsertUser
} from '@shared/schema';
import { IStorage } from './storage';

export class FirebaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    try {
      const doc = await db.collection('users').doc(id).get();
      if (!doc.exists) return undefined;
      return { id: doc.id, ...doc.data() } as User;
    } catch (error) {
      console.error('Error getting user:', error);
      return undefined;
    }
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const userRef = db.collection('users').doc(userData.id);
      
      await userRef.set({
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }, { merge: true });

      const doc = await userRef.get();
      return { id: doc.id, ...doc.data() } as User;
    } catch (error) {
      console.error('Error upserting user:', error);
      throw error;
    }
  }

  // Recipe operations
  async getRecipes(userId: string): Promise<Recipe[]> {
    try {
      const snapshot = await db.collection(COLLECTIONS.RECIPES)
        .where('userId', '==', userId)
        .get();

      // Sort by createdAt on the client side instead
      const recipes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recipe[];

      return recipes.sort((a, b) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bDate.getTime() - aDate.getTime();
      });
    } catch (error) {
      console.error('Error getting recipes:', error);
      return [];
    }
  }

  async getRecipe(id: string, userId: string): Promise<Recipe | undefined> {
    try {
      const doc = await db.collection(COLLECTIONS.RECIPES).doc(id).get();
      if (!doc.exists) return undefined;
      
      const recipe = { id: doc.id, ...doc.data() } as Recipe;
      if (recipe.userId !== userId) return undefined;
      
      return recipe;
    } catch (error) {
      console.error('Error getting recipe:', error);
      return undefined;
    }
  }

  async createRecipe(recipe: InsertRecipe, userId: string): Promise<Recipe> {
    try {
      const id = nanoid();
      
      // Clean up the recipe data to remove undefined values
      const cleanedRecipe = this.cleanRecipeData(recipe);
      
      const recipeData = {
        ...cleanedRecipe,
        userId,
        createdAt: new Date(),
      };

      await db.collection(COLLECTIONS.RECIPES).doc(id).set(recipeData);
      
      return { id, ...recipeData } as Recipe;
    } catch (error) {
      console.error('Error creating recipe:', error);
      throw error;
    }
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>, userId: string): Promise<Recipe> {
    try {
      const recipeRef = db.collection(COLLECTIONS.RECIPES).doc(id);
      
      // Verify ownership
      const doc = await recipeRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error('Recipe not found or access denied');
      }

      // Clean the partial recipe data
      const cleanedRecipe = recipe as InsertRecipe;
      const cleanedUpdate = this.cleanRecipeData(cleanedRecipe);

      await recipeRef.update(cleanedUpdate);
      
      const updatedDoc = await recipeRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() } as Recipe;
    } catch (error) {
      console.error('Error updating recipe:', error);
      throw error;
    }
  }

  async deleteRecipe(id: string, userId: string): Promise<void> {
    try {
      const recipeRef = db.collection(COLLECTIONS.RECIPES).doc(id);
      
      // Verify ownership
      const doc = await recipeRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error('Recipe not found or access denied');
      }

      await recipeRef.delete();
    } catch (error) {
      console.error('Error deleting recipe:', error);
      throw error;
    }
  }

  async searchRecipes(query: string, userId: string): Promise<Recipe[]> {
    try {
      // Firebase doesn't support case-insensitive search directly
      // This is a simple implementation - for production, consider using Algolia or similar
      const snapshot = await db.collection(COLLECTIONS.RECIPES)
        .where('userId', '==', userId)
        .get();

      const recipes = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recipe[];

      // Filter and sort results on the client side
      const filteredRecipes = recipes.filter(recipe => 
        recipe.title.toLowerCase().includes(query.toLowerCase())
      );

      return filteredRecipes.sort((a, b) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return bDate.getTime() - aDate.getTime();
      });
    } catch (error) {
      console.error('Error searching recipes:', error);
      return [];
    }
  }

  // Meal plan operations
  async getMealPlans(userId: string, startDate?: string, endDate?: string): Promise<MealPlan[]> {
    try {
      let query = db.collection(COLLECTIONS.MEAL_PLANS)
        .where('userId', '==', userId);

      if (startDate && endDate) {
        query = query.where('date', '>=', startDate).where('date', '<=', endDate);
      }

      const snapshot = await query.get();

      // Sort on client side to avoid composite index requirement
      const mealPlans = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MealPlan[];

      return mealPlans.sort((a, b) => {
        // First sort by date
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        
        // Then sort by meal type
        const mealTypeOrder = { 'breakfast': 1, 'lunch': 2, 'dinner': 3 };
        const aMealType = mealTypeOrder[a.mealType.toLowerCase()] || 4;
        const bMealType = mealTypeOrder[b.mealType.toLowerCase()] || 4;
        return aMealType - bMealType;
      });
    } catch (error) {
      console.error('Error getting meal plans:', error);
      return [];
    }
  }

  async createMealPlan(mealPlan: InsertMealPlan, userId: string): Promise<MealPlan> {
    try {
      const id = nanoid();
      const mealPlanData = {
        ...mealPlan,
        userId,
        createdAt: new Date(),
      };

      await db.collection(COLLECTIONS.MEAL_PLANS).doc(id).set(mealPlanData);
      
      return { id, ...mealPlanData } as MealPlan;
    } catch (error) {
      console.error('Error creating meal plan:', error);
      throw error;
    }
  }

  async updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>, userId: string): Promise<MealPlan> {
    try {
      const mealPlanRef = db.collection(COLLECTIONS.MEAL_PLANS).doc(id);
      
      // Verify ownership
      const doc = await mealPlanRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error('Meal plan not found or access denied');
      }

      await mealPlanRef.update(mealPlan);
      
      const updatedDoc = await mealPlanRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() } as MealPlan;
    } catch (error) {
      console.error('Error updating meal plan:', error);
      throw error;
    }
  }

  async deleteMealPlan(id: string, userId: string): Promise<void> {
    try {
      const mealPlanRef = db.collection(COLLECTIONS.MEAL_PLANS).doc(id);
      
      // Verify ownership
      const doc = await mealPlanRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error('Meal plan not found or access denied');
      }

      await mealPlanRef.delete();
    } catch (error) {
      console.error('Error deleting meal plan:', error);
      throw error;
    }
  }

  // Shopping list operations
  async getShoppingListItems(userId: string): Promise<ShoppingListItem[]> {
    try {
      const snapshot = await db.collection(COLLECTIONS.SHOPPING_LIST)
        .where('userId', '==', userId)
        .get();

      // Sort on client side to avoid composite index requirement
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShoppingListItem[];

      return items.sort((a, b) => {
        // First sort by category
        const categoryCompare = (a.category || '').localeCompare(b.category || '');
        if (categoryCompare !== 0) return categoryCompare;
        
        // Then sort by name
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Error getting shopping list items:', error);
      return [];
    }
  }

  async createShoppingListItem(item: InsertShoppingListItem, userId: string): Promise<ShoppingListItem> {
    try {
      const id = nanoid();
      const itemData = {
        ...item,
        userId,
        createdAt: new Date(),
      };

      await db.collection(COLLECTIONS.SHOPPING_LIST).doc(id).set(itemData);
      
      return { id, ...itemData } as ShoppingListItem;
    } catch (error) {
      console.error('Error creating shopping list item:', error);
      throw error;
    }
  }

  async updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>, userId: string): Promise<ShoppingListItem> {
    try {
      const itemRef = db.collection(COLLECTIONS.SHOPPING_LIST).doc(id);
      
      // Verify ownership
      const doc = await itemRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error('Shopping list item not found or access denied');
      }

      await itemRef.update(item);
      
      const updatedDoc = await itemRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() } as ShoppingListItem;
    } catch (error) {
      console.error('Error updating shopping list item:', error);
      throw error;
    }
  }

  async deleteShoppingListItem(id: string, userId: string): Promise<void> {
    try {
      const itemRef = db.collection(COLLECTIONS.SHOPPING_LIST).doc(id);
      
      // Verify ownership
      const doc = await itemRef.get();
      if (!doc.exists || doc.data()?.userId !== userId) {
        throw new Error('Shopping list item not found or access denied');
      }

      await itemRef.delete();
    } catch (error) {
      console.error('Error deleting shopping list item:', error);
      throw error;
    }
  }

  async generateShoppingListFromMealPlan(startDate: string, endDate: string, userId: string): Promise<ShoppingListItem[]> {
    try {
      // Get all meal plans in the date range
      const mealPlans = await this.getMealPlans(userId, startDate, endDate);
      
      // Get all recipes used in the meal plans
      const recipeIds = mealPlans
        .map(plan => plan.recipeId)
        .filter(id => id !== null) as string[];
      
      if (recipeIds.length === 0) {
        return [];
      }

      // Get recipes in batches (Firestore has a limit of 10 items per 'in' query)
      const recipes: Recipe[] = [];
      for (let i = 0; i < recipeIds.length; i += 10) {
        const batch = recipeIds.slice(i, i + 10);
        const snapshot = await db.collection(COLLECTIONS.RECIPES)
          .where('userId', '==', userId)
          .where('id', 'in', batch)
          .get();
        
        recipes.push(...snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Recipe[]);
      }

      // Extract ingredients from all recipes
      const ingredients: ShoppingListItem[] = [];
      
      for (const recipe of recipes) {
        const recipeIngredientSections = recipe.ingredients || [];
        
        for (const section of recipeIngredientSections) {
          for (const item of section.items) {
            const ingredientName = item.name.trim();
            if (!ingredientName) continue;
            
            const existingItem = ingredients.find(shoppingItem => 
              shoppingItem.name.toLowerCase() === ingredientName.toLowerCase()
            );
            
            if (!existingItem) {
              const quantity = item.quantity && item.unit 
                ? `${item.quantity} ${item.unit}` 
                : item.quantity || null;
                
              const newItem: ShoppingListItem = {
                id: nanoid(),
                userId,
                name: ingredientName,
                quantity,
                category: this.categorizeIngredient(ingredientName),
                isCompleted: false,
                recipeId: recipe.id,
                createdAt: new Date(),
              };
              ingredients.push(newItem);
            }
          }
        }
      }

      return ingredients;
    } catch (error) {
      console.error('Error generating shopping list from meal plan:', error);
      return [];
    }
  }

  private cleanRecipeData(recipe: InsertRecipe): InsertRecipe {
    // Clean ingredients sections
    const cleanedIngredients = recipe.ingredients.map(section => ({
      ...(section.sectionName !== undefined && { sectionName: section.sectionName }),
      items: section.items.map(item => ({
        name: item.name,
        ...(item.quantity !== undefined && { quantity: item.quantity }),
        ...(item.unit !== undefined && { unit: item.unit }),
      }))
    }));

    // Clean instructions sections
    const cleanedInstructions = recipe.instructions.map(section => ({
      ...(section.sectionName !== undefined && { sectionName: section.sectionName }),
      steps: section.steps.map(step => ({
        text: step.text,
        ...(step.imageUrl !== undefined && { imageUrl: step.imageUrl }),
      }))
    }));

    // Return cleaned recipe with only defined values
    return {
      title: recipe.title,
      ...(recipe.description !== undefined && { description: recipe.description }),
      ...(recipe.cookTime !== undefined && { cookTime: recipe.cookTime }),
      ...(recipe.servings !== undefined && { servings: recipe.servings }),
      ...(recipe.category !== undefined && { category: recipe.category }),
      ...(recipe.difficulty !== undefined && { difficulty: recipe.difficulty }),
      rating: recipe.rating,
      ...(recipe.imageUrl !== undefined && { imageUrl: recipe.imageUrl }),
      ingredients: cleanedIngredients,
      instructions: cleanedInstructions,
      ...(recipe.sourceUrl !== undefined && { sourceUrl: recipe.sourceUrl }),
      ...(recipe.videoUrl !== undefined && { videoUrl: recipe.videoUrl }),
      isFavorite: recipe.isFavorite,
    };
  }

  private categorizeIngredient(ingredient: string): string {
    const lower = ingredient.toLowerCase();
    
    if (lower.match(/\b(beef|chicken|pork|lamb|turkey|fish|salmon|tuna|shrimp)\b/)) {
      return 'Meat & Seafood';
    }
    if (lower.match(/\b(apple|banana|orange|berry|grape|lemon|lime|avocado)\b/)) {
      return 'Fruits';
    }
    if (lower.match(/\b(carrot|onion|potato|tomato|lettuce|spinach|pepper|broccoli)\b/)) {
      return 'Vegetables';
    }
    if (lower.match(/\b(milk|cheese|yogurt|butter|cream|egg)\b/)) {
      return 'Dairy & Eggs';
    }
    if (lower.match(/\b(bread|rice|pasta|flour|oats|cereal)\b/)) {
      return 'Grains & Bakery';
    }
    if (lower.match(/\b(oil|salt|pepper|garlic|herbs|spices|sauce|vinegar)\b/)) {
      return 'Condiments & Spices';
    }
    if (lower.match(/\b(beans|lentils|nuts|seeds)\b/)) {
      return 'Pantry';
    }
    
    return 'Other';
  }
}
