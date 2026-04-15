export interface Channel {
  id: string;
  name: string;
  logo?: string;
  url: string;
  category: string;
}

export interface Movie {
  id: string;
  title: string;
  poster: string;
  url: string;
  category: string;
  year?: number;
  rating?: number;
}

export interface Category {
  id: string;
  name: string;
  count: number;
}
