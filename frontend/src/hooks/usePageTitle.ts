import { useEffect } from "react";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} | TourneePro`;
    return () => {
      document.title = "TourneePro";
    };
  }, [title]);
}
