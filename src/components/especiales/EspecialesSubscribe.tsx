import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Mail, Loader2 } from "lucide-react";

interface EspecialesSubscribeProps {
  source?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EspecialesSubscribe({ source = "especiales-index" }: EspecialesSubscribeProps) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setMessage({ text: "Revisa el correo: no parece una dirección válida.", ok: false });
      return;
    }
    if (!consent) {
      setMessage({ text: "Debes aceptar recibir los avisos para poder suscribirte.", ok: false });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("especiales-subscribe", {
        body: { email: trimmed, consent: true, source },
      });

      if (error) {
        setMessage({ text: "No hemos podido completar la suscripción. Inténtalo de nuevo en un momento.", ok: false });
        return;
      }

      switch (data?.status) {
        case "pending":
          setMessage({ text: "Te hemos enviado un correo para confirmar tu suscripción. Revisa tu bandeja (y el spam).", ok: true });
          setEmail("");
          setConsent(false);
          break;
        case "resent":
          setMessage({ text: "Te hemos reenviado el correo de confirmación. Revisa tu bandeja.", ok: true });
          setEmail("");
          setConsent(false);
          break;
        case "already":
          setMessage({ text: "Ya estás apuntado. Te avisaremos de cada nuevo especial.", ok: true });
          setEmail("");
          setConsent(false);
          break;
        default:
          setMessage({ text: "No hemos podido completar la suscripción. Inténtalo de nuevo en un momento.", ok: false });
      }
    } catch {
      setMessage({ text: "No hemos podido completar la suscripción. Inténtalo de nuevo en un momento.", ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                autoComplete="email"
                maxLength={255}
              />
            </div>
            <Button type="submit" disabled={submitting} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Avísame de nuevos especiales
            </Button>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="especiales-consent"
              checked={consent}
              onCheckedChange={(checked) => setConsent(checked === true)}
            />
            <label
              htmlFor="especiales-consent"
              className="text-sm text-muted-foreground leading-snug cursor-pointer"
            >
              Acepto recibir avisos de nuevos especiales de RepIndex y he leído la{" "}
              <Link to="/privacidade" className="underline hover:text-foreground transition-colors">
                política de privacidad
              </Link>
            </label>
          </div>

          {message && (
            <p
              role="status"
              className={message.ok ? "text-sm text-green-700 dark:text-green-400" : "text-sm text-destructive"}
            >
              {message.text}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
