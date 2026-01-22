-- Actualizar tickers de grupos hospitalarios con sus iniciales
UPDATE repindex_root_issuers SET ticker = 'QS' WHERE issuer_id = 'quironsalud';
UPDATE repindex_root_issuers SET ticker = 'HMH' WHERE issuer_id = 'hm-hospitales';
UPDATE repindex_root_issuers SET ticker = 'VIT' WHERE issuer_id = 'vithas';
UPDATE repindex_root_issuers SET ticker = 'RS' WHERE issuer_id = 'ribera-salud';
UPDATE repindex_root_issuers SET ticker = 'SAN' WHERE issuer_id = 'sanitas';
UPDATE repindex_root_issuers SET ticker = 'HOS' WHERE issuer_id = 'hospiten';
UPDATE repindex_root_issuers SET ticker = 'VIA' WHERE issuer_id = 'viamed';
UPDATE repindex_root_issuers SET ticker = 'HLA' WHERE issuer_id = 'hla-hospitales';