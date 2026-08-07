-- Signalement d'une annonce ou d'un membre.
--
-- Les signalements sont privés : leur auteur les voit, personne d'autre. La
-- modération se fait pour l'instant depuis le tableau de bord Supabase, où le
-- rôle postgres passe outre la sécurité au niveau ligne.

create type report_target as enum ('listing', 'profile');

create type report_reason as enum (
  'counterfeit',   -- contrefaçon
  'prohibited',    -- matériel interdit ou dangereux
  'misleading',    -- annonce trompeuse
  'scam',          -- tentative d'arnaque
  'offensive',     -- propos ou contenu offensants
  'spam',          -- spam ou doublon
  'other'
);

create type report_status as enum ('pending', 'reviewing', 'actioned', 'dismissed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target report_target not null,
  listing_id uuid references listings(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  reason report_reason not null,
  details text check (details is null or char_length(details) <= 2000),
  status report_status not null default 'pending',
  moderator_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Exactement une cible, cohérente avec le type
  constraint reports_target_shape check (
    (target = 'listing' and listing_id is not null and profile_id is null)
    or (target = 'profile' and profile_id is not null and listing_id is null)
  ),
  constraint reports_not_self check (profile_id is null or profile_id <> reporter_id)
);

-- Un seul signalement par personne et par cible : évite le harcèlement par
-- accumulation, tout en laissant chacun signaler une fois.
create unique index reports_once_per_listing on reports (reporter_id, listing_id)
  where listing_id is not null;
create unique index reports_once_per_profile on reports (reporter_id, profile_id)
  where profile_id is not null;

create index reports_triage_idx on reports (status, created_at desc);

alter table reports enable row level security;

-- Chacun ne voit que ses propres signalements.
create policy reports_read_own on reports for select using (reporter_id = auth.uid());

create policy reports_insert on reports for insert with check (
  reporter_id = auth.uid()
  -- On ne signale pas sa propre annonce.
  and (
    listing_id is null
    or not exists (select 1 from listings l where l.id = listing_id and l.seller_id = auth.uid())
  )
);

-- Vue de tri pour la modération, consultée depuis le tableau de bord.
create view moderation_queue as
select
  r.id,
  r.created_at,
  r.status,
  r.reason,
  r.details,
  r.target,
  reporter.name as reporter_name,
  l.title as listing_title,
  l.status as listing_status,
  seller.name as listing_seller,
  reported.name as reported_member
from reports r
  join profiles reporter on reporter.id = r.reporter_id
  left join listings l on l.id = r.listing_id
  left join profiles seller on seller.id = l.seller_id
  left join profiles reported on reported.id = r.profile_id
order by r.created_at desc;
