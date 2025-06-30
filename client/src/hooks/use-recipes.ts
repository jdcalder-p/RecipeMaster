import { useQuery } from "@tanstack/react-query";
import { Recipe } from "@shared/schema";
import { auth } from "@/lib/firebase";

export function useRecipes(search?: string) {
  return useQuery<Recipe[]>({
    queryKey: ['/api/recipes', search],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const url = search ? `/api/recipes?search=${encodeURIComponent(search)}` : '/api/recipes';
      
      const response = await fetch(url, {
        headers: {
          ...(token && { "Authorization": `Bearer ${token}` }),
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch recipes');
      return response.json();
    },
  });
}

export function useRecipe(id: string) {
  return useQuery<Recipe>({
    queryKey: ['/api/recipes', id],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(`/api/recipes/${id}`, {
        headers: {
          ...(token && { "Authorization": `Bearer ${token}` }),
        },
      });
      
      if (!response.ok) throw new Error('Failed to fetch recipe');
      return response.json();
    },
    enabled: !!id,
  });
}
