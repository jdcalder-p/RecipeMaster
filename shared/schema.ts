import {
  pgTable,
  text,
  varchar,
  serial,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const recipes = pgTable("recipes", {
  id: text("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  description: text("description"),
  cookTime: text("cook_time"),
  servings: integer("servings"),
  category: text("category"),
  difficulty: text("difficulty"),
  rating: integer("rating").default(0),
  imageUrl: text("image_url"),
  ingredients: jsonb("ingredients").$type<{
    sectionName?: string;
    items: {
      name: string;
      quantity?: string;
      unit?: string;
    }[];
  }[]>().notNull().default([]),
  instructions: jsonb("instructions").$type<{
    text: string;
    imageUrl?: string;
  }[]>().notNull().default([]),
  sourceUrl: text("source_url"),
  videoUrl: text("video_url"),
  isFavorite: boolean("is_favorite").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const mealPlans = pgTable("meal_plans", {
  id: text("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  date: text("date").notNull(), // YYYY-MM-DD format
  mealType: text("meal_type").notNull(), // breakfast, lunch, dinner
  recipeId: text("recipe_id").references(() => recipes.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: text("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  quantity: text("quantity"),
  category: text("category"),
  isCompleted: boolean("is_completed").default(false),
  recipeId: text("recipe_id").references(() => recipes.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertMealPlanSchema = createInsertSchema(mealPlans).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export const insertShoppingListItemSchema = createInsertSchema(shoppingListItems).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type MealPlan = typeof mealPlans.$inferSelect;
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type InsertShoppingListItem = z.infer<typeof insertShoppingListItemSchema>;
