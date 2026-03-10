-- ============================================================
-- SFI SUPABASE UPGRADE - PART 13: MARKETING VIEWS & CHECKS
-- Execute in Supabase SQL Editor (opcional, após 05-analytics-tracking)
-- ============================================================

-- 13.1 MONTHLY SUMMARY (high-level marketing KPIs por mês)
-- --------------------------------------------------------

create or replace view marketing_monthly_summary as
with pv as (
  select
    date_trunc('month', created_at)::date as month_start,
    session_id,
    time_on_page_seconds,
    case when coalesce(time_on_page_seconds,0) < 10 then 1 else 0 end as is_bounce
  from page_views
),
fe_purchase as (
  select distinct session_id
  from funnel_events
  where step = 'purchase'
)
select
  month_start,
  to_char(month_start, 'YYYY-MM')             as month_key,
  count(*)                                    as page_views,
  count(distinct session_id)                  as sessions,
  round(avg(time_on_page_seconds))            as avg_time_on_page_sec,
  round(100.0 * sum(is_bounce)::numeric / nullif(count(*),0), 1) as bounce_rate_pct,
  count(distinct session_id) filter (where session_id in (select session_id from fe_purchase)) as purchasing_sessions,
  case
    when count(distinct session_id) > 0
      then round(
        100.0
        * count(distinct session_id) filter (where session_id in (select session_id from fe_purchase))::numeric
        / count(distinct session_id),
        1
      )
    else 0
  end as conversion_rate_pct
from pv
group by month_start
order by month_start desc;


-- 13.2 DATA QUALITY CHECKS (úteis para marketing) - QUERIES DE CONSULTA
-- ---------------------------------------------------------------------
-- Estes NÃO são views obrigatórias; são consultas que você pode rodar
-- diretamente no SQL Editor quando quiser checar a "saúde" dos dados.

-- A) Eventos de produto sem ligação a um produto válido (id desconhecido)
-- select product_id, count(*) as events
-- from product_events
-- where product_id is not null
--   and product_id not in (select id::text from products)
-- group by product_id
-- order by events desc;

-- B) Page views de produto sem product_id preenchido
-- select count(*) as page_views_sem_product_id
-- from page_views
-- where page_type = 'product'
--   and (product_id is null or product_id = '');

-- C) Distribuição de page views por page_type (para detectar tipos "unknown")
-- select page_type, count(*) as views
-- from page_views
-- group by page_type
-- order by views desc;

-- D) Campanhas UTM sem source/medium definidos
-- select utm_campaign, utm_source, utm_medium, count(*) as sessions
-- from (
--   select session_id, utm_campaign, utm_source, utm_medium
--   from page_views
--   group by session_id, utm_campaign, utm_source, utm_medium
-- ) x
-- where utm_campaign is not null
--   and (utm_source is null or utm_medium is null)
-- group by utm_campaign, utm_source, utm_medium
-- order by sessions desc;

