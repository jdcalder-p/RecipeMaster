import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChefHat, Calendar, ShoppingCart, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <ChefHat className="h-16 w-16 text-orange-600" />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
            Recipe Manager
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Organize your recipes, plan your meals, and generate shopping lists with our intuitive recipe management system.
          </p>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            size="lg" 
            className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-3 text-lg"
          >
            Sign In to Get Started
          </Button>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          <Card className="text-center">
            <CardHeader>
              <ChefHat className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <CardTitle>Recipe Collection</CardTitle>
              <CardDescription>
                Store and organize all your favorite recipes in one place
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Import recipes from URLs</li>
                <li>• Manual recipe creation</li>
                <li>• Search and categorize</li>
                <li>• Scale ingredients by serving size</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Calendar className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <CardTitle>Meal Planning</CardTitle>
              <CardDescription>
                Plan your weekly meals and stay organized
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Weekly meal calendar</li>
                <li>• Assign recipes to meals</li>
                <li>• Breakfast, lunch, dinner planning</li>
                <li>• Change meal selections easily</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <ShoppingCart className="h-12 w-12 text-orange-600 mx-auto mb-4" />
              <CardTitle>Shopping Lists</CardTitle>
              <CardDescription>
                Generate smart shopping lists from your meal plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 space-y-2">
                <li>• Auto-generate from meal plans</li>
                <li>• Organize by categories</li>
                <li>• Check off completed items</li>
                <li>• Manual list editing</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* How It Works */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-8">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            <div className="space-y-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-orange-600 font-bold">1</span>
              </div>
              <h3 className="font-semibold">Add Recipes</h3>
              <p className="text-sm text-gray-600">Import from URLs or create manually</p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-orange-600 font-bold">2</span>
              </div>
              <h3 className="font-semibold">Plan Meals</h3>
              <p className="text-sm text-gray-600">Schedule recipes for each day</p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-orange-600 font-bold">3</span>
              </div>
              <h3 className="font-semibold">Generate List</h3>
              <p className="text-sm text-gray-600">Auto-create shopping lists</p>
            </div>
            <div className="space-y-4">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-orange-600 font-bold">4</span>
              </div>
              <h3 className="font-semibold">Shop & Cook</h3>
              <p className="text-sm text-gray-600">Follow your organized plan</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to get organized?</h2>
          <p className="text-gray-600 mb-6">Sign in with your account to start managing your recipes today.</p>
          <Button 
            onClick={() => window.location.href = '/api/login'}
            size="lg" 
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            Sign In Now
          </Button>
        </div>
      </div>
    </div>
  );
}