import {
  Bed,
  Car,
  House,
  Shapes,
  ShoppingCart,
  Ticket,
  UtensilsCrossed,
  Zap,
} from 'lucide-react-native';

export const CATEGORIES = [
  { id: 'market', icon: ShoppingCart },
  { id: 'food', icon: UtensilsCrossed },
  { id: 'bills', icon: Zap },
  { id: 'home', icon: House },
  { id: 'transport', icon: Car },
  { id: 'stay', icon: Bed },
  { id: 'fun', icon: Ticket },
  { id: 'other', icon: Shapes },
];

const byId = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function categoryIcon(id) {
  return (byId[id] ?? byId.other).icon;
}
