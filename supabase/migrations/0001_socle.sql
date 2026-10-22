-- QG de Stan, socle (étape 0).
-- Même mécanique que la console KSG Connect (platform_work_*, pilotage_*),
-- étendue à tous les espaces : chaque élément appartient à un espace.
-- Les sessions Claude écrivent par le connecteur Supabase (rôle postgres, hors RLS) ;
-- l'application ne lit et n'écrit que pour l'adresse inscrite dans qg_acces.

-- Accès : une ligne par adresse autorisée. Aucune policy : invisible depuis l'app.
create table public.qg_acces (
  email text primary key check (email = lower(email))
);
alter table public.qg_acces enable row level security;

create function public.qg_est_stan()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.qg_acces where email = lower(auth.jwt() ->> 'email'));
$$;
revoke execute on function public.qg_est_stan() from public, anon;
grant execute on function public.qg_est_stan() to authenticated;

-- Espaces : entreprises et projets annexes.
create table public.qg_espaces (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  nom text not null check (char_length(nom) between 1 and 80),
  groupe text not null check (groupe in ('entreprise', 'annexe')),
  ordre smallint not null default 100,
  etat text check (etat is null or char_length(etat) <= 200)
);

-- Éléments : chantier, lot, tâche, question, geste, idée, fonctionnalité (comme KSG),
-- plus jalon (date de la feuille de route) et document (lien vers un artefact).
create table public.qg_items (
  id uuid primary key default gen_random_uuid(),
  espace text not null references public.qg_espaces(slug) on update cascade,
  kind text not null check (kind in ('chantier', 'lot', 'tache', 'question', 'geste', 'idee', 'fonctionnalite', 'jalon', 'document')),
  parent_id uuid references public.qg_items(id) on delete restrict,
  ref text unique check (ref is null or (char_length(ref) between 2 and 40 and ref !~ '\s')),
  title text not null check (char_length(title) between 1 and 200),
  detail text check (detail is null or char_length(detail) <= 10000),
  status text not null default 'a_faire' check (status in ('idee', 'a_faire', 'en_cours', 'fait', 'abandonne')),
  owner text not null default 'claude' check (owner in ('stan', 'claude', 'autre')),
  owner_name text check (owner_name is null or char_length(owner_name) <= 100),
  starts_on date,
  due_on date,
  recommandation text check (recommandation is null or char_length(recommandation) <= 2000),
  default_applied text check (default_applied is null or char_length(default_applied) <= 2000),
  answer text check (answer is null or char_length(answer) <= 10000),
  answered_at timestamptz,
  avancement smallint check (avancement is null or avancement between 0 and 100),
  lien text check (lien is null or char_length(lien) <= 500),
  doc_path text check (doc_path is null or char_length(doc_path) <= 500),
  source text check (source is null or char_length(source) <= 100),
  created_by_label text not null default 'Session Claude (non nommée)',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qg_items_dates check (due_on is null or starts_on is null or due_on >= starts_on),
  constraint qg_items_parent_distinct check (parent_id is null or parent_id <> id),
  constraint qg_items_statut_idee check (status <> 'idee' or kind = 'idee'),
  constraint qg_items_reponse_question check (kind = 'question' or (default_applied is null and answer is null and answered_at is null and recommandation is null))
);
create index qg_items_espace_statut on public.qg_items (espace, status);
create index qg_items_parent on public.qg_items (parent_id);

create table public.qg_events (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.qg_items(id) on delete cascade,
  at timestamptz not null default now(),
  author text not null,
  kind text not null check (kind in ('creation', 'statut', 'reponse', 'dates', 'note')),
  from_status text,
  to_status text,
  note text check (note is null or char_length(note) <= 5000)
);
create index qg_events_item on public.qg_events (item_id, at desc);

create table public.qg_blockers (
  item_id uuid not null references public.qg_items(id) on delete cascade,
  blocked_by_id uuid not null references public.qg_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, blocked_by_id),
  check (item_id <> blocked_by_id)
);

create sequence public.qg_question_ref_seq;

-- Auteur : Stan quand l'app écrit, sinon le nom de session posé par qg_ajouter / qg_changer.
create function public.qg_auteur()
returns text language sql stable set search_path = public as $$
  select case
    when auth.uid() is not null then 'Stan'
    else coalesce(nullif(btrim(current_setting('qg.auteur', true)), ''), 'Session Claude (non nommée)')
  end;
$$;

create function public.qg_trouver(p_element text)
returns uuid language plpgsql stable set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.qg_items where ref = p_element;
  if v_id is null and p_element ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_id from public.qg_items where id = p_element::uuid;
  end if;
  return v_id;
end;
$$;

create function public.tg_qg_items_avant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by_label := public.qg_auteur();
    if new.kind = 'question' and new.ref is null then
      new.ref := 'QG-Q' || nextval('public.qg_question_ref_seq');
    end if;
    if new.answer is not null then
      new.answered_at := coalesce(new.answered_at, now());
      new.status := 'fait';
    end if;
  else
    new.updated_at := now();
    if new.answer is not null and new.answer is distinct from old.answer then
      new.answered_at := now();
      new.status := 'fait';
    end if;
  end if;
  return new;
end;
$$;
create trigger qg_items_avant before insert or update on public.qg_items
  for each row execute function public.tg_qg_items_avant();

create function public.tg_qg_items_journal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_auteur text := public.qg_auteur();
begin
  if tg_op = 'INSERT' then
    insert into public.qg_events (item_id, author, kind, to_status) values (new.id, v_auteur, 'creation', new.status);
    return new;
  end if;
  if new.answer is not null and new.answer is distinct from old.answer then
    insert into public.qg_events (item_id, author, kind, from_status, to_status, note)
    values (new.id, v_auteur, 'reponse', old.status, new.status, left(new.answer, 5000));
  elsif new.status is distinct from old.status then
    insert into public.qg_events (item_id, author, kind, from_status, to_status)
    values (new.id, v_auteur, 'statut', old.status, new.status);
  end if;
  if new.starts_on is distinct from old.starts_on or new.due_on is distinct from old.due_on then
    insert into public.qg_events (item_id, author, kind, note)
    values (new.id, v_auteur, 'dates',
      'Début ' || coalesce(to_char(new.starts_on, 'DD.MM.YYYY'), 'non daté')
      || ', échéance ' || coalesce(to_char(new.due_on, 'DD.MM.YYYY'), 'non datée'));
  end if;
  return new;
end;
$$;
create trigger qg_items_journal after insert or update on public.qg_items
  for each row execute function public.tg_qg_items_journal();

-- Écriture par les sessions Claude (mêmes paramètres que pilotage_*, plus l'espace en tête).
create function public.qg_ajouter(
  p_espace text, p_kind text, p_titre text, p_auteur text,
  p_detail text default null, p_ref text default null, p_parent text default null,
  p_porteur text default null, p_debut date default null, p_echeance date default null,
  p_defaut text default null, p_fichier text default null, p_bloque text default null,
  p_reco text default null, p_lien text default null, p_avancement smallint default null)
returns text language plpgsql set search_path = public as $$
declare v_parent uuid; v_bloque uuid; v_id uuid; v_ref text;
begin
  if nullif(btrim(p_auteur), '') is null then raise exception 'qg_ajouter : auteur obligatoire'; end if;
  perform set_config('qg.auteur', btrim(p_auteur), true);
  if p_parent is not null then
    v_parent := public.qg_trouver(p_parent);
    if v_parent is null then raise exception 'qg_ajouter : parent introuvable (%)', p_parent; end if;
  end if;
  if p_bloque is not null then
    v_bloque := public.qg_trouver(p_bloque);
    if v_bloque is null then raise exception 'qg_ajouter : element bloque introuvable (%)', p_bloque; end if;
  end if;
  insert into public.qg_items (espace, kind, title, detail, ref, parent_id, owner, starts_on, due_on,
    default_applied, doc_path, recommandation, lien, avancement, status)
  values (p_espace, p_kind, btrim(p_titre), p_detail, p_ref, v_parent,
    coalesce(p_porteur, case when p_kind in ('question', 'geste', 'idee') then 'stan' else 'claude' end),
    p_debut, p_echeance, p_defaut, p_fichier, p_reco, p_lien, p_avancement,
    case when p_kind = 'idee' then 'idee' else 'a_faire' end)
  returning id, ref into v_id, v_ref;
  if v_bloque is not null then
    insert into public.qg_blockers (item_id, blocked_by_id) values (v_bloque, v_id);
  end if;
  return coalesce(v_ref, v_id::text);
end;
$$;

create function public.qg_changer(
  p_element text, p_auteur text, p_statut text default null, p_note text default null,
  p_debut date default null, p_echeance date default null, p_avancement smallint default null)
returns void language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if nullif(btrim(p_auteur), '') is null then raise exception 'qg_changer : auteur obligatoire'; end if;
  if p_statut is null and p_note is null and p_debut is null and p_echeance is null and p_avancement is null then
    raise exception 'qg_changer : rien a changer';
  end if;
  perform set_config('qg.auteur', btrim(p_auteur), true);
  v_id := public.qg_trouver(p_element);
  if v_id is null then raise exception 'qg_changer : element introuvable (%)', p_element; end if;
  if p_statut is not null or p_debut is not null or p_echeance is not null or p_avancement is not null then
    update public.qg_items
       set status = coalesce(p_statut, status),
           starts_on = coalesce(p_debut, starts_on),
           due_on = coalesce(p_echeance, due_on),
           avancement = coalesce(p_avancement, avancement)
     where id = v_id;
  end if;
  if p_note is not null then
    insert into public.qg_events (item_id, author, kind, note) values (v_id, btrim(p_auteur), 'note', left(p_note, 5000));
  end if;
end;
$$;

-- Les fonctions d'écriture des sessions ne sont pas appelables depuis l'app.
revoke execute on function public.qg_ajouter(text, text, text, text, text, text, text, text, date, date, text, text, text, text, text, smallint) from public, anon, authenticated;
revoke execute on function public.qg_changer(text, text, text, text, date, date, smallint) from public, anon, authenticated;
revoke execute on function public.qg_trouver(text) from public, anon, authenticated;

-- RLS : seule l'adresse de qg_acces lit et écrit depuis l'app.
alter table public.qg_espaces enable row level security;
alter table public.qg_items enable row level security;
alter table public.qg_events enable row level security;
alter table public.qg_blockers enable row level security;

create policy qg_espaces_stan on public.qg_espaces for all to authenticated
  using ((select public.qg_est_stan())) with check ((select public.qg_est_stan()));
create policy qg_items_stan on public.qg_items for all to authenticated
  using ((select public.qg_est_stan())) with check ((select public.qg_est_stan()));
create policy qg_events_stan_lecture on public.qg_events for select to authenticated
  using ((select public.qg_est_stan()));
create policy qg_blockers_stan on public.qg_blockers for all to authenticated
  using ((select public.qg_est_stan())) with check ((select public.qg_est_stan()));

-- Espaces de départ.
insert into public.qg_espaces (slug, nom, groupe, ordre) values
  ('futur', 'Futur', 'entreprise', 10),
  ('batimetric', 'BatiMetric', 'entreprise', 20),
  ('ksg-connect', 'KSG Connect', 'entreprise', 30),
  ('ksg-solutions', 'KSG Solutions', 'entreprise', 40),
  ('livre', 'Livre · Chronique d''une Pensée Incomplète', 'annexe', 50),
  ('personal-branding', 'Personal branding', 'annexe', 60),
  ('agent-reseaux', 'Agent réseaux sociaux', 'annexe', 70),
  ('famille-schaerer', 'Famille Schärer', 'annexe', 80),
  ('qg', 'QG', 'annexe', 90);
