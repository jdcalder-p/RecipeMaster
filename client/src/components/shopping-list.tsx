import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Share, Trash2 } from "lucide-react";
import { useShoppingList } from "@/hooks/use-shopping-list";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ShoppingListItem } from "@shared/schema";

interface GroupedItems {
  [category: string]: ShoppingListItem[];
}

const categoryIcons: { [key: string]: string } = {
  'Produce': '🥕',
  'Dairy & Eggs': '🧀',
  'Meat & Seafood': '🥩',
  'Pantry': '🥫',
  'Other': '📦',
};

export function ShoppingList() {
  const { data: items = [], isLoading } = useShoppingList();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggleItemMutation = useMutation({
    mutationFn: async ({ id, isCompleted }: { id: string, isCompleted: boolean }) => {
      return apiRequest("PUT", `/api/shopping-list/${id}`, { isCompleted });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/shopping-list/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
      toast({
        title: "Item deleted",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    },
  });

  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      const completedItems = items.filter(item => item.isCompleted);
      return Promise.all(
        completedItems.map(item => apiRequest("DELETE", `/api/shopping-list/${item.id}`))
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
      toast({
        title: "Completed items cleared",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear completed items",
        variant: "destructive",
      });
    },
  });

  // Group items by category
  const groupedItems = items.reduce<GroupedItems>((acc, item) => {
    const category = item.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  const handleShare = async () => {
    const shoppingListText = Object.entries(groupedItems)
      .map(([category, categoryItems]) => {
        const itemsText = categoryItems
          .map(item => `${item.isCompleted ? '✓' : '○'} ${item.name}`)
          .join('\n');
        return `${category}:\n${itemsText}`;
      })
      .join('\n\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Shopping List',
          text: shoppingListText,
        });
      } catch (error) {
        // Fallback to clipboard
        await navigator.clipboard.writeText(shoppingListText);
        toast({
          title: "Copied to clipboard",
          description: "Shopping list copied to clipboard",
        });
      }
    } else {
      await navigator.clipboard.writeText(shoppingListText);
      toast({
        title: "Copied to clipboard",
        description: "Shopping list copied to clipboard",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Shopping List</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-gray-200 rounded w-1/3"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const completedCount = items.filter(item => item.isCompleted).length;
  const totalCount = items.length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Shopping List</h2>
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            onClick={() => clearCompletedMutation.mutate()}
            disabled={completedCount === 0 || clearCompletedMutation.isPending}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear Completed
          </Button>
          <Button
            onClick={handleShare}
            disabled={totalCount === 0}
          >
            <Share className="h-4 w-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {totalCount === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🛒</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Your shopping list is empty</h3>
          <p className="text-gray-600">
            Add recipes to your meal plan to automatically generate a shopping list, or add items manually.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border p-4 mb-6">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                Progress: {completedCount} of {totalCount} items completed
              </span>
              <span className="text-sm font-medium text-gray-900">
                {Math.round((completedCount / totalCount) * 100)}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-secondary h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {Object.entries(groupedItems).map(([category, categoryItems]) => (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center space-x-2">
                      <span>{categoryIcons[category] || '📦'}</span>
                      <span>{category}</span>
                    </span>
                    <span className="text-sm text-gray-500 font-normal">
                      {categoryItems.length} items
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {categoryItems.map((item) => (
                      <div key={item.id} className="flex items-center space-x-3 group">
                        <Checkbox
                          checked={item.isCompleted}
                          onCheckedChange={(checked) => 
                            toggleItemMutation.mutate({ 
                              id: item.id, 
                              isCompleted: checked as boolean 
                            })
                          }
                          disabled={toggleItemMutation.isPending}
                        />
                        <span className={`flex-1 ${item.isCompleted ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                          {item.name}
                        </span>
                        <span className={`text-sm ${item.isCompleted ? 'text-gray-400' : 'text-gray-500'}`}>
                          {item.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          disabled={deleteItemMutation.isPending}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
