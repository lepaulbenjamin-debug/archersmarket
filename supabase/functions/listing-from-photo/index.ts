/**
 * Remplit un brouillon d'annonce à partir d'une photo.
 *
 * Le modèle ne rédige pas une annonce libre : on lui impose notre taxonomie —
 * dix-sept catégories, quatre-vingts marques, cinq états — et un schéma JSON
 * strict. Il choisit dans nos listes ou ne choisit rien. C'est ce qui empêche
 * une annonce « Arc Hoyt Formula » de se retrouver dans une catégorie qui
 * n'existe pas, ou avec une marque inventée que la recherche ne trouvera
 * jamais.
 *
 * Trois choses qu'il ne fait délibérément pas :
 *
 * 1. Il ne décide pas de la latéralité. Elle se lit sur une photo, et elle
 *    s'inverse sur une prise de vue de l'autre côté. Une poignée annoncée
 *    droitière alors qu'elle est gauchère est inutilisable pour l'acheteur,
 *    donc c'est au vendeur de répondre.
 * 2. Il ne devine pas les caractéristiques techniques. La puissance et le
 *    spine sont sérigraphiés ; s'ils ne se lisent pas sur la photo, le champ
 *    reste vide. Un formulaire à moitié rempli et juste vaut mieux qu'un
 *    formulaire complet et faux, d'autant que ces chiffres touchent à la
 *    sécurité.
 * 3. Il ne fixe pas de prix. Celui-là vient de nos propres annonces, calculé
 *    en base — voir `price_suggestion`.
 *
 * Rien n'est publié : la réponse est un brouillon que le vendeur relit.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.116.0';

import { CORS, callerId, json, serviceClient } from '../_shared/context.ts';

/** Le seul modèle capable de lire « Formula Xceed » sur une poignée. */
const MODELE = 'claude-opus-5';

/**
 * Une photo suffit.
 *
 * Chaque image coûte jusqu'à quelques milliers de jetons d'entrée ; en
 * accepter trois triplerait la facture pour un gain qui n'est pas démontré.
 */
const TAILLE_MAX = 6 * 1024 * 1024;

interface Brouillon {
  is_archery_equipment: boolean;
  damage_visible: boolean;
  category: string;
  brand: string;
  model_name: string;
  condition: string;
  title: string;
  description: string;
  draw_weight: string;
  bow_length: string;
  draw_length: string;
  spine: string;
  size: string;
  damage: string;
}

const CONSIGNE = `Tu remplis le brouillon d'une annonce d'occasion sur une place de marché française dédiée au tir à l'arc, à partir d'une photo de matériel.

Règles, dans l'ordre d'importance :

1. Ne remplis un champ que si la photo le montre. Un champ vide est un bon résultat ; une supposition présentée comme un fait ne l'est pas. Le vendeur relira et complétera.
2. Les caractéristiques techniques (puissance en livres, longueur, allonge, spine, taille) ne se déduisent pas : elles ne se remplissent que si tu **lis** l'inscription sur la photo. Sinon, chaîne vide.
3. La marque et l'état doivent venir des listes imposées. Si la marque n'est pas lisible ou n'est pas dans la liste, réponds "Autre".
4. Le titre fait moins de 70 caractères, en français, et suit la forme « Marque Modèle, précision utile » — sans majuscules superflues ni point final.
5. La description fait deux ou trois phrases : ce que c'est, ce que la photo montre de son état, ce qu'un acheteur doit savoir. Pas de superlatif, pas d'invention, pas de prix.
6. "is_archery_equipment" est faux dès que la photo ne montre pas du matériel de tir à l'arc à vendre : une personne, un paysage, une illustration, une estampe, un écran. Dans ce cas remplis le reste comme tu peux, il sera ignoré.
7. "damage_visible" n'est vrai que si tu vois un dommage qui touche à la sécurité : branche délaminée, poignée fendue, arc fendu, corde effilochée. Ne remplis "damage" que dans ce cas, en une phrase française. Quand "damage_visible" est faux, "damage" doit être la chaîne vide — n'y écris jamais autre chose.
8. Ne déduis jamais la latéralité (droitier / gaucher). Ce champ n'existe pas dans ta réponse : c'est voulu.`;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const cle = Deno.env.get('ANTHROPIC_API_KEY');
    if (!cle) {
      return json({ error: 'L’analyse de photo n’est pas encore activée.' }, 503);
    }

    const userId = await callerId(request);
    if (!userId) return json({ error: 'Connexion requise.' }, 401);

    const { photo, mimeType } = await request.json();
    if (typeof photo !== 'string' || photo.length < 100) {
      return json({ error: 'Photo illisible.' }, 400);
    }
    if (photo.length > TAILLE_MAX) {
      return json({ error: 'Photo trop lourde : reprenez-la en qualité moindre.' }, 413);
    }

    const type = ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)
      ? mimeType
      : 'image/jpeg';

    const db = serviceClient();

    // La taxonomie vient de la base, pas d'une copie tenue à la main ici :
    // ajouter une catégorie ne doit pas obliger à penser à ce fichier.
    const { data: taxonomie, error: taxonomieError } = await db.rpc('listing_taxonomy');
    if (taxonomieError || !taxonomie) throw new Error('Taxonomie indisponible.');
    const { categories, conditions, brands } = taxonomie as {
      categories: string[];
      conditions: string[];
      brands: string[];
    };

    // Le quota se réserve avant l'appel, pas après : c'est l'appel qui coûte,
    // et deux requêtes simultanées ne doivent pas passer toutes les deux.
    const { data: reservation, error: quotaError } = await db.rpc('claim_photo_analysis', {
      member: userId,
    });
    if (quotaError) return json({ error: quotaError.message }, 429);
    const { id: analyseId, left: restant } = reservation as { id: string; left: number };

    const anthropic = new Anthropic({ apiKey: cle });

    const reponse = await anthropic.messages.create({
      model: MODELE,
      max_tokens: 4000,
      // La tâche est une lecture, pas un raisonnement : au plus bas, elle
      // coûte moins et répond plus vite sans rien perdre.
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: schemaDuBrouillon(categories, conditions, brands),
        },
      },
      system: CONSIGNE,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: photo } },
            { type: 'text', text: 'Remplis le brouillon pour ce matériel.' },
          ],
        },
      ],
    });

    const texte = reponse.content.find((bloc) => bloc.type === 'text');
    if (!texte || texte.type !== 'text') throw new Error('Réponse illisible du modèle.');
    const brut = JSON.parse(texte.text) as Brouillon;

    // Une photo qui ne montre pas de matériel ne donne pas d'annonce, et ne
    // se facture pas au vendeur : l'analyse réservée plus haut est rendue.
    // Éprouvé sur une estampe japonaise d'un atelier de flèches, que le
    // modèle rangeait consciencieusement dans « Flèches & tubes ».
    if (!brut.is_archery_equipment) {
      await db.from('photo_analyses').delete().eq('id', analyseId);
      return json(
        {
          error: 'Cette photo ne montre pas de matériel de tir à l’arc. Reprenez-la de plus près.',
          notEquipment: true,
        },
        422,
      );
    }

    // Deuxième filet, après le schéma : on ne fait confiance ni à l'un ni à
    // l'autre seul. Tout ce qui n'est pas dans nos listes disparaît.
    const dansLaListe = (valeur: string, liste: string[]) =>
      liste.includes(valeur) ? valeur : null;

    const category = dansLaListe(brut.category, categories);
    const brand = dansLaListe(brut.brand, brands);

    // Sur la ligne réservée plus haut, nommément : PostgREST ne sait pas
    // trier ni limiter une mise à jour, et un `eq('user_id', …)` seul aurait
    // réécrit tout l'historique du membre.
    await db.from('photo_analyses').update({ category }).eq('id', analyseId);

    const { data: prix } = category
      ? await db.rpc('price_suggestion', {
          wanted_category: category,
          wanted_brand: brand,
        })
      : { data: null };

    return json({
      category,
      brand,
      condition: dansLaListe(brut.condition, conditions),
      title: String(brut.title ?? '').slice(0, 80).trim(),
      description: String(brut.description ?? '').trim(),
      specs: {
        drawWeight: brut.draw_weight?.trim() || null,
        bowLength: brut.bow_length?.trim() || null,
        drawLength: brut.draw_length?.trim() || null,
        spine: brut.spine?.trim() || null,
        size: brut.size?.trim() || null,
      },
      damage: dommageLisible(brut),
      price: Array.isArray(prix) && prix.length > 0 ? prix[0] : null,
      analysesLeft: Number(restant ?? 0),
    });
  } catch (error) {
    console.error('listing-from-photo', error);
    return json({ error: (error as Error).message }, 400);
  }
});

/**
 * Le texte du dommage, ou rien.
 *
 * Ce champ est le seul qui ressorte à l'écran comme un avertissement de
 * sécurité, et c'est celui où le modèle a produit du charabia — « Dracontin
 * чasteлив » sur une photo sans le moindre défaut. Un champ obligatoire qu'on
 * n'a rien à remplir invite à le remplir quand même : on exige donc un booléen
 * à côté, et on jette tout ce qui ne ressemble pas à une phrase française.
 */
function dommageLisible(brouillon: Brouillon): string | null {
  if (!brouillon.damage_visible) return null;
  const texte = (brouillon.damage ?? '').trim();
  if (texte.length < 10 || texte.length > 300) return null;
  // Lettres latines, chiffres et ponctuation courante : rien d'autre.
  if (!/^[\p{Script=Latin}\p{N}\s.,;:'’()«»°%/-]+$/u.test(texte)) return null;
  return texte;
}

/**
 * Le schéma que le modèle est contraint de remplir.
 *
 * Les énumérations font le gros du travail : une catégorie hors liste n'est
 * pas seulement écartée après coup, elle est impossible à produire.
 */
function schemaDuBrouillon(categories: string[], conditions: string[], brands: string[]) {
  const texte = (description: string) => ({ type: 'string', description });

  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'is_archery_equipment', 'category', 'brand', 'model_name', 'condition',
      'title', 'description', 'draw_weight', 'bow_length', 'draw_length',
      'spine', 'size', 'damage_visible', 'damage',
    ],
    properties: {
      is_archery_equipment: {
        type: 'boolean',
        description: 'Vrai seulement si la photo montre du matériel de tir à l’arc à vendre.',
      },
      damage_visible: {
        type: 'boolean',
        description: 'Vrai seulement si un dommage touchant à la sécurité est visible.',
      },
      category: { type: 'string', enum: categories, description: 'La catégorie du matériel.' },
      brand: {
        type: 'string',
        enum: brands,
        description: 'La marque lue sur le matériel, ou « Autre » si illisible ou absente de la liste.',
      },
      model_name: texte('Le modèle, s’il est lisible. Chaîne vide sinon.'),
      condition: {
        type: 'string',
        enum: conditions,
        description: 'L’état apparent, d’après les marques d’usage visibles.',
      },
      title: texte('Titre de l’annonce, moins de 70 caractères.'),
      description: texte('Deux ou trois phrases en français.'),
      draw_weight: texte('Puissance en livres, uniquement si elle est lisible sur la photo.'),
      bow_length: texte('Longueur en pouces, uniquement si elle est lisible sur la photo.'),
      draw_length: texte('Allonge en pouces, uniquement si elle est lisible sur la photo.'),
      spine: texte('Spine des tubes, uniquement s’il est lisible sur la photo.'),
      size: texte('Taille, uniquement si elle est lisible sur la photo.'),
      damage: texte('Le dommage en une phrase française, uniquement si « damage_visible » est vrai. Chaîne vide sinon.'),
    },
  };
}
