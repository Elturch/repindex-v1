# Bateria de tests del Agente Rix v2

## Tests unitarios por parser

T-P1: "reputacion de Iberdrola" -> entity: {ticker:"IBE", company_name:"Iberdrola"}

T-P2: "Telefonica Germany" -> scopeGuard rechaza, sugiere Telefonica matriz

T-P3: "Megacorp Solutions S.L." -> entity not found, sugiere similares

T-P4: "primer trimestre" -> temporal: {from:"2026-01-01", to:"2026-03-31"}

T-P5: "15 de febrero de 2026" -> temporal: redirect a semana que contiene esa fecha

T-P6: "Grok, Perplexity y Deepseek" -> models: ["Grok","Perplexity","DeepSeek"]

T-P7: "esta semana" -> mode: snapshot

T-P8: "ultimo mes" -> mode: period

T-P9: "Que tiempo hace manana" -> intent: out_of_scope

T-P10: "Reputation of Santander bank" -> entity: {ticker:"SAN", company_name:"Banco Santander"}

## Tests unitarios por skill

T-S1: companyAnalysis con mode=period -> DataPack tiene metrics con mean/median/min/max

T-S2: companyAnalysis con mode=snapshot -> DataPack tiene metrics con valor unico

T-S3: sectorRanking -> DataPack tiene consensus con ranking_position

T-S4: comparison con 2 entidades -> DataPack tiene ambas entidades

T-S5: modelDivergence -> DataPack detalla divergencia inter-modelo

## Tests de integracion end-to-end

T-E1: "me das el balance de ferrovial del primer trimestre" -> mode=period, KPIs con MEDIA PERIODO, narrativa dice "durante Q1" no "esta semana"

T-E2: "reputacion de Iberdrola esta semana" -> mode=snapshot, valor puntual + delta

T-E3: "Telefonica Germany" -> rechaza con mensaje de ambito espanol

T-E4: "Que tiempo hace" -> rechaza como out_of_scope

T-E5: "Compara Iberdrola con EDF" -> genera solo Iberdrola, explica EDF no disponible

T-E6: Conversacion 2 turnos: Turn1="balance de Ferrovial Q1" Turn2="expandir hasta ayer" -> Turn2 hereda Ferrovial

T-E7: "me das el primer semestre del top 5 del ibex-35" -> mode=period, coverage_ratio ~0.61, advertencia datos parciales

T-E8: "Reputation of Santander bank" (ingles) -> genera informe correcto