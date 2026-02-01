
# Plan: Añadir Bibliografía Verificada a la Exportación Individual

## Problema Identificado

El botón "Descargar como informe" en respuestas individuales (componente `MarkdownMessage`) **no incluye** la sección de fuentes verificadas, mientras que la exportación de conversación completa (`downloadAsHtml` en ChatContext) **sí las incluye**.

La diferencia está en que:
- **Exportación completa**: Itera sobre todos los mensajes, extrae `verifiedSources` del metadata, y llama a `generateBibliographyHtml()` 
- **Exportación individual**: La función `generateExportHtml()` no recibe ni usa las fuentes verificadas

## Cambios Requeridos

### 1. Modificar MarkdownMessage (src/components/ui/markdown-message.tsx)

**Añadir props para recibir datos de bibliografía:**

```typescript
interface MarkdownMessageProps {
  content: string;
  showDownload?: boolean;
  languageCode?: string;
  roleName?: string;
  // NUEVAS PROPS:
  verifiedSources?: VerifiedSource[];
  periodFrom?: string;
  periodTo?: string;
}
```

**Pasar las fuentes a generateExportHtml:**

```typescript
const downloadMessage = () => {
  // ...
  const htmlContent = generateExportHtml(
    content, 
    tr, 
    languageCode, 
    roleName,
    verifiedSources,  // NUEVO
    periodFrom,       // NUEVO
    periodTo          // NUEVO
  );
  // ...
};
```

### 2. Modificar generateExportHtml (markdown-message.tsx)

**Actualizar la firma de la función:**

```typescript
function generateExportHtml(
  markdown: string, 
  tr: ChatUITranslations, 
  languageCode: string, 
  roleName?: string,
  verifiedSources?: VerifiedSource[],
  periodFrom?: string,
  periodTo?: string
): string
```

**Añadir el import de generateBibliographyHtml:**

```typescript
import { VerifiedSource, generateBibliographyHtml } from '@/lib/verifiedSourceExtractor';
```

**Insertar la bibliografía antes del footer:**

```html
<main class="content">
  ${bodyContent}
</main>

${generateBibliographyHtml(verifiedSources || [], periodFrom, periodTo)}

<footer class="report-footer">
  ...
</footer>
```

### 3. Modificar ChatMessages (src/components/chat/ChatMessages.tsx)

**Pasar el metadata al MarkdownMessage:**

```tsx
<MarkdownMessage 
  content={message.content} 
  showDownload={!message.isStreaming}
  languageCode={languageCode}
  roleName={message.metadata?.enrichedFromRole ? getRoleById(message.metadata.enrichedFromRole)?.name : undefined}
  // NUEVAS PROPS:
  verifiedSources={message.metadata?.verifiedSources}
  periodFrom={message.metadata?.methodology?.periodFrom}
  periodTo={message.metadata?.methodology?.periodTo}
/>
```

## Flujo de Datos Actualizado

```text
┌─────────────────────────────────────────────────────────────────┐
│  Edge Function (chat-intelligence)                              │
│  ├── Extrae verifiedSources de ChatGPT y Perplexity             │
│  └── Incluye en metadata del mensaje                            │
└───────────────────────┬─────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ChatContext                                                     │
│  ├── message.metadata.verifiedSources                           │
│  └── message.metadata.methodology.periodFrom/periodTo           │
└───────────────────────┬─────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  ChatMessages.tsx                                                │
│  └── Pasa verifiedSources + periodFrom/periodTo a MarkdownMessage│
└───────────────────────┬─────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  MarkdownMessage.tsx                                             │
│  ├── Recibe props con fuentes verificadas                       │
│  └── downloadMessage() → generateExportHtml() con bibliografía  │
└───────────────────────┬─────────────────────────────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│  HTML Exportado Individual                                       │
│  ├── Header corporativo                                          │
│  ├── Contenido del mensaje                                       │
│  ├── 📚 Bibliografía Verificada (NUEVO)                          │
│  │   ├── Menciones de Ventana                                   │
│  │   └── Menciones de Refuerzo                                  │
│  └── Footer + Technical Sheet                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/ui/markdown-message.tsx` | Añadir props, import, y bibliografía en generateExportHtml |
| `src/components/chat/ChatMessages.tsx` | Pasar metadata de fuentes a MarkdownMessage |

## Resultado Esperado

Cuando un usuario haga clic en "Descargar como informe" en cualquier respuesta individual:

1. El HTML generado incluirá la sección "📚 Anexo: Referencias Citadas por las IAs"
2. Las fuentes estarán clasificadas temporalmente (Menciones de Ventana vs Refuerzo)
3. El diseño será idéntico al de la exportación de conversación completa
4. Se mantendrá la política de "Cero Invención" (solo ChatGPT + Perplexity)
