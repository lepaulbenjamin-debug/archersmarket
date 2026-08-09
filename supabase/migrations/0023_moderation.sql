-- La modération : un endroit où les signaux deviennent des décisions.
--
-- Jusqu'ici, un signalement de membre tombait dans une table que personne
-- n'ouvrait, et les signaux automatiques s'accumulaient sans destinataire.
-- Un dispositif de surveillance que personne ne lit ne protège personne.

-- ---------------------------------------------------------------------------
-- Qui modère
--
-- Un drapeau sur le profil plutôt qu'une table à part : il n'y aura jamais
-- beaucoup de modérateurs, et le droit se lit d'un coup d'œil. Il ne
-- s'attribue pas depuis l'application — la colonne n'est pas dans la liste
-- des colonnes que l'app peut écrire (migration 0010).
-- ---------------------------------------------------------------------------

alter table profiles add column is_moderator boolean not null default false;

comment on column profiles.is_moderator is
  'Accès à la file de modération. Se pose à la main, jamais depuis l''app.';

create function is_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_moderator from profiles p where p.id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Ce que la modération voit
-- ---------------------------------------------------------------------------

create policy risk_signals_moderator on risk_signals for select
  using (is_moderator());

create policy reports_moderator_read on reports for select
  using (is_moderator());

create policy reports_moderator_update on reports for update
  using (is_moderator()) with check (is_moderator());

-- Un modérateur doit pouvoir lire le message incriminé pour juger : un motif
-- seul ne suffit pas à décider si quelqu'un fraude ou plaisante.
create policy messages_moderator_read on messages for select
  using (is_moderator());

-- ---------------------------------------------------------------------------
-- Les comptes qui remontent
--
-- On additionne les signaux récents plutôt que de tenir un score permanent :
-- un compte qui a dérapé il y a six mois et se tient depuis n'a pas à rester
-- marqué à vie.
-- ---------------------------------------------------------------------------

create view flagged_accounts
with (security_invoker = true) as
select
  p.id as user_id,
  p.name,
  p.handle,
  p.created_at as member_since,
  count(s.id) filter (where s.created_at > now() - interval '90 days') as recent_signals,
  coalesce(sum(s.weight) filter (where s.created_at > now() - interval '90 days'), 0) as recent_weight,
  max(s.created_at) as last_signal_at,
  -- Les motifs distincts, pour comprendre sans ouvrir chaque signal.
  array_agg(distinct s.kind::text) filter (where s.created_at > now() - interval '90 days') as kinds,
  -- Le nombre de fois où d'autres membres l'ont signalé, qui pèse autrement
  -- qu'une détection automatique.
  (select count(*) from reports r where r.profile_id = p.id) as reports
from profiles p
join risk_signals s on s.user_id = p.id
group by p.id, p.name, p.handle, p.created_at
having coalesce(sum(s.weight) filter (where s.created_at > now() - interval '90 days'), 0) > 0;

comment on view flagged_accounts is
  'Comptes portant des signaux récents, du plus lourd au plus léger.';

-- ---------------------------------------------------------------------------
-- Les gestes de la modération
--
-- Suspendre plutôt que supprimer : une suppression efface aussi les preuves,
-- et se révèle irréversible le jour où l'on s'est trompé.
-- ---------------------------------------------------------------------------

alter table profiles add column suspended_at timestamptz;
alter table profiles add column suspended_reason text;

comment on column profiles.suspended_at is
  'Compte suspendu : ses annonces sont retirées, il ne peut plus publier.';

create function moderate_suspend(target uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;
  if target = auth.uid() then
    raise exception 'On ne se suspend pas soi-même.';
  end if;

  update profiles
     set suspended_at = now(),
         suspended_reason = nullif(trim(coalesce(reason, '')), '')
   where id = target;

  -- Les annonces sortent de la vente, sans être effacées : si la décision est
  -- annulée, le vendeur les retrouve.
  update listings set status = 'reserved', updated_at = now()
   where seller_id = target and status = 'active';
end;
$$;

create function moderate_restore(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;
  update profiles set suspended_at = null, suspended_reason = null where id = target;
end;
$$;

create function moderate_resolve_report(report uuid, note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_moderator() then
    raise exception 'Réservé à la modération.';
  end if;
  update reports
     set status = 'reviewed', moderator_note = nullif(trim(coalesce(note, '')), ''),
         resolved_at = now()
   where id = report;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ce qu'une suspension empêche
--
-- Le contrôle vit en base : le cacher dans l'application reviendrait à ne pas
-- le faire, puisque l'API reste ouverte.
-- ---------------------------------------------------------------------------

create function refuse_if_suspended() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles p where p.id = auth.uid() and p.suspended_at is not null) then
    raise exception 'Votre compte est suspendu. Écrivez-nous à contact@archersmarket.fr.';
  end if;
  return new;
end;
$$;

create trigger listings_refuse_suspended
  before insert on listings
  for each row execute function refuse_if_suspended();

create trigger messages_refuse_suspended
  before insert on messages
  for each row execute function refuse_if_suspended();
