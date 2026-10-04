export interface IngredientDef {
  id: string;
  name: string;
  color: number;
}

const list: IngredientDef[] = [
  { id: 'eggs', name: 'Eggs', color: 0xfff2cc },
  { id: 'flour', name: 'Flour', color: 0xf3f3f3 },
  { id: 'milk', name: 'Milk', color: 0xddeeff },
  { id: 'beef', name: 'Beef', color: 0xcc4125 },
  { id: 'buns', name: 'Buns', color: 0xe69138 },
  { id: 'onions', name: 'Onions', color: 0xd5a6bd },
  { id: 'carrots', name: 'Carrots', color: 0xff9900 },
  { id: 'stock', name: 'Stock', color: 0xbf9000 },
  { id: 'chicken', name: 'Chicken', color: 0xf9cb9c },
  { id: 'potatoes', name: 'Potatoes', color: 0xb45f06 },
  { id: 'pasta', name: 'Pasta', color: 0xffe599 },
  { id: 'tomatoes', name: 'Tomatoes', color: 0xe06666 },
  { id: 'cheese', name: 'Cheese', color: 0xffd966 },
];

export const INGREDIENTS: Record<string, IngredientDef> = Object.fromEntries(list.map((i) => [i.id, i]));
