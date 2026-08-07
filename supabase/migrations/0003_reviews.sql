-- Avis après transaction.
--
-- Une vente devient identifiable : en marquant son annonce vendue, le vendeur
-- désigne l'acheteur parmi les personnes qui l'ont contacté. Les deux parties
-- peuvent alors se noter, une seule fois chacune. La note du profil est
-- recalculée automatiquement.

alter table listings
  add column buyer_id uuid references profiles(id) on delete set null,
  add constraint listings_buyer_not_seller check (buyer_id is null or buyer_id <> seller_id);

create index listings_buyer_idx on listings (buyer_id) where buyer_id is not null;

create table reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  -- Auteur de l'avis et personne notée
  author_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid not null references profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) between 3 and 1000),
  created_at timestamptz not null default now(),
  -- Un seul avis par personne et par transaction
  unique (listing_id, author_id),
  check (author_id <> subject_id)
);

create index reviews_subject_idx on reviews (subject_id, created_at desc);

-- Recalcule la note moyenne et le nombre d'avis de la personne notée.
create function refresh_profile_rating() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target uuid := coalesce(new.subject_id, old.subject_id);
begin
  update profiles set
    rating = coalesce(
      (select round(avg(rating)::numeric, 1) from reviews where subject_id = target), 0
    ),
    review_count = (select count(*) from reviews where subject_id = target)
  where id = target;
  return coalesce(new, old);
end;
$$;

create trigger on_review_changed
  after insert or update or delete on reviews
  for each row execute function refresh_profile_rating();

alter table reviews enable row level security;

-- Les avis sont publics : c'est tout leur intérêt comme signal de confiance.
create policy reviews_read on reviews for select using (true);

-- On ne note que l'autre partie d'une vente conclue à laquelle on a pris part.
create policy reviews_insert on reviews for insert with check (
  author_id = auth.uid()
  and exists (
    select 1 from listings l
    where l.id = listing_id
      and l.status = 'sold'
      and l.buyer_id is not null
      and (
        (l.seller_id = auth.uid() and subject_id = l.buyer_id)
        or (l.buyer_id = auth.uid() and subject_id = l.seller_id)
      )
  )
);

-- Chacun reste maître de son propre avis.
create policy reviews_update on reviews for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy reviews_delete on reviews for delete using (author_id = auth.uid());
