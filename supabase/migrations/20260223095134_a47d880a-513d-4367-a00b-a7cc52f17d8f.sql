CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_unique_article_url
ON documents ((metadata->>'article_url'))
WHERE metadata->>'type' = 'corporate_news';
