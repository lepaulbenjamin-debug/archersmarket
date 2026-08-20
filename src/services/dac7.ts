import { fail, supabase } from '@/services/supabase';
import type { Cents } from '@/services/payments';

/**
 * L'obligation déclarative des plateformes.
 *
 * La directive 2021/514 nous oblige à déclarer chaque année nos vendeurs à
 * l'administration fiscale. Ce n'est pas une option, mais ce n'est pas non
 * plus une raison de réclamer un numéro fiscal à tout le monde : un vendeur
 * de biens reste dispensé tant qu'il fait moins de trente ventes ET deux
 * mille euros au plus dans l'année.
 *
 * D'où ce service, qui ne sert qu'à deux choses : savoir si le vendeur est
 * concerné, et lui montrer ce qu'on déclare de lui. Tant qu'il ne l'est pas,
 * rien de tout cela ne doit apparaître à l'écran.
 *
 * Le calcul des seuils vit en base, pas ici : le client ne décide pas de ce
 * qui est déclarable.
 */
export interface Dac7Status {
  year: number;
  /** Ventes de l'année, escrow et main propre confondues. */
  sales: number;
  amount: Cents;
  salesThreshold: number;
  amountThreshold: Cents;
  /** Le seuil est franchi : la loi nous oblige à le déclarer. */
  reportable: boolean;
  /** Son dossier suffit à la déclaration. */
  complete: boolean;
  /** Quand on le lui a demandé pour la première fois, s'il l'a été. */
  askedAt: string | null;
  /** Jours laissés après la demande avant retenue du virement. */
  graceDays: number;
}

export interface TaxDetails {
  isBusiness: boolean;
  birthDate: string | null;
  birthPlace: string | null;
  legalName: string | null;
  businessNumber: string | null;
  vatNumber: string | null;
  tin: string | null;
  tinCountry: string;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string;
}

export const TAX_DETAILS_VIDES: TaxDetails = {
  isBusiness: false,
  birthDate: null,
  birthPlace: null,
  legalName: null,
  businessNumber: null,
  vatNumber: null,
  tin: null,
  tinCountry: 'FR',
  address: null,
  zip: null,
  city: null,
  country: 'FR',
};

export async function dac7Status(): Promise<Dac7Status | null> {
  const { data, error } = await supabase.rpc('dac7_status');
  if (error || !data) return null;
  const brut = data as Record<string, unknown>;
  return {
    year: Number(brut.year ?? 0),
    sales: Number(brut.sales ?? 0),
    amount: Number(brut.amount ?? 0),
    salesThreshold: Number(brut.sales_threshold ?? 0),
    amountThreshold: Number(brut.amount_threshold ?? 0),
    reportable: Boolean(brut.reportable),
    complete: Boolean(brut.complete),
    askedAt: (brut.asked_at as string) ?? null,
    graceDays: Number(brut.grace_days ?? 0),
  };
}

/** Le dossier tel qu'il est enregistré, ou des champs vides. */
export async function fetchTaxDetails(): Promise<TaxDetails> {
  const { data, error } = await supabase
    .from('seller_tax_details')
    // Une seule chaîne littérale : découpée, supabase-js perd le type de la
    // ligne et rend une erreur générique à la place des colonnes.
    .select('is_business, birth_date, birth_place, legal_name, business_number, vat_number, tin, tin_country, address, zip, city, country')
    .maybeSingle();
  if (error) fail(error, 'Dossier fiscal indisponible.');
  if (!data) return TAX_DETAILS_VIDES;
  return {
    isBusiness: Boolean(data.is_business),
    birthDate: (data.birth_date as string) ?? null,
    birthPlace: (data.birth_place as string) ?? null,
    legalName: (data.legal_name as string) ?? null,
    businessNumber: (data.business_number as string) ?? null,
    vatNumber: (data.vat_number as string) ?? null,
    tin: (data.tin as string) ?? null,
    tinCountry: (data.tin_country as string) ?? 'FR',
    address: (data.address as string) ?? null,
    zip: (data.zip as string) ?? null,
    city: (data.city as string) ?? null,
    country: (data.country as string) ?? 'FR',
  };
}

export async function saveTaxDetails(details: TaxDetails): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const id = session.user?.id;
  if (!id) fail(new Error('Aucune session.'), 'Connexion requise.');

  const vide = (valeur: string | null) => (valeur?.trim() ? valeur.trim() : null);
  const { error } = await supabase.from('seller_tax_details').upsert({
    user_id: id,
    is_business: details.isBusiness,
    // Les champs de l'autre régime sont effacés plutôt que laissés traîner :
    // un ancien SIREN sur un dossier redevenu particulier serait déclaré.
    birth_date: details.isBusiness ? null : vide(details.birthDate),
    birth_place: details.isBusiness ? null : vide(details.birthPlace),
    legal_name: details.isBusiness ? vide(details.legalName) : null,
    business_number: details.isBusiness ? vide(details.businessNumber) : null,
    vat_number: details.isBusiness ? vide(details.vatNumber) : null,
    tin: vide(details.tin),
    tin_country: details.tinCountry || 'FR',
    address: vide(details.address),
    zip: vide(details.zip),
    city: vide(details.city),
    country: details.country || 'FR',
    submitted_at: new Date().toISOString(),
  });
  if (error) fail(error, 'Enregistrement du dossier impossible.');
}

export interface Dac7Quarter {
  trimestre: number;
  ventes_escrow: number;
  montant_escrow: Cents;
  frais_escrow: Cents;
  ventes_direct: number;
  montant_direct: Cents;
}

/** Ce qui a été déclaré au sujet du vendeur : la loi veut qu'on le lui dise. */
export async function dac7Statement(year: number): Promise<Dac7Quarter[]> {
  const { data, error } = await supabase.rpc('dac7_statement', { annee: year });
  if (error || !data) return [];
  const quarters = (data as { quarters?: unknown }).quarters;
  return Array.isArray(quarters) ? (quarters as Dac7Quarter[]) : [];
}
