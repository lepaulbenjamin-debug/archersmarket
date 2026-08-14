import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';

/**
 * Choisir une date, sans clavier.
 *
 * Un champ de texte demandait « 2026-08-15 », ce que personne n'écrit
 * spontanément en France, et qui obligeait à taper onze caractères au pavé
 * numérique pour dire « samedi prochain ». Le calendrier supprime la saisie et
 * la question du format en même temps.
 *
 * L'ISO reste la valeur échangée — c'est ce que la colonne `date` de Postgres
 * attend, et c'est la seule écriture qui se trie correctement. Il ne s'affiche
 * simplement plus.
 *
 * Les noms de mois sont écrits ici plutôt que confiés à `toLocaleDateString` :
 * l'application est française pour tout le monde, y compris pour un archer
 * dont le téléphone est en anglais.
 */
const MOIS = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
] as const;

const JOURS = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
] as const;

/** La semaine commence le lundi : c'est ainsi qu'on lit un calendrier ici. */
const ENTETES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

const deuxChiffres = (valeur: number): string => String(valeur).padStart(2, '0');

/**
 * Le jour d'aujourd'hui, tel que le lit celui qui tient le téléphone.
 *
 * `toISOString()` renverrait la date UTC : à minuit et demi en France, elle
 * désigne encore la veille, et un trajet déclaré pour ce soir serait refusé
 * comme passé.
 */
export function isoAujourdhui(): string {
  const maintenant = new Date();
  return `${maintenant.getFullYear()}-${deuxChiffres(maintenant.getMonth() + 1)}-${deuxChiffres(maintenant.getDate())}`;
}

/** « samedi 15 août 2026 ». Rend la chaîne vide telle quelle. */
export function dateEnFrancais(iso: string): string {
  const [annee, mois, jour] = iso.split('-').map(Number);
  if (!annee || !mois || !jour) return '';
  // UTC de bout en bout : construire la date en heure locale la décalerait
  // d'un jour dans les fuseaux à l'ouest de Greenwich.
  const repere = new Date(Date.UTC(annee, mois - 1, jour));
  return `${JOURS[repere.getUTCDay()]} ${jour} ${MOIS[mois - 1]} ${annee}`;
}

interface Props {
  label: string;
  /** Toujours en ISO `AAAA-MM-JJ`, ou vide tant que rien n'est choisi. */
  value: string;
  onChange: (iso: string) => void;
  /** Première date choisissable, ISO. Par défaut : aujourd'hui. */
  min?: string;
  /** Dernière date choisissable, ISO. Par défaut : un an plus tard. */
  max?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
}

export function DateField({
  label, value, onChange, min, max, placeholder = 'Choisir une date', hint, error,
}: Props) {
  const [ouvert, setOuvert] = useState(false);

  const borneBasse = min ?? isoAujourdhui();
  const borneHaute = max ?? unAnApres(borneBasse);

  // Le calendrier s'ouvre sur le mois de la date retenue, ou sur le premier
  // mois utile : personne ne veut feuilleter depuis janvier.
  const [curseur, setCurseur] = useState(() => moisDe(value || borneBasse));

  const ouvrir = () => {
    setCurseur(moisDe(value || borneBasse));
    setOuvert(true);
  };

  const choisir = (iso: string) => {
    onChange(iso);
    setOuvert(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${label} : ${dateEnFrancais(value)}` : label}
        onPress={ouvrir}
        style={[styles.input, !!error && styles.inputError]}
      >
        <Text style={[styles.valeur, !value && styles.placeholder]}>
          {value ? dateEnFrancais(value) : placeholder}
        </Text>
        <MaterialCommunityIcons name="calendar-month-outline" size={20} color={colors.textFaint} />
      </Pressable>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}

      <Modal visible={ouvert} animationType="slide" transparent onRequestClose={() => setOuvert(false)}>
        <View style={styles.backdrop}>
          <Pressable
            style={styles.backdropTouch}
            onPress={() => setOuvert(false)}
            accessibilityLabel="Fermer le calendrier"
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />

            <Mois
              curseur={curseur}
              onCurseur={setCurseur}
              min={borneBasse}
              max={borneHaute}
              choisi={value}
              onChoisir={choisir}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// La grille
// ---------------------------------------------------------------------------

function Mois({
  curseur, onCurseur, min, max, choisi, onChoisir,
}: {
  curseur: { annee: number; mois: number };
  onCurseur: (mois: { annee: number; mois: number }) => void;
  min: string;
  max: string;
  choisi: string;
  onChoisir: (iso: string) => void;
}) {
  const { annee, mois } = curseur;

  const cases = useMemo(() => {
    // `getUTCDay()` compte à partir de dimanche ; on décale d'un cran pour
    // aligner sur une semaine qui commence le lundi.
    const decalage = (new Date(Date.UTC(annee, mois, 1)).getUTCDay() + 6) % 7;
    const nombreDeJours = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
    const grille: Array<string | null> = Array(decalage).fill(null);
    for (let jour = 1; jour <= nombreDeJours; jour += 1) {
      grille.push(`${annee}-${deuxChiffres(mois + 1)}-${deuxChiffres(jour)}`);
    }
    return grille;
  }, [annee, mois]);

  // Comparer les mois en `AAAA-MM` suffit, et évite d'avoir à raisonner sur le
  // dernier jour du mois pour savoir si une flèche a encore un sens.
  const courant = `${annee}-${deuxChiffres(mois + 1)}`;
  const reculPossible = courant > min.slice(0, 7);
  const avancePossible = courant < max.slice(0, 7);

  const deplacer = (pas: number) => {
    const repere = new Date(Date.UTC(annee, mois + pas, 1));
    onCurseur({ annee: repere.getUTCFullYear(), mois: repere.getUTCMonth() });
  };

  return (
    <>
      <View style={styles.entete}>
        <Fleche
          nom="chevron-left"
          libelle="Mois précédent"
          actif={reculPossible}
          onPress={() => deplacer(-1)}
        />
        <Text style={styles.moisTitre}>{`${MOIS[mois]} ${annee}`}</Text>
        <Fleche
          nom="chevron-right"
          libelle="Mois suivant"
          actif={avancePossible}
          onPress={() => deplacer(1)}
        />
      </View>

      <View style={styles.semaine}>
        {ENTETES.map((lettre, position) => (
          // Trois lettres se répètent dans la semaine : la position sert de clé.
          <Text key={`${lettre}${position}`} style={styles.jourEntete}>
            {lettre}
          </Text>
        ))}
      </View>

      <View style={styles.grille}>
        {cases.map((iso, position) => {
          if (!iso) return <View key={`vide${position}`} style={styles.case} />;

          const horsBornes = iso < min || iso > max;
          const actif = iso === choisi;
          const numero = Number(iso.slice(8));

          return (
            <Pressable
              key={iso}
              accessibilityRole="button"
              accessibilityState={{ selected: actif, disabled: horsBornes }}
              accessibilityLabel={dateEnFrancais(iso)}
              disabled={horsBornes}
              onPress={() => onChoisir(iso)}
              style={styles.case}
            >
              <View style={[styles.jour, actif && styles.jourActif]}>
                <Text
                  style={[
                    styles.jourTexte,
                    horsBornes && styles.jourEteint,
                    actif && styles.jourTexteActif,
                  ]}
                >
                  {numero}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function Fleche({
  nom, libelle, actif, onPress,
}: {
  nom: 'chevron-left' | 'chevron-right';
  libelle: string;
  actif: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={libelle}
      accessibilityState={{ disabled: !actif }}
      disabled={!actif}
      onPress={onPress}
      hitSlop={8}
      style={styles.fleche}
    >
      <MaterialCommunityIcons
        name={nom}
        size={26}
        color={actif ? colors.text : colors.border}
      />
    </Pressable>
  );
}

const moisDe = (iso: string) => ({
  annee: Number(iso.slice(0, 4)),
  mois: Number(iso.slice(5, 7)) - 1,
});

const unAnApres = (iso: string): string => {
  const [annee, mois, jour] = iso.split('-').map(Number);
  const repere = new Date(Date.UTC(annee + 1, mois - 1, jour));
  return repere.toISOString().slice(0, 10);
};

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: colors.text },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 13,
  },
  inputError: { borderColor: colors.danger },
  valeur: { flex: 1, fontSize: 15, color: colors.text },
  placeholder: { color: colors.textFaint },
  hint: { fontSize: 12, color: colors.textFaint },
  error: { fontSize: 12, color: colors.danger, fontWeight: '600' },

  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  backdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  fleche: { padding: spacing.xs },
  moisTitre: { fontSize: 17, fontWeight: '800', color: colors.text, textTransform: 'capitalize' },
  semaine: { flexDirection: 'row' },
  jourEntete: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textFaint,
    paddingBottom: spacing.sm,
  },
  grille: { flexDirection: 'row', flexWrap: 'wrap' },
  case: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  jour: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jourActif: { backgroundColor: colors.primary },
  jourTexte: { fontSize: 15, color: colors.text },
  jourEteint: { color: colors.border },
  jourTexteActif: { color: colors.onPrimary, fontWeight: '800' },
});
