import { useQuery } from "@tanstack/react-query";
import { ShoppingListItem } from "@shared/schema";
import { auth } from "@/lib/firebase";

export function useShoppingList() {
  return useQuery<ShoppingListItem[]>({
    queryKey: ['/api/shopping-list'],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch('/api/shopping-list', {
        headers: {
          ...(token && { "Authorization": `Bearer ${token}` }),
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch shopping list');
      return response.json();
    },
  });
}
