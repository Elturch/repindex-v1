

# Plan: Transformar Agente Comercial — De Análisis Técnico a Narrativa de Venta

## Problema Actual vs. Lo Que Necesitas

| Ahora (INCORRECTO) | Lo que necesitas (CORRECTO) |
|-------------------|----------------------------|
| Hace un análisis técnico de datos RIX | **Reflexiona sobre la posición de la empresa** y crea NECESIDAD de RepIndex |
| Muestra métricas y puntuaciones | **Construye argumentos de venta** adaptados al perfil (CEO ve riesgo, CMO ve oportunidad de marca) |
| Preguntas genéricas al final | **Preguntas "imposibles"** que solo se pueden formular teniendo datos RepIndex |
| Botón "Crear Presentación" genera texto | **Botón para descargar PPTX** real con plantilla RepIndex.ai |

---

## Cambios Propuestos

### 1. System Prompt Completamente Nuevo (Edge Function)

El prompt actual pide un "análisis comercial". Hay que reescribirlo para que:

- **NO analice datos** → Use los datos como ARGUMENTO para crear la necesidad
- **Genere reflexiones estratégicas** desde la perspectiva del perfil
- **Cree tensión comercial**: "Sin RepIndex no puedes ver esto, y tus competidores sí"
- **Sugiera preguntas "reveladoras"** que demuestran el valor de tener acceso a RepIndex

**Nuevo enfoque del prompt:**

```markdown
## TU MISIÓN (CRÍTICA)

NO ERES UN ANALISTA. Eres un VENDEDOR ESTRATÉGICO.

Tu trabajo NO es presentar datos. Tu trabajo es usar los datos como EVIDENCIA 
para construir una narrativa que haga que el cliente NECESITE contratar RepIndex.

### LO QUE DEBES HACER:

1. **REFLEXIONAR** sobre la posición de la empresa en el ecosistema algorítmico
   - ¿Qué implica para el CEO/CMO/DirCom/Compliance lo que revelan los datos?
   - ¿Qué riesgos invisibles hay que el cliente no puede ver sin RepIndex?
   - ¿Qué oportunidades está dejando escapar?

2. **CREAR NECESIDAD** - El cliente debe sentir que:
   - "No sabía que esto estaba pasando con mi empresa"
   - "Mis competidores pueden estar viendo esto y yo no"
   - "Cada semana que pasa sin actuar, la situación empeora"

3. **ADAPTAR AL PERFIL**:
   - CEO: Riesgo estratégico, valoración, ventaja competitiva
   - CMO: Posicionamiento frente a competidores, oportunidades de diferenciación
   - DirCom: Narrativas negativas que no controla, alertas de crisis latentes
   - Compliance: Exposición a riesgos ESG, gobernanza percibida

4. **PREGUNTAS "IMPOSIBLES"** (al final)
   Genera 2-3 preguntas que:
   - SOLO se pueden formular si tienes acceso a datos RepIndex
   - Son específicas de esta empresa (no genéricas)
   - Demuestran el valor de la herramienta
   
   Ejemplo: "¿Cómo ha evolucionado la percepción de gobernanza de Telefónica 
   en las últimas 8 semanas comparado con Vodafone y Orange?"
   
   (Esta pregunta es "imposible" sin RepIndex porque nadie más tiene esos datos)

### LO QUE NO DEBES HACER:
- NO hagas un "análisis" técnico
- NO listes métricas como si fueras un informe
- NO uses acrónimos técnicos
- NO seas neutro — tienes que generar urgencia comercial
```

### 2. Preguntas "Imposibles" (Edge Function)

Cambiar la sección de "Evidencias para anexar" por:

```markdown
## PREGUNTAS REVELADORAS PARA EL AGENTE RIX

Al final de cada respuesta, genera 2-3 preguntas que:
1. Sean ESPECÍFICAS para esta empresa y su situación
2. SOLO puedan formularse con acceso a datos RepIndex
3. Demuestren al cliente el valor de tener esta información

Formato:
📊 **Preguntas que solo puedes hacer con RepIndex:**

1. "[Pregunta específica que revela un insight oculto]"
   → Por qué importa: [breve explicación de qué revelaría la respuesta]

2. "[Pregunta comparativa con competidores concretos]"
   → Por qué importa: [valor estratégico de la respuesta]
   
3. "[Pregunta sobre tendencia temporal o señal débil]"
   → Por qué importa: [riesgo u oportunidad que detectaría]
```

### 3. Botón para Generar PPTX Real (UI)

Añadir funcionalidad para exportar a PowerPoint real usando una librería como `pptxgenjs`:

```typescript
// Nueva función para generar PPTX
const generatePPTX = async () => {
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  
  // Configurar tema RepIndex
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'RepIndex';
  pres.title = `Propuesta Comercial - ${metadata?.company}`;
  
  // Slide 1: Portada
  const slide1 = pres.addSlide();
  slide1.addImage({ path: '/repindex-logo.png', x: 8.5, y: 0.3, w: 1.2, h: 0.6 });
  slide1.addText(metadata?.company || 'Empresa', { 
    x: 0.5, y: 2, w: 9, h: 1.5, 
    fontSize: 44, fontFace: 'Inter', color: '7C3AED', bold: true 
  });
  slide1.addText('Análisis de Percepción Algorítmica', { 
    x: 0.5, y: 3.5, w: 9, h: 0.8, 
    fontSize: 24, fontFace: 'Inter', color: '1F2937' 
  });
  
  // Slides de contenido valorado (4-5 estrellas)
  const highRatedMessages = messages
    .map((msg, idx) => ({ msg, idx }))
    .filter(({ msg, idx }) => msg.role === 'assistant' && messageRatings[idx] >= 4);
  
  highRatedMessages.forEach(({ msg }, i) => {
    const slide = pres.addSlide();
    // Parsear contenido y añadir texto con estilo RepIndex
    slide.addText(msg.content.slice(0, 1000), {
      x: 0.5, y: 0.5, w: 9, h: 5,
      fontSize: 14, fontFace: 'Inter', color: '1F2937',
      valign: 'top'
    });
  });
  
  // Slide final: CTA
  const slideCTA = pres.addSlide();
  slideCTA.addShape('rect', { 
    x: 2, y: 2, w: 6, h: 2, 
    fill: { color: '7C3AED' }, 
    line: { color: '7C3AED' } 
  });
  slideCTA.addText('Siguiente paso: Demo personalizada', { 
    x: 2, y: 2.7, w: 6, h: 0.6, 
    fontSize: 24, fontFace: 'Inter', color: 'FFFFFF', align: 'center', bold: true 
  });
  
  // Descargar
  pres.writeFile({ fileName: `RepIndex_${metadata?.company}_Propuesta.pptx` });
};
```

**Nuevo botón en la UI:**

```tsx
<Button 
  onClick={generatePPTX}
  className="w-full bg-gradient-to-r from-purple-600 to-purple-800"
>
  <Download className="h-4 w-4 mr-2" />
  Descargar PPTX ({highRatedCount} slides)
</Button>
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/sales-intelligence-chat/index.ts` | Reescribir System Prompt: de "analista" a "vendedor estratégico" que crea necesidad |
| `src/components/admin/SalesIntelligencePanel.tsx` | Añadir `pptxgenjs`, botón de descarga PPTX, mejorar extracción de preguntas |
| `package.json` | Añadir dependencia `pptxgenjs` |

---

## Ejemplo de Output Esperado

**ANTES (incorrecto):**
```
Telefónica obtiene un RIX de 71/100. Las métricas son:
- NVM: 68
- CEM: 45
- GAM: 72
...
```

**DESPUÉS (correcto):**
```
Cuando un inversor institucional pregunta a ChatGPT sobre el sector telco español, 
Telefónica aparece... pero no como líder. Mientras Vodafone es descrita como 
"innovadora en 5G", Telefónica arrastra menciones a "reestructuración" y "deuda".

Para un CMO, esto significa que cada euro invertido en publicidad compite contra 
un viento en contra narrativo que la empresa ni siquiera sabe que existe. 
Es como pintar la fachada de una casa mientras el tejado tiene goteras: 
el esfuerzo se pierde.

Lo preocupante no es la situación actual — es que cada semana que pasa sin 
monitorizar esto, la narrativa negativa se consolida más. Y mientras tanto, 
¿alguien en Telefónica sabe lo que dicen las 6 IAs principales sobre ellos 
esta semana? Sin RepIndex, la respuesta es no.

📊 **Preguntas que solo puedes hacer con RepIndex:**

1. "¿Cómo ha cambiado la narrativa de 'innovación' de Telefónica en las últimas 
   12 semanas comparado con Vodafone?"
   → Revelaría si las campañas de comunicación están teniendo impacto real

2. "¿Qué IA es más crítica con Telefónica en temas de ESG?"
   → Permitiría focalizar esfuerzos de comunicación en los canales más hostiles

3. "¿Hay alguna señal débil de controversia emergente que aún no ha saltado 
   a prensa tradicional?"
   → Sistema de alerta temprana que solo RepIndex puede ofrecer
```

---

## Flujo Completo

```text
1. Admin selecciona empresa + perfil (CEO/CMO/DirCom/Compliance)
2. Agente genera REFLEXIÓN ESTRATÉGICA (no análisis técnico)
   → Crea urgencia y necesidad de RepIndex
   → Incluye preguntas "imposibles" al final
3. Admin valora con ⭐⭐⭐⭐⭐
4. Admin refina: "Hazlo más agresivo" / "Añade competidores"
5. Cuando hay suficiente material valorado (4-5⭐):
   → Botón [📥 Descargar PPTX] genera archivo PowerPoint real
   → Plantilla RepIndex: fondo blanco, púrpura, tipografía Inter
   → Preguntas para Agente Rix copiables para anexar
```

