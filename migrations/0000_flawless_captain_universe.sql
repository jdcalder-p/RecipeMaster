CREATE TABLE "meal_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"meal_type" text NOT NULL,
	"recipe_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"cook_time" text,
	"servings" integer,
	"category" text,
	"difficulty" text,
	"rating" integer DEFAULT 0,
	"image_url" text,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"instructions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"is_favorite" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"quantity" text,
	"category" text,
	"is_completed" boolean DEFAULT false,
	"recipe_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;