import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Utensils, Search, ShoppingCart, Plus, Calendar, ChefHat } from "lucide-react";
import { RecipeCard } from "@/components/recipe-card";
import { AddRecipeModal } from "@/components/add-recipe-modal";
import { EditRecipeModal } from "@/components/edit-recipe-modal";
import { RecipeDetailModal } from "@/components/recipe-detail-modal";
import { MealPlanning } from "@/components/meal-planning";
import { ShoppingList } from "@/components/shopping-list";
import { useRecipes } from "@/hooks/use-recipes";
import { useShoppingList } from "@/hooks/use-shopping-list";
import { useAuth } from "@/hooks/useAuth";
import { Recipe } from "@shared/schema";

type Tab = "recipes" | "meal-planning" | "shopping";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("recipes");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All Categories");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const { user, logout } = useAuth();
  const { data: recipes = [], isLoading } = useRecipes(searchQuery);
  const { data: shoppingListItems = [] } = useShoppingList();

  const categories = ["All Categories", "Breakfast", "Lunch", "Dinner", "Dessert", "Snacks"];

  const filteredRecipes = recipes.filter(recipe => {
    if (selectedCategory !== "All Categories" && recipe.category !== selectedCategory) {
      return false;
    }
    return true;
  });

  const shoppingListCount = shoppingListItems.filter(item => !item.isCompleted).length;

  const handleViewRecipe = (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setShowDetailModal(true);
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setShowEditModal(true);
    setShowDetailModal(false);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case "recipes":
        return (
          <div className="space-y-8">
            {/* Filters and Sort */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <select 
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  {categories.map(category => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <span>{filteredRecipes.length} recipes</span>
              </div>
            </div>

            {/* Recipe Grid */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 animate-pulse">
                    <div className="w-full h-48 bg-gray-200 rounded-t-xl"></div>
                    <div className="p-4 space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-full"></div>
                      <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredRecipes.length === 0 ? (
              <div className="text-center py-12">
                <ChefHat className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No recipes found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery ? "Try adjusting your search terms" : "Get started by adding your first recipe"}
                </p>
                <div className="mt-6">
                  <Button onClick={() => setShowAddModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Recipe
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredRecipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onViewRecipe={handleViewRecipe}
                  />
                ))}
              </div>
            )}
          </div>
        );
      case "meal-planning":
        return <MealPlanning />;
      case "shopping":
        return <ShoppingList />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Utensils className="text-primary text-2xl" />
                <h1 className="text-2xl font-bold text-gray-900">Recipe Master</h1>
              </div>
            </div>
            
            <div className="flex-1 max-w-lg mx-8">
              <div className="relative">
                <Input
                  type="text"
                  placeholder="Search recipes, ingredients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                className="relative"
                onClick={() => setActiveTab("shopping")}
              >
                <ShoppingCart className="h-5 w-5" />
                {shoppingListCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
                    {shoppingListCount}
                  </Badge>
                )}
              </Button>
              <Button onClick={() => setShowAddModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Add Recipe</span>
              </Button>
              
              {/* User Info */}
              <div className="flex items-center space-x-3">
                {user?.photoURL && (
                  <img 
                    src={user.photoURL} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover"
                  />
                )}
                <div className="hidden sm:block text-sm">
                  <p className="text-gray-900 font-medium">
                    {user?.displayName || user?.email || 'User'}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Sign Out
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg mb-8 w-fit">
          <Button
            variant={activeTab === "recipes" ? "default" : "ghost"}
            onClick={() => setActiveTab("recipes")}
            className="px-6 py-2"
          >
            <ChefHat className="h-4 w-4 mr-2" />
            Recipes
          </Button>
          <Button
            variant={activeTab === "meal-planning" ? "default" : "ghost"}
            onClick={() => setActiveTab("meal-planning")}
            className="px-6 py-2"
          >
            <Calendar className="h-4 w-4 mr-2" />
            Meal Planning
          </Button>
          <Button
            variant={activeTab === "shopping" ? "default" : "ghost"}
            onClick={() => setActiveTab("shopping")}
            className="px-6 py-2"
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Shopping List
          </Button>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>

      {/* Modals */}
      <AddRecipeModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
      />

      <RecipeDetailModal
        recipe={selectedRecipe}
        open={showDetailModal}
        onOpenChange={setShowDetailModal}
        onEditRecipe={handleEditRecipe}
      />

      <EditRecipeModal
        recipe={editingRecipe}
        open={showEditModal}
        onOpenChange={setShowEditModal}
      />

      {/* Floating Action Button for Mobile */}
      <Button
        className="fixed bottom-6 right-6 rounded-full shadow-lg md:hidden h-14 w-14"
        onClick={() => setShowAddModal(true)}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}
