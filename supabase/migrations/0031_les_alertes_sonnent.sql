-- Les alertes ne sonnaient pas, et rien ne le disait.
--
-- Deux fautes, dont la seconde est la plus instructive.
--
-- La première : la boucle déclarait sa variable en `record`, et PostgreSQL
-- refuse de convertir un `record` en type de table — « cannot cast type
-- record to saved_searches ». La fonction de correspondance n'était donc
-- jamais évaluée.
--
-- La seconde : j'avais entouré tout le déclencheur d'un filet, au motif juste
-- que prévenir ne doit jamais empêcher de publier. Mais ce filet avalait
-- aussi les erreurs de logique, et une alerte muette ne se distingue pas d'un
-- marché sans nouveautés. Personne ne s'en serait aperçu.
--
-- Le filet reste — il protège la publication — mais il laisse désormais une
-- trace. Et il n'entoure plus que ce qui peut légitimement échouer.

-- ---------------------------------------------------------------------------
-- Ce qui a raté
-- ---------------------------------------------------------------------------

create table alert_failures (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings(id) on delete cascade,
  detail text not null,
  created_at timestamptz not null default now()
);

create index alert_failures_recent_idx on alert_failures (created_at desc);

alter table alert_failures enable row level security;

-- Diagnostic, pas donnée de membre : seule la modération le lit.
create policy alert_failures_moderator on alert_failures for select
  using (is_moderator());

comment on table alert_failures is
  'Alertes qui n''ont pas pu partir. Vide en temps normal ; non vide, c''est un bug.';

-- ---------------------------------------------------------------------------
-- Le déclencheur, corrigé
-- ---------------------------------------------------------------------------

create or replace function notify_saved_searches() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  -- Typée, et non `record` : c'est tout le sujet.
  alerte saved_searches%rowtype;
begin
  if new.status <> 'active' then
    return null;
  end if;

  for alerte in
    select s.* from saved_searches s
     where s.notify
       -- On ne prévient pas quelqu'un de sa propre annonce.
       and s.user_id <> new.seller_id
       -- Ni un membre qui a coupé le contact avec ce vendeur.
       and not exists (
         select 1 from blocks b
          where (b.blocker_id = s.user_id and b.blocked_id = new.seller_id)
             or (b.blocker_id = new.seller_id and b.blocked_id = s.user_id)
       )
     order by s.created_at
     limit alert_fanout_limit()
  loop
    if listing_matches_search(new, alerte) then
      -- Seul l'envoi peut légitimement échouer : il sort de la base. Une
      -- notification perdue ne doit pas emporter les suivantes.
      begin
        perform send_push(
          alerte.user_id,
          alerte.label,
          format('%s — %s €', new.title, trim(to_char(new.price, 'FM999999990.99'))),
          jsonb_build_object('type', 'saved_search', 'listingId', new.id, 'searchId', alerte.id)
        );
      exception when others then
        insert into alert_failures (listing_id, detail)
        values (new.id, format('envoi vers %s : %s', alerte.user_id, sqlerrm));
      end;

      update saved_searches set last_notified_at = now() where id = alerte.id;
    end if;
  end loop;

  return null;
exception when others then
  -- Prévenir n'est jamais assez important pour empêcher une publication.
  -- Mais l'échec se voit, maintenant.
  insert into alert_failures (listing_id, detail) values (new.id, sqlerrm);
  return null;
end;
$$;
