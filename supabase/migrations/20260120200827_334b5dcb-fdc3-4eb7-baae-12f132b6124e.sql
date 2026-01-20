-- Populate news_articles from existing weekly_news data
-- This extracts main_story and stories from weekly_news jsonb and inserts as individual articles

DO $$
DECLARE
  wn_record RECORD;
  ms jsonb;
  st jsonb;
  week_suffix text;
  article_slug text;
BEGIN
  -- Loop through all weekly_news records
  FOR wn_record IN SELECT wn.id, wn.week_start, wn.main_story, wn.stories FROM weekly_news wn WHERE wn.status = 'published' LOOP
    week_suffix := to_char(wn_record.week_start, 'YYYY-MM-DD');
    
    -- Insert main story
    ms := wn_record.main_story;
    IF ms IS NOT NULL AND ms->>'headline' IS NOT NULL THEN
      article_slug := COALESCE(ms->>'slug', 'destacado') || '-' || week_suffix;
      
      INSERT INTO news_articles (
        week_id, slug, headline, meta_description, lead, body, 
        data_highlight, keywords, companies, chart_data, category,
        is_main_story, reading_time_minutes, published_at, status, canonical_url
      ) VALUES (
        wn_record.id,
        article_slug,
        ms->>'headline',
        ms->>'metaDescription',
        COALESCE(ms->>'lead', ''),
        COALESCE(ms->>'body', ''),
        ms->>'dataHighlight',
        CASE WHEN ms->'keywords' IS NOT NULL 
          THEN ARRAY(SELECT jsonb_array_elements_text(ms->'keywords'))
          ELSE NULL END,
        CASE WHEN ms->'companies' IS NOT NULL 
          THEN ARRAY(SELECT jsonb_array_elements_text(ms->'companies'))
          ELSE NULL END,
        ms->'chartData',
        'destacado',
        true,
        GREATEST(1, COALESCE(length(ms->>'body') / 1000, 3)),
        now(),
        'published',
        'https://repindex.ai/noticias/' || article_slug
      )
      ON CONFLICT (slug) DO UPDATE SET
        headline = EXCLUDED.headline,
        body = EXCLUDED.body,
        lead = EXCLUDED.lead;
    END IF;
    
    -- Insert each story from stories array
    IF wn_record.stories IS NOT NULL THEN
      FOR st IN SELECT * FROM jsonb_array_elements(wn_record.stories) LOOP
        IF st->>'headline' IS NOT NULL THEN
          article_slug := COALESCE(st->>'slug', st->>'category', 'noticia') || '-' || week_suffix;
          
          INSERT INTO news_articles (
            week_id, slug, headline, meta_description, lead, body,
            data_highlight, keywords, companies, chart_data, category,
            is_main_story, reading_time_minutes, published_at, status, canonical_url
          ) VALUES (
            wn_record.id,
            article_slug,
            st->>'headline',
            st->>'metaDescription',
            COALESCE(st->>'lead', ''),
            COALESCE(st->>'body', ''),
            st->>'dataHighlight',
            CASE WHEN st->'keywords' IS NOT NULL 
              THEN ARRAY(SELECT jsonb_array_elements_text(st->'keywords'))
              ELSE NULL END,
            CASE WHEN st->'companies' IS NOT NULL 
              THEN ARRAY(SELECT jsonb_array_elements_text(st->'companies'))
              ELSE NULL END,
            st->'chartData',
            st->>'category',
            false,
            GREATEST(1, COALESCE(length(st->>'body') / 1000, 2)),
            now(),
            'published',
            'https://repindex.ai/noticias/' || article_slug
          )
          ON CONFLICT (slug) DO UPDATE SET
            headline = EXCLUDED.headline,
            body = EXCLUDED.body,
            lead = EXCLUDED.lead;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;