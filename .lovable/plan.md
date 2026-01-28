
# Plan: Incorporar Insights de Validación Metodológica

## Resumen Ejecutivo

La evaluación externa (8.5/10) destaca fortalezas clave que debemos comunicar mejor y señala áreas que fortalecen la credibilidad del sistema. El plan incorpora estos insights de forma sutil en dos lugares: la página de Metodología pública y el "Anexo Técnico" de letra pequeña que aparece en cada informe del Agente Rix.

---

## Insights Clave a Incorporar

### Fortalezas Validadas (comunicar sin revelar detalles sensibles)

| Insight | Cómo Comunicar | Dónde |
|---------|---------------|-------|
| Consultas machine-to-machine vía API | "Ejecución sistemática vía API" | Metodología + Footer |
| Prompt estandarizado idéntico | "Prompt estructurado e invariable" | Anexo técnico |
| Ejecución semanal sincronizada (domingos) | "Frecuencia semanal homogénea" | Ya está - reforzar |
| 6 modelos con grounding real | Ya comunicado bien | Mantener |
| Precio de acción como ancla | "Variables de contraste con mercado" | Anexo técnico |
| Volumen de menciones recogido | "Señales de cobertura mediática" | Metodología |
| Divergencia como medida de incertidumbre | "σ inter-modelo como incertidumbre epistémica" | Ya está - mejorar redacción |

### Preguntas Abiertas (reconocer honestamente)

| Pregunta | Respuesta Honesta |
|----------|-------------------|
| ¿Correlación con métricas reales? | "En construcción - recogiendo datos de contraste" |
| ¿Ponderación empírica o experta? | "Criterio experto inicial, calibración futura basada en datos" |
| ¿Prompts públicos? | "Estructura pública, contenido propietario" |

---

## Cambios Propuestos

### 1. Página de Metodología (`/metodologia`)

**Nueva sección: "Rigor en la Ejecución"** (después de "Tecnología Nativa IA")

Contenido propuesto:
- **Ejecución sistemática**: "Cada domingo, el sistema ejecuta consultas machine-to-machine vía API con prompts idénticos para las 174 empresas."
- **Reproducibilidad**: "La estandarización elimina sesgos por usuario, contexto o historial de conversación."
- **Variables de contraste**: "Junto al RIX, recogemos precio de cierre semanal (cotizadas) y volumen de menciones Tier-1 como anclas empíricas para validación futura."
- **Calibración continua**: "La ponderación de métricas parte de criterio experto y evolucionará según evidencia estadística conforme madure el dataset."

**Mejora en sección de Divergencia**

Reformular para enfatizar que es una medida de incertidumbre epistémica:
- "Cuando 6 modelos independientes con diferentes arquitecturas, proveedores y datasets coinciden, la señal es robusta. La divergencia alta indica que la realidad informativa está fragmentada."

### 2. Anexo Técnico-Metodológico (`technicalSheetHtml.ts`)

**Nueva sección: "Garantías de Reproducibilidad"**

```text
EJECUCIÓN SISTEMÁTICA
- Frecuencia: Semanal (domingos, 52 ciclos/año)
- Método: API machine-to-machine (sin interfaz de usuario)
- Prompt: Estructurado, idéntico para todos los modelos
- Temperatura: 0 (determinismo máximo)
```

**Nueva sección: "Variables de Contraste"**

```text
VALIDACIÓN CON MERCADO
Para empresas cotizadas:
- Precio de cierre semanal (viernes, fuente: EODHD)
- Mínimo 52 semanas como referencia de volatilidad
Para todas las empresas:
- Volumen de menciones Tier-1 de la semana
- Objetivo: Construir base empírica para calibrar ponderaciones
```

**Mejora en Limitaciones**

Añadir honestamente:
- "La ponderación actual (NVM 15%, DRM 15%, etc.) es criterio experto. La calibración empírica está en desarrollo."
- "Correlación RIX vs. métricas de negocio: en fase de validación (3+ meses de datos recogidos)."

### 3. Footer del Chat (`MethodologyFooter.tsx`)

**Añadir nueva línea de metadata**

Mostrar cuando haya datos de regresión disponibles:
- "Anclaje estadístico: Correlación precio-RIX R² = [valor]%" (solo si hay datos)

**Mejorar nota de divergencia**

Cambiar de:
- "Consenso alto/moderado/divergencia"

A:
- "σ inter-modelo: [valor] → [interpretación de incertidumbre]"

---

## Archivos a Modificar

| Archivo | Cambio Principal |
|---------|------------------|
| `src/pages/Methodology.tsx` | Nueva sección "Rigor en la Ejecución" + mejora divergencia |
| `src/lib/technicalSheetHtml.ts` | Secciones de reproducibilidad y validación con mercado |
| `src/components/chat/MethodologyFooter.tsx` | Línea de anclaje estadístico + reformular divergencia |

---

## Redacción Sutil (ejemplos)

### En Metodología (público)

> **No decir**: "Usamos el prompt 'reputación de empresa X la semana pasada'"
> 
> **Decir**: "El sistema ejecuta consultas estructuradas e invariables cada domingo, garantizando que todas las empresas sean evaluadas con criterios idénticos."

### En Anexo Técnico (letra pequeña)

> **No decir**: "Estamos construyendo validación porque no tenemos todavía"
> 
> **Decir**: "Se recogen variables de contraste (precio de acción, menciones mediáticas) para establecer correlaciones estadísticas conforme madura el dataset longitudinal."

---

## Resultado Esperado

1. **Credibilidad reforzada**: Los puntos fuertes validados externamente se comunican sin revelar propiedad intelectual
2. **Honestidad metodológica**: Las limitaciones reconocidas fortalecen la confianza académica
3. **Preparación para el futuro**: Se documenta que el sistema está diseñado para evolucionar de descriptivo a predictivo
4. **Consistencia**: El mensaje es coherente entre página pública, exports y chat

---

## Secciones Técnicas

### Código para nueva sección en Metodología

```tsx
{/* Rigor en la Ejecución - Nueva sección */}
<section className="py-12 px-4">
  <div className="container mx-auto max-w-4xl">
    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
      <Shield className="h-6 w-6 text-primary" />
      Rigor en la Ejecución
    </h2>
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-3">🔄 Ejecución Sistemática</h3>
          <p className="text-sm text-muted-foreground">
            Cada domingo, el sistema ejecuta consultas machine-to-machine 
            vía API con prompts estructurados e invariables para todas 
            las empresas del censo.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-3">📊 Variables de Contraste</h3>
          <p className="text-sm text-muted-foreground">
            Para empresas cotizadas: precio de cierre semanal. 
            Para todas: volumen de menciones Tier-1. Estas anclas 
            empíricas permiten validación estadística futura.
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</section>
```

### HTML para Anexo Técnico

```html
<h4>Garantías de Reproducibilidad</h4>
<p>
  <strong>Ejecución:</strong> API machine-to-machine (sin interfaz de usuario) | 
  <strong>Frecuencia:</strong> Semanal (domingos) | 
  <strong>Prompt:</strong> Estructurado e invariable | 
  <strong>Temperatura:</strong> 0 (determinismo máximo). 
  Esta arquitectura elimina sesgos por contexto, usuario o historial de conversación.
</p>

<h4>Variables de Contraste (Validación en Construcción)</h4>
<p>
  El sistema recoge variables empíricas para calibración futura: 
  <strong>precio de cierre semanal</strong> (133 cotizadas, fuente: EODHD) y 
  <strong>volumen de menciones Tier-1</strong> (proxy: NVM agregado). 
  La ponderación actual es criterio experto; evolucionará según evidencia estadística.
</p>
```
