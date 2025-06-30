import { useQuery } from "@tanstack/react-query";
import { Recipe } from "@shared/schema";

export function useRecipes(search?: string) {
  return useQuery<Recipe[]>({
    queryKey: ['/api/recipes', search],
    queryFn: async () => {
      const url = search ? `/api/recipes?search=${encodeURIComponent(search)}` : '/api/recipes';
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch recipes');
      return response.json();
    },
  });
}

export function useRecipe(id: string) {
  return useQuery<Recipe>({
    queryKey: ['/api/recipes', id],
    queryFn: async () => {
      const response = await fetch(`/api/recipes/${id}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch recipe');
      return response.json();
    },
    enabled: !!id,
  });
}
