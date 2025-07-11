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
import { FirebaseStorage } from './firebaseStorage';

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Recipe operations
  getRecipes(userId: string): Promise<Recipe[]>;
  getRecipe(id: string, userId: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe, userId: string): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>, userId: string): Promise<Recipe>;
  deleteRecipe(id: string, userId: string): Promise<void>;
  searchRecipes(query: string, userId: string): Promise<Recipe[]>;
  
  // Meal plan operations
  getMealPlans(userId: string, startDate?: string, endDate?: string): Promise<MealPlan[]>;
  createMealPlan(mealPlan: InsertMealPlan, userId: string): Promise<MealPlan>;
  updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>, userId: string): Promise<MealPlan>;
  deleteMealPlan(id: string, userId: string): Promise<void>;
  
  // Shopping list operations
  getShoppingListItems(userId: string): Promise<ShoppingListItem[]>;
  createShoppingListItem(item: InsertShoppingListItem, userId: string): Promise<ShoppingListItem>;
  updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>, userId: string): Promise<ShoppingListItem>;
  deleteShoppingListItem(id: string, userId: string): Promise<void>;
  generateShoppingListFromMealPlan(startDate: string, endDate: string, userId: string): Promise<ShoppingListItem[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    try {
      const [user] = await db
        .insert(users)
        .values(userData)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            profileImageUrl: userData.profileImageUrl,
            updatedAt: new Date(),
          },
        })
        .returning();
      return user;
    } catch (error: any) {
      // If there's still a conflict (e.g., email already exists with different ID), try to get the existing user by ID
      if (error.code === '23505') {
        const existingUser = await this.getUser(userData.id);
        if (existingUser) {
          return existingUser;
        }
        // If email conflict but no user found by ID, we need to handle this differently
        throw new Error(`User with email ${userData.email} already exists with different ID`);
      }
      throw error;
    }
  }

  // Recipe operations
  async getRecipes(userId: string): Promise<Recipe[]> {
    return await db
      .select()
      .from(recipes)
      .where(eq(recipes.userId, userId))
      .orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: string, userId: string): Promise<Recipe | undefined> {
    const [recipe] = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
    return recipe;
  }

  async createRecipe(recipe: InsertRecipe, userId: string): Promise<Recipe> {
    const id = nanoid();
    const [newRecipe] = await db
      .insert(recipes)
      .values({
        ...recipe,
        id,
        userId,
      })
      .returning();
    return newRecipe;
  }

  async updateRecipe(id: string, recipe: Partial<InsertRecipe>, userId: string): Promise<Recipe> {
    const [updatedRecipe] = await db
      .update(recipes)
      .set(recipe)
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)))
      .returning();
    return updatedRecipe;
  }

  async deleteRecipe(id: string, userId: string): Promise<void> {
    await db
      .delete(recipes)
      .where(and(eq(recipes.id, id), eq(recipes.userId, userId)));
  }

  async searchRecipes(query: string, userId: string): Promise<Recipe[]> {
    return await db
      .select()
      .from(recipes)
      .where(
        and(
          eq(recipes.userId, userId),
          ilike(recipes.title, `%${query}%`)
        )
      )
      .orderBy(desc(recipes.createdAt));
  }

  // Meal plan operations
  async getMealPlans(userId: string, startDate?: string, endDate?: string): Promise<MealPlan[]> {
    let whereCondition = eq(mealPlans.userId, userId);

    if (startDate && endDate) {
      whereCondition = and(
        eq(mealPlans.userId, userId),
        gte(mealPlans.date, startDate),
        lte(mealPlans.date, endDate)
      )!;
    }

    return await db
      .select()
      .from(mealPlans)
      .where(whereCondition)
      .orderBy(mealPlans.date, mealPlans.mealType);
  }

  async createMealPlan(mealPlan: InsertMealPlan, userId: string): Promise<MealPlan> {
    const id = nanoid();
    const [newMealPlan] = await db
      .insert(mealPlans)
      .values({
        id,
        userId,
        ...mealPlan,
      })
      .returning();
    return newMealPlan;
  }

  async updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>, userId: string): Promise<MealPlan> {
    const [updatedMealPlan] = await db
      .update(mealPlans)
      .set(mealPlan)
      .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)))
      .returning();
    return updatedMealPlan;
  }

  async deleteMealPlan(id: string, userId: string): Promise<void> {
    await db
      .delete(mealPlans)
      .where(and(eq(mealPlans.id, id), eq(mealPlans.userId, userId)));
  }

  // Shopping list operations
  async getShoppingListItems(userId: string): Promise<ShoppingListItem[]> {
    return await db
      .select()
      .from(shoppingListItems)
      .where(eq(shoppingListItems.userId, userId))
      .orderBy(shoppingListItems.category, shoppingListItems.name);
  }

  async createShoppingListItem(item: InsertShoppingListItem, userId: string): Promise<ShoppingListItem> {
    const id = nanoid();
    const [newItem] = await db
      .insert(shoppingListItems)
      .values({
        id,
        userId,
        ...item,
      })
      .returning();
    return newItem;
  }

  async updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>, userId: string): Promise<ShoppingListItem> {
    const [updatedItem] = await db
      .update(shoppingListItems)
      .set(item)
      .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.userId, userId)))
      .returning();
    return updatedItem;
  }

  async deleteShoppingListItem(id: string, userId: string): Promise<void> {
    await db
      .delete(shoppingListItems)
      .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.userId, userId)));
  }

  async generateShoppingListFromMealPlan(startDate: string, endDate: string, userId: string): Promise<ShoppingListItem[]> {
    // Get all meal plans in the date range
    const mealPlansInRange = await this.getMealPlans(userId, startDate, endDate);
    
    // Get all recipes used in the meal plans
    const recipeIds = mealPlansInRange
      .map(plan => plan.recipeId)
      .filter(id => id !== null) as string[];
    
    if (recipeIds.length === 0) {
      return [];
    }

    const recipesData = await db
      .select()
      .from(recipes)
      .where(and(
        eq(recipes.userId, userId),
        inArray(recipes.id, recipeIds)
      ));

    // Extract ingredients from all recipes
    const ingredients: ShoppingListItem[] = [];
    
    for (const recipe of recipesData) {
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

export const storage = new FirebaseStorage();