-- Per-document access: public (visitors and members), members (signed in), staff (FITSPA only).
-- Existing documents default to public, so nothing changes until an admin edits one.
-- (Applied to production in steps: the MCP tool hangs on DROP statements, so the policy is ALTERed in place.)
alter table public.documents add column if not exists audience text not null default 'public' check (audience in ('public','members','staff'));
alter table public.documents add column if not exists programme_id text references public.prog_programmes(id) on delete set null;

alter policy "public read published documents" on public.documents using (
  public.is_staff() or (status = 'Published' and (audience = 'public' or (audience = 'members' and auth.uid() is not null)))
);

-- The assistant's search honours the same rule. Rewritten as a single SQL statement (strict full-text pass,
-- otherwise the looser any-word pass) with the same output columns and ranking as the previous version.
create or replace function public.search_document_chunks(q text, limit_n integer default 8)
 returns table(chunk_id uuid, document_id uuid, content text, doc_title text, doc_kind text, regulator_name text, storage_path text, rank real)
 language sql stable security definer set search_path to 'public'
as $fn$
with vis as (
  select dc.id as cid, dc.document_id as did, dc.content as ctext, d.title as dtitle, d.doc_kind as dkind, r.name as rname, d.storage_path as spath, to_tsvector('english', dc.content) as tsv
  from document_chunks dc
  join documents d on d.id = dc.document_id
  left join regulators r on r.id = d.regulator_id
  where is_staff() or (d.status = 'Published' and (d.audience = 'public' or (d.audience = 'members' and auth.uid() is not null)))
),
strict as (
  select v.*, ts_rank_cd(v.tsv, websearch_to_tsquery('english', q))::real as rk
  from vis v
  where websearch_to_tsquery('english', q)::text <> '' and v.tsv @@ websearch_to_tsquery('english', q)
  order by rk desc
  limit limit_n
),
lq as (
  select to_tsquery('english', string_agg(lexeme, ' | ')) as lq
  from unnest(tsvector_to_array(to_tsvector('english', q))) as lexeme
),
loose as (
  select v.*, ts_rank_cd(v.tsv, lq.lq)::real as rk
  from vis v, lq
  where not exists (select 1 from strict) and lq.lq is not null and v.tsv @@ lq.lq
  order by rk desc
  limit limit_n
),
allr as (
  select * from strict
  union all
  select * from loose
)
select cid, did, ctext, dtitle, dkind, rname, spath, rk from allr order by rk desc limit limit_n
$fn$;
