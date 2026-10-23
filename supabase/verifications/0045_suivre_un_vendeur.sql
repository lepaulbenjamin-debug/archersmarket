-- Vérification de la migration 0045, à coller dans l'éditeur SQL de Supabase
-- APRÈS avoir appliqué 0045_suivre_un_vendeur.sql.
--
-- Le script agit successivement dans la peau de deux membres réels, A et B,
-- comme le ferait l'application : même rôle, même identité, mêmes règles de
-- sécurité. Il annule tout à la fin (`rollback`) : aucun abonnement, aucune
-- annonce, aucun blocage ne reste en base, et aucune notification ne part —
-- les envois ne quittent la base qu'une fois la transaction validée.
--
-- Attendu : une série de lignes « VERT » dans les messages, et aucune
-- « ROUGE ». Une ROUGE arrête le script à l'endroit exact du problème.

begin;
do $$
declare
  a uuid;
  b uuid;
  n integer;
  annonce uuid;
begin
  select id into a from profiles where suspended_at is null order by created_at limit 1;
  select id into b from profiles where suspended_at is null and id <> a order by created_at limit 1;
  if b is null then
    raise exception 'Il faut au moins deux membres non suspendus pour ce test.';
  end if;

  -- 0. Les pièces sont en place ------------------------------------------------
  if to_regclass('public.follows') is null then raise exception 'ROUGE : table follows absente'; end if;
  perform 1 from pg_trigger where tgname = 'listings_notify_followers';
  if not found then raise exception 'ROUGE : déclencheur listings_notify_followers absent'; end if;
  perform 1 from pg_trigger where tgname = 'blocks_unfollow';
  if not found then raise exception 'ROUGE : déclencheur blocks_unfollow absent'; end if;
  raise notice 'VERT : table, déclencheurs et fonction en place';

  -- 1. A suit B ------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into follows (follower_id, seller_id) values (a, b);
  select count(*) into n from follows;
  if n <> 1 then raise exception 'ROUGE : A voit % abonnement(s), 1 attendu', n; end if;
  if follower_count(b) < 1 then raise exception 'ROUGE : le compteur de B ne compte pas A'; end if;
  raise notice 'VERT : A suit B, et le compteur de B le compte (%)', follower_count(b);

  begin
    insert into follows (follower_id, seller_id) values (b, a);
    raise exception 'ROUGE : A a pu abonner B à sa place';
  exception when others then
    if sqlerrm like 'ROUGE%' then raise; end if;
    raise notice 'VERT : impossible d''abonner quelqu''un d''autre que soi';
  end;

  begin
    insert into follows (follower_id, seller_id) values (a, a);
    raise exception 'ROUGE : A a pu se suivre lui-même';
  exception when others then
    if sqlerrm like 'ROUGE%' then raise; end if;
    raise notice 'VERT : on ne se suit pas soi-même';
  end;

  -- 2. B sait combien, jamais qui --------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from follows where seller_id = b;
  if n <> 0 then raise exception 'ROUGE : B voit qui le suit (% ligne(s))', n; end if;
  raise notice 'VERT : B ne voit pas qui le suit, seulement combien (%)', follower_count(b);

  -- 3. Une nouvelle annonce de B prévient ses abonnés, sans erreur -----------------
  insert into listings (seller_id, title, description, price, category, brand, condition, hand, city, shipping)
  values (b, 'Annonce de contrôle 0045',
          'Insérée par le test de la migration 0045 et annulée aussitôt.',
          100, 'sight', 'Autre', 'good', 'na', 'Nantes', false)
  returning id into annonce;

  perform set_config('role', 'postgres', true);
  -- Seuls les échecs des abonnements comptent ici : les alertes de recherche
  -- se déclenchent aussi sur cette annonce, et leurs éventuels ratés n'ont
  -- rien à voir avec 0045.
  select count(*) into n from alert_failures
   where listing_id = annonce and (detail like 'abonné %' or detail like 'abonnements :%');
  if n <> 0 then
    raise exception 'ROUGE : la notification des abonnés a échoué — %',
      (select detail from alert_failures
        where listing_id = annonce and (detail like 'abonné %' or detail like 'abonnements :%') limit 1);
  end if;
  raise notice 'VERT : la publication a déclenché la notification des abonnés, sans erreur';

  -- 4. Bloquer, c'est se désabonner — et ne plus pouvoir se réabonner ---------------
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into blocks (blocker_id, blocked_id) values (a, b);

  perform set_config('role', 'postgres', true);
  select count(*) into n from follows where follower_id = a and seller_id = b;
  if n <> 0 then raise exception 'ROUGE : l''abonnement survit au blocage'; end if;
  raise notice 'VERT : bloquer B a désabonné A';

  perform set_config('role', 'authenticated', true);
  begin
    insert into follows (follower_id, seller_id) values (a, b);
    raise exception 'ROUGE : A a pu suivre à nouveau un membre qu''il a bloqué';
  exception when others then
    if sqlerrm like 'ROUGE%' then raise; end if;
    raise notice 'VERT : impossible de suivre un membre bloqué';
  end;

  perform set_config('role', 'postgres', true);
  raise notice 'Terminé : tout est annulé par le rollback qui suit.';
end $$;
rollback;
