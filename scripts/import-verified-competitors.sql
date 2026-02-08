-- ============================================================================
-- Script: Importar competidores verificados desde Excel
-- Fecha: 2025-01-29
-- Descripción: Pobla la columna verified_competitors en repindex_root_issuers
--              con los tickers de competidores directos verificados manualmente.
--              Los nombres de empresas se mapean a sus tickers correspondientes.
-- ============================================================================

-- NOTA: Este script convierte nombres de competidores del Excel a tickers.
-- Ejecutar en el SQL Editor de Supabase.

-- A3M - Atresmedia
UPDATE repindex_root_issuers SET verified_competitors = '["MFEB"]' WHERE ticker = 'A3M';

-- ABERTIS-PRIV - Abertis
UPDATE repindex_root_issuers SET verified_competitors = '["FER", "ACS", "SCYR"]' WHERE ticker = 'ABERTIS-PRIV';

-- ACCENTURE-PRIV - Accenture (competidores no cotizan en España)
UPDATE repindex_root_issuers SET verified_competitors = '["DELOITTE-PRIV", "PWC-PRIV", "EY-PRIV", "KPMG-PRIV"]' WHERE ticker = 'ACCENTURE-PRIV';

-- ACS
UPDATE repindex_root_issuers SET verified_competitors = '["FER", "ANA", "SCYR", "FCC-PRIV", "OHL"]' WHERE ticker = 'ACS';

-- ACX - Acerinox
UPDATE repindex_root_issuers SET verified_competitors = '["MTS"]' WHERE ticker = 'ACX';

-- ADX - Audax Renovables
UPDATE repindex_root_issuers SET verified_competitors = '["HLZ", "IBE", "ELE", "NTGY"]' WHERE ticker = 'ADX';

-- ADZ - Adolfo Domínguez
UPDATE repindex_root_issuers SET verified_competitors = '["ITX"]' WHERE ticker = 'ADZ';

-- AED - AEDAS Homes
UPDATE repindex_root_issuers SET verified_competitors = '["MVC", "HOME"]' WHERE ticker = 'AED';

-- ALM - Almirall
UPDATE repindex_root_issuers SET verified_competitors = '["GRF", "PHM", "FAE"]' WHERE ticker = 'ALM';

-- ALT - Altia Consultores
UPDATE repindex_root_issuers SET verified_competitors = '["IZE", "SER"]' WHERE ticker = 'ALT';

-- ALTR - Alantra Partners
UPDATE repindex_root_issuers SET verified_competitors = '["R4"]' WHERE ticker = 'ALTR';

-- AMAZON-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["GOOGLE-PRIV", "META-PRIV"]' WHERE ticker = 'AMAZON-PRIV';

-- AMP - Amper
UPDATE repindex_root_issuers SET verified_competitors = '["IDR", "EME-PRIV"]' WHERE ticker = 'AMP';

-- ANA - Acciona
UPDATE repindex_root_issuers SET verified_competitors = '["ACS", "FER", "SCYR", "FCC-PRIV", "OHL"]' WHERE ticker = 'ANA';

-- ANE - Acciona Energía
UPDATE repindex_root_issuers SET verified_competitors = '["SLR", "GRE", "ECR"]' WHERE ticker = 'ANE';

-- ANTOLIN-PRIV - Grupo Antolín
UPDATE repindex_root_issuers SET verified_competitors = '["CIE", "GEST"]' WHERE ticker = 'ANTOLIN-PRIV';

-- ARM - Árima Real Estate
UPDATE repindex_root_issuers SET verified_competitors = '["MRL", "COL"]' WHERE ticker = 'ARM';

-- ATR - Atrys Health
UPDATE repindex_root_issuers SET verified_competitors = '["SANITAS", "CBAV"]' WHERE ticker = 'ATR';

-- BBVA
UPDATE repindex_root_issuers SET verified_competitors = '["SAN", "CABK", "SAB", "BKT", "UNI"]' WHERE ticker = 'BBVA';

-- BIL - Bodegas Bilbaínas
UPDATE repindex_root_issuers SET verified_competitors = '["RIO"]' WHERE ticker = 'BIL';

-- BKT - Bankinter
UPDATE repindex_root_issuers SET verified_competitors = '["BBVA", "SAN", "CABK", "SAB", "UNI"]' WHERE ticker = 'BKT';

-- BOOKING-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["AIRBNB-PRIV", "EDR"]' WHERE ticker = 'BOOKING-PRIV';

-- CABK - CaixaBank
UPDATE repindex_root_issuers SET verified_competitors = '["BBVA", "SAN", "SAB", "BKT", "UNI"]' WHERE ticker = 'CABK';

-- CAF
UPDATE repindex_root_issuers SET verified_competitors = '["TLG"]' WHERE ticker = 'CAF';

-- CAST - Castellana Properties
UPDATE repindex_root_issuers SET verified_competitors = '["LRE"]' WHERE ticker = 'CAST';

-- CAT - Catalana Occidente
UPDATE repindex_root_issuers SET verified_competitors = '["MAP", "LDA", "MUTUA-PRIV"]' WHERE ticker = 'CAT';

-- CBAV - Clínica Baviera
UPDATE repindex_root_issuers SET verified_competitors = '["ATR"]' WHERE ticker = 'CBAV';

-- MOE.MC (Moeve, antes Cepsa)
UPDATE repindex_root_issuers SET verified_competitors = '["REP"]' WHERE ticker = 'MOE.MC';

-- CIE - CIE Automotive
UPDATE repindex_root_issuers SET verified_competitors = '["ANTOLIN-PRIV", "GEST"]' WHERE ticker = 'CIE';

-- COL - Inmobiliaria Colonial
UPDATE repindex_root_issuers SET verified_competitors = '["MRL"]' WHERE ticker = 'COL';

-- CORREOS-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["LOG"]' WHERE ticker = 'CORREOS-PRIV';

-- DAMM-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["MAHOU-PRIV"]' WHERE ticker = 'DAMM-PRIV';

-- DELOITTE-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["ACCENTURE-PRIV", "PWC-PRIV", "EY-PRIV", "KPMG-PRIV"]' WHERE ticker = 'DELOITTE-PRIV';

-- DIA
UPDATE repindex_root_issuers SET verified_competitors = '["MERC-PRIV", "EROSKI-PRIV"]' WHERE ticker = 'DIA';

-- EBR - Ebro Foods
UPDATE repindex_root_issuers SET verified_competitors = '["VIS"]' WHERE ticker = 'EBR';

-- ECR - Ecoener
UPDATE repindex_root_issuers SET verified_competitors = '["GRE", "EIDF", "SLR"]' WHERE ticker = 'ECR';

-- EDR - eDreams ODIGEO
UPDATE repindex_root_issuers SET verified_competitors = '["BOOKING-PRIV"]' WHERE ticker = 'EDR';

-- EIDF - EiDF Solar
UPDATE repindex_root_issuers SET verified_competitors = '["SLR", "GRE", "ECR"]' WHERE ticker = 'EIDF';

-- ELE - Endesa
UPDATE repindex_root_issuers SET verified_competitors = '["IBE", "NTGY"]' WHERE ticker = 'ELE';

-- EME-PRIV - Escribano Mechanical
UPDATE repindex_root_issuers SET verified_competitors = '["IDR", "AMP"]' WHERE ticker = 'EME-PRIV';

-- ENG - Enagás
UPDATE repindex_root_issuers SET verified_competitors = '["RED"]' WHERE ticker = 'ENG';

-- ENO - Elecnor
UPDATE repindex_root_issuers SET verified_competitors = '["TRE"]' WHERE ticker = 'ENO';

-- ENS - Enerside Energy
UPDATE repindex_root_issuers SET verified_competitors = '["SLR", "GRE"]' WHERE ticker = 'ENS';

-- EROSKI-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["MERC-PRIV", "DIA"]' WHERE ticker = 'EROSKI-PRIV';

-- EY-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["ACCENTURE-PRIV", "DELOITTE-PRIV", "PWC-PRIV", "KPMG-PRIV"]' WHERE ticker = 'EY-PRIV';

-- FAE - Faes Farma
UPDATE repindex_root_issuers SET verified_competitors = '["ROVI", "RJF", "ALM"]' WHERE ticker = 'FAE';

-- FCC-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["ACS", "FER", "ANA", "SCYR", "OHL"]' WHERE ticker = 'FCC-PRIV';

-- FER - Ferrovial
UPDATE repindex_root_issuers SET verified_competitors = '["ACS", "ANA", "SCYR", "FCC-PRIV", "OHL"]' WHERE ticker = 'FER';

-- GEST - Gestamp
UPDATE repindex_root_issuers SET verified_competitors = '["CIE", "ANTOLIN-PRIV"]' WHERE ticker = 'GEST';

-- GOOGLE-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["AMAZON-PRIV", "META-PRIV"]' WHERE ticker = 'GOOGLE-PRIV';

-- GRE - Grenergy Renovables
UPDATE repindex_root_issuers SET verified_competitors = '["ANE", "SLR", "EIDF", "ECR"]' WHERE ticker = 'GRE';

-- GRF - Grifols
UPDATE repindex_root_issuers SET verified_competitors = '["PHM", "ROVI", "FAE", "ALM"]' WHERE ticker = 'GRF';

-- GSJ - Grupo Empresarial San José
UPDATE repindex_root_issuers SET verified_competitors = '["ACS", "SCYR", "OHL"]' WHERE ticker = 'GSJ';

-- HLA - Grupo Hospitalario HLA
UPDATE repindex_root_issuers SET verified_competitors = '["QS", "HMH", "VIT", "VIA"]' WHERE ticker = 'HLA';

-- HLZ - Holaluz
UPDATE repindex_root_issuers SET verified_competitors = '["ADX", "IBE", "ELE"]' WHERE ticker = 'HLZ';

-- HMH - HM Hospitales
UPDATE repindex_root_issuers SET verified_competitors = '["QS", "HLA", "VIT", "VIA"]' WHERE ticker = 'HMH';

-- HOME - Neinor Homes
UPDATE repindex_root_issuers SET verified_competitors = '["MVC", "AED"]' WHERE ticker = 'HOME';

-- HOS - Grupo Hospiten
UPDATE repindex_root_issuers SET verified_competitors = '["QS", "VIT"]' WHERE ticker = 'HOS';

-- IAG
UPDATE repindex_root_issuers SET verified_competitors = '["RENFE-PRIV"]' WHERE ticker = 'IAG';

-- IBE - Iberdrola
UPDATE repindex_root_issuers SET verified_competitors = '["ELE", "NTGY", "REP"]' WHERE ticker = 'IBE';

-- IBG - Iberpapel Gestión
UPDATE repindex_root_issuers SET verified_competitors = '["MCM"]' WHERE ticker = 'IBG';

-- IDR - Indra Sistemas
UPDATE repindex_root_issuers SET verified_competitors = '["AMP", "EME-PRIV"]' WHERE ticker = 'IDR';

-- INSUR - Inmobiliaria del Sur
UPDATE repindex_root_issuers SET verified_competitors = '["MVC", "HOME"]' WHERE ticker = 'INSUR';

-- ITX - Inditex
UPDATE repindex_root_issuers SET verified_competitors = '["ADZ", "PUIG"]' WHERE ticker = 'ITX';

-- IZE - Izertis
UPDATE repindex_root_issuers SET verified_competitors = '["ALT", "SER"]' WHERE ticker = 'IZE';

-- KPMG-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["ACCENTURE-PRIV", "DELOITTE-PRIV", "PWC-PRIV", "EY-PRIV"]' WHERE ticker = 'KPMG-PRIV';

-- LDA - Línea Directa Aseguradora
UPDATE repindex_root_issuers SET verified_competitors = '["MAP", "CAT", "MUTUA-PRIV"]' WHERE ticker = 'LDA';

-- LLYC
UPDATE repindex_root_issuers SET verified_competitors = '["MAKS"]' WHERE ticker = 'LLYC';

-- LOG - Logista
UPDATE repindex_root_issuers SET verified_competitors = '["CORREOS-PRIV"]' WHERE ticker = 'LOG';

-- LRE - Lar España
UPDATE repindex_root_issuers SET verified_competitors = '["MRL", "CAST"]' WHERE ticker = 'LRE';

-- MAHOU-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["DAMM-PRIV"]' WHERE ticker = 'MAHOU-PRIV';

-- MAKS - Making Science
UPDATE repindex_root_issuers SET verified_competitors = '["LLYC"]' WHERE ticker = 'MAKS';

-- MAP - Mapfre
UPDATE repindex_root_issuers SET verified_competitors = '["CAT", "LDA", "MUTUA-PRIV"]' WHERE ticker = 'MAP';

-- MASOR-PRIV - Grupo MASORANGE
UPDATE repindex_root_issuers SET verified_competitors = '["TEF"]' WHERE ticker = 'MASOR-PRIV';

-- MCM - Miquel y Costas
UPDATE repindex_root_issuers SET verified_competitors = '["IBG"]' WHERE ticker = 'MCM';

-- MEL - Meliá
UPDATE repindex_root_issuers SET verified_competitors = '["AIRBNB-PRIV", "BOOKING-PRIV"]' WHERE ticker = 'MEL';

-- MERC-PRIV - Mercadona
UPDATE repindex_root_issuers SET verified_competitors = '["EROSKI-PRIV", "DIA"]' WHERE ticker = 'MERC-PRIV';

-- META-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["GOOGLE-PRIV", "AMAZON-PRIV"]' WHERE ticker = 'META-PRIV';

-- MFEB - MFE-MediaForEurope
UPDATE repindex_root_issuers SET verified_competitors = '["A3M"]' WHERE ticker = 'MFEB';

-- MRL - Merlin Properties
UPDATE repindex_root_issuers SET verified_competitors = '["COL", "LRE"]' WHERE ticker = 'MRL';

-- MTS - ArcelorMittal
UPDATE repindex_root_issuers SET verified_competitors = '["ACX"]' WHERE ticker = 'MTS';

-- MUTUA-PRIV - Mutua Madrileña
UPDATE repindex_root_issuers SET verified_competitors = '["MAP", "CAT", "LDA"]' WHERE ticker = 'MUTUA-PRIV';

-- MVC - Metrovacesa
UPDATE repindex_root_issuers SET verified_competitors = '["HOME", "AED"]' WHERE ticker = 'MVC';

-- NET - Netex Learning
UPDATE repindex_root_issuers SET verified_competitors = '["PRO"]' WHERE ticker = 'NET';

-- NTGY - Naturgy Energy Group
UPDATE repindex_root_issuers SET verified_competitors = '["IBE", "ELE", "REP"]' WHERE ticker = 'NTGY';

-- OHL - OHLA
UPDATE repindex_root_issuers SET verified_competitors = '["ACS", "FER", "ANA", "SCYR", "FCC-PRIV"]' WHERE ticker = 'OHL';

-- ORY - Oryzon Genomics
UPDATE repindex_root_issuers SET verified_competitors = '["PHM"]' WHERE ticker = 'ORY';

-- PAR - Parlem Telecom
UPDATE repindex_root_issuers SET verified_competitors = '["TEF", "MASOR-PRIV"]' WHERE ticker = 'PAR';

-- PHM - PharmaMar
UPDATE repindex_root_issuers SET verified_competitors = '["GRF", "ALM", "ORY"]' WHERE ticker = 'PHM';

-- PRO - Proeduca Altus
UPDATE repindex_root_issuers SET verified_competitors = '["NET"]' WHERE ticker = 'PRO';

-- PRS - PRISA
UPDATE repindex_root_issuers SET verified_competitors = '["VOC"]' WHERE ticker = 'PRS';

-- PUIG
UPDATE repindex_root_issuers SET verified_competitors = '["ITX", "ADZ"]' WHERE ticker = 'PUIG';

-- PWC-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["ACCENTURE-PRIV", "DELOITTE-PRIV", "EY-PRIV", "KPMG-PRIV"]' WHERE ticker = 'PWC-PRIV';

-- QS - Quirónsalud
UPDATE repindex_root_issuers SET verified_competitors = '["HMH", "HLA", "VIT", "VIA", "HOS", "RS"]' WHERE ticker = 'QS';

-- R4 - Renta 4 Banco
UPDATE repindex_root_issuers SET verified_competitors = '["ALTR"]' WHERE ticker = 'R4';

-- RED - Redeia Corporación
UPDATE repindex_root_issuers SET verified_competitors = '["ENG"]' WHERE ticker = 'RED';

-- RENFE-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["IAG"]' WHERE ticker = 'RENFE-PRIV';

-- REP - Repsol
UPDATE repindex_root_issuers SET verified_competitors = '["MOE.MC", "NTGY"]' WHERE ticker = 'REP';

-- RS - Ribera Salud
UPDATE repindex_root_issuers SET verified_competitors = '["QS"]' WHERE ticker = 'RS';

-- RIO - Bodegas Riojanas
UPDATE repindex_root_issuers SET verified_competitors = '["BIL"]' WHERE ticker = 'RIO';

-- RJF - Reig Jofre
UPDATE repindex_root_issuers SET verified_competitors = '["FAE", "ROVI"]' WHERE ticker = 'RJF';

-- RLIA - Realia Business
UPDATE repindex_root_issuers SET verified_competitors = '["MVC", "HOME", "AED"]' WHERE ticker = 'RLIA';

-- ROVI - Laboratorios Farmacéuticos Rovi
UPDATE repindex_root_issuers SET verified_competitors = '["GRF", "FAE", "RJF"]' WHERE ticker = 'ROVI';

-- SAB - Banco Sabadell
UPDATE repindex_root_issuers SET verified_competitors = '["BBVA", "SAN", "CABK", "BKT", "UNI"]' WHERE ticker = 'SAB';

-- SAN - Banco Santander
UPDATE repindex_root_issuers SET verified_competitors = '["BBVA", "CABK", "SAB", "BKT", "UNI"]' WHERE ticker = 'SAN';

-- SANITAS
UPDATE repindex_root_issuers SET verified_competitors = '["MAP", "ATR"]' WHERE ticker = 'SANITAS';

-- SCYR - Sacyr
UPDATE repindex_root_issuers SET verified_competitors = '["ACS", "FER", "ANA", "FCC-PRIV", "OHL"]' WHERE ticker = 'SCYR';

-- SER - Seresco
UPDATE repindex_root_issuers SET verified_competitors = '["ALT", "IZE"]' WHERE ticker = 'SER';

-- SLR - Solaria
UPDATE repindex_root_issuers SET verified_competitors = '["ANE", "GRE", "EIDF", "ECR"]' WHERE ticker = 'SLR';

-- SOL - Soltec
UPDATE repindex_root_issuers SET verified_competitors = '["SLR"]' WHERE ticker = 'SOL';

-- SQM - Squirrel Media
UPDATE repindex_root_issuers SET verified_competitors = '["SEC", "MAKS"]' WHERE ticker = 'SQM';

-- TEF - Telefónica
UPDATE repindex_root_issuers SET verified_competitors = '["MASOR-PRIV"]' WHERE ticker = 'TEF';

-- TLG - Talgo
UPDATE repindex_root_issuers SET verified_competitors = '["CAF"]' WHERE ticker = 'TLG';

-- TRE - Técnicas Reunidas
UPDATE repindex_root_issuers SET verified_competitors = '["ENO"]' WHERE ticker = 'TRE';

-- TRG - Tubos Reunidos
UPDATE repindex_root_issuers SET verified_competitors = '["TUB"]' WHERE ticker = 'TRG';

-- TUB - Tubacex
UPDATE repindex_root_issuers SET verified_competitors = '["TRG"]' WHERE ticker = 'TUB';

-- UNI - Unicaja Banco
UPDATE repindex_root_issuers SET verified_competitors = '["BBVA", "SAN", "CABK", "SAB", "BKT"]' WHERE ticker = 'UNI';

-- VIA - Viamed Salud
UPDATE repindex_root_issuers SET verified_competitors = '["QS", "HMH", "VIT", "HLA"]' WHERE ticker = 'VIA';

-- VIS - Viscofan
UPDATE repindex_root_issuers SET verified_competitors = '["EBR"]' WHERE ticker = 'VIS';

-- VIT - Vithas
UPDATE repindex_root_issuers SET verified_competitors = '["QS", "HMH", "HLA", "VIA"]' WHERE ticker = 'VIT';

-- VOC - Vocento
UPDATE repindex_root_issuers SET verified_competitors = '["PRS"]' WHERE ticker = 'VOC';

-- AIRBNB-PRIV
UPDATE repindex_root_issuers SET verified_competitors = '["BOOKING-PRIV"]' WHERE ticker = 'AIRBNB-PRIV';

-- ============================================================================
-- Verificación: Mostrar cuántos registros tienen competidores verificados
-- ============================================================================
-- SELECT 
--   COUNT(*) as total_issuers,
--   COUNT(CASE WHEN jsonb_array_length(verified_competitors) > 0 THEN 1 END) as with_competitors,
--   COUNT(CASE WHEN jsonb_array_length(verified_competitors) = 0 THEN 1 END) as without_competitors
-- FROM repindex_root_issuers;
