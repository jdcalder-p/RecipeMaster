import { useQuery } from "@tanstack/react-query";
import { ShoppingListItem } from "@shared/schema";

export function useShoppingList() {
  return useQuery<ShoppingListItem[]>({
    queryKey: ['/api/shopping-list'],
    queryFn: async () => {
      const response = await fetch('/api/shopping-list', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch shopping list');
      return response.json();
    },
  });
}
