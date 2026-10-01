import { Heart, House, Plane, Shapes } from 'lucide-react-native';

export const GROUP_TYPES = [
  { id: 'home', icon: House },
  { id: 'trip', icon: Plane },
  { id: 'couple', icon: Heart },
  { id: 'other', icon: Shapes },
];

const byId = Object.fromEntries(GROUP_TYPES.map((g) => [g.id, g]));

export function groupTypeIcon(id) {
  return (byId[id] ?? byId.other).icon;
}
