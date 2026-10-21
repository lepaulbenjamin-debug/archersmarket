import type { RelayPoint } from '@/services/shipping';
import type { MapRegion } from '@/components/RelayMap';

/**
 * Pas de carte sur le site, pour l'instant : la liste des points relais, juste
 * dessous, porte toute la fonction — adresse, horaires, choix. C'est déjà le
 * mode d'Android sans clé Google Maps. Une carte web demanderait une
 * bibliothèque de cartographie et un fournisseur de tuiles, à ajouter quand
 * le reste du site aura fait ses preuves.
 */
export function RelayMap(_props: {
  points: RelayPoint[];
  region: MapRegion;
  selected: RelayPoint | null;
  onSelect: (point: RelayPoint) => void;
}) {
  return null;
}
