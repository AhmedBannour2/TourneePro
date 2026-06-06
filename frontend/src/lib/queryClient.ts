import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds — operational data changes frequently
      gcTime: 1000 * 60 * 5, // keep cache for 5 min after component unmounts
      refetchOnWindowFocus: true, // re-fetch when dispatcher switches tabs
      retry: 1,
    },
  },
});
