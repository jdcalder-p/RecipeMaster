import { useQuery } from "@tanstack/react-query";
import { MealPlan } from "@shared/schema";

export function useMealPlan(startDate?: string, endDate?: string) {
  return useQuery<MealPlan[]>({
    queryKey: ['/api/meal-plans', startDate, endDate],
    queryFn: async () => {
      let url = '/api/meal-plans';
      const params = new URLSearchParams();
      
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      
      if (params.toString()) {
        url += `?${params.toString()}`;
      }
      
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch meal plans');
      return response.json();
    },
  });
}
